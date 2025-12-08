import { onRequest } from "firebase-functions/v2/https";
import "dotenv/config";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";
import { generateCategoryMockup, editImage } from "./nanobanana";
import { GuestMockupRequest, GuestMockupResponse, SendGuestMockupsRequest } from "./types";
import { emailService } from "./emailService";

admin.initializeApp({
    projectId: "situ-477910",
    storageBucket: "situ-477910.firebasestorage.app"
});
const db = admin.firestore();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

app.post("/editMockup", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const { mockupId, editPrompt } = req.body;

        // Check credits
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();
        const credits = userDoc.data()?.credits || 0;

        if (credits < 1) {
            res.status(403).json({ ok: false, error: "Insufficient credits" });
            return;
        }

        // Get mockup
        const mockupRef = db.collection("users").doc(uid).collection("mockups").doc(mockupId);
        const mockupDoc = await mockupRef.get();
        if (!mockupDoc.exists) {
            res.status(404).json({ ok: false, error: "Mockup not found" });
            return;
        }
        const mockupUrl = mockupDoc.data()?.url;

        // Fetch image
        const imageRes = await fetch(mockupUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        const mimeType = imageRes.headers.get("content-type") || "image/jpeg";

        // Call NanoBanana edit
        const result = await editImage({
            baseInline: { data: base64, mimeType },
            prompt: editPrompt,
            modelId: process.env.NANOBANANA_PRO_MODEL_ID,
        });

        // Update Firestore
        await mockupRef.update({
            url: result.url,
            updatedAt: FieldValue.serverTimestamp(),
        });

        // Deduct credit
        await userRef.update({
            credits: FieldValue.increment(-1),
        });

        res.json({ ok: true, url: result.url });
    } catch (error: any) {
        logger.error("editMockup error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
app.get("/health", (req, res) => {
    res.json({ ok: true, service: "situ-api", timestamp: new Date().toISOString() });
});

async function uploadDataUrl(dataUrl: string, path: string): Promise<string> {
    const bucket = admin.storage().bucket();
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

    if (!matches || matches.length !== 3) {
        throw new Error('Invalid data URL');
    }

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const file = bucket.file(path);

    await file.save(buffer, {
        metadata: { contentType: mimeType }
    });

    // Use Firebase Storage Download Token (works for UBLA & Local Emulator without Service Account)
    const token = crypto.randomUUID();
    await file.setMetadata({
        metadata: {
            firebaseStorageDownloadTokens: token,
        }
    });

    // Construct the public URL manually
    // Format: https://firebasestorage.googleapis.com/v0/b/[bucket]/o/[path]?alt=media&token=[token]
    const encodedPath = encodeURIComponent(path).replace(/\//g, "%2F");
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;

    return url;
}

app.post("/generateGuestMockups", async (req, res) => {
    try {
        let { artworkUrl } = req.body as GuestMockupRequest;

        if (!artworkUrl) {
            res.status(400).json({ ok: false, error: "Missing artworkUrl" });
            return;
        }

        // Create a session ID first
        const sessionRef = db.collection("guest_sessions").doc();
        const sessionId = sessionRef.id;

        // If artworkUrl is a base64 Data URL, upload it to Storage first
        // to avoid hitting Firestore 1MB limit.
        if (artworkUrl.startsWith("data:")) {
            try {
                const storagePath = `guest_sessions/${sessionId}/original_artwork_${Date.now()}.png`;
                artworkUrl = await uploadDataUrl(artworkUrl, storagePath);
                logger.info(`[generateGuestMockups] Uploaded base64 artwork to ${artworkUrl}`);
            } catch (err: any) {
                logger.error("[generateGuestMockups] Failed to upload input artwork", err);
                // We could fail hard, or try to proceed if it's small enough (but likely it's not)
                res.status(500).json({ ok: false, error: "Failed to process artwork image." });
                return;
            }
        }

        // Generate mockups
        const tempResults: { category: string; dataUrl: string }[] = [];
        const results: GuestMockupResponse["results"] = [];
        const errors: GuestMockupResponse["errors"] = [];

        // For guest, we generate 4 standard mockups
        const categories = ["wall", "prints", "wearable", "phone"] as const;

        // 1. Generate all (get Data URLs)
        for (const category of categories) {
            try {
                const dataUrl = await generateCategoryMockup(category, artworkUrl);
                if (dataUrl) {
                    tempResults.push({ category, dataUrl });
                } else {
                    errors.push({ category, message: "Generation failed" });
                }
            } catch (error: any) {
                logger.error(`Error generating ${category}:`, error);
                errors.push({ category, message: error.message });
            }
        }

        // 2. Upload generated mockups to Storage
        for (const item of tempResults) {
            try {
                const storagePath = `guest_sessions/${sessionId}/${item.category}_${Date.now()}.png`;
                const storageUrl = await uploadDataUrl(item.dataUrl, storagePath);
                results.push({ category: item.category as any, url: storageUrl });
            } catch (error: any) {
                logger.error(`Error uploading ${item.category}:`, error);
                errors.push({ category: item.category as any, message: `Upload failed: ${error.message}` });
            }
        }

        // 3. Store guest session with STORAGE URLs (small strings)
        if (results.length > 0) {
            await sessionRef.set({
                results,
                createdAt: FieldValue.serverTimestamp(),
                status: "generated",
                artworkUrl // Now this is a short https:// URL
            });
        } else {
            res.status(500).json({
                ok: false,
                error: "All generations failed.",
                errors
            });
            return;
        }

        const response: GuestMockupResponse = {
            ok: true,
            sessionId: results.length > 0 ? sessionId : undefined,
            results,
            errors,
        };

        res.json(response);
    } catch (error: any) {
        logger.error("generateGuestMockups error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});



app.post("/sendGuestMockups", async (req, res) => {
    try {
        const { email, mockupUrls, sessionId } = req.body as SendGuestMockupsRequest;

        if (!email) {
            res.status(400).json({ ok: false, error: "Missing email" });
            return;
        }

        let urlsToSend: string[] = [];

        if (sessionId) {
            // Upstream preferred way: update the existing session
            await db.collection("guest_sessions").doc(sessionId).update({
                email,
                status: "pending_email",
                emailRequestsAt: FieldValue.serverTimestamp()
            });

            const sessionDoc = await db.collection("guest_sessions").doc(sessionId).get();
            const sessionData = sessionDoc.data();
            urlsToSend = sessionData?.results?.map((r: any) => r.url) || [];

        } else if (mockupUrls && mockupUrls.length > 0) {
            // Legacy way (or fallback)
            urlsToSend = mockupUrls;

            // Also store for analytics if needed
            await db.collection("guest_mockups").add({
                email,
                mockupUrls,
                createdAt: FieldValue.serverTimestamp(),
                status: "sent_email"
            });
        } else {
            res.status(400).json({ ok: false, error: "Missing sessionId or mockupUrls" });
            return;
        }

        if (urlsToSend.length === 0) {
            res.status(400).json({ ok: false, error: "No mockups to send." });
            return;
        }

        // Call Email Service
        await emailService.sendGuestMockups({
            email,
            mockupUrls: urlsToSend
        });

        // Update status if session exists
        if (sessionId) {
            await db.collection("guest_sessions").doc(sessionId).update({
                status: "email_sent",
                emailSentAt: FieldValue.serverTimestamp()
            });
        }

        res.json({ ok: true });
    } catch (error: any) {
        logger.error("sendGuestMockups error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/createCheckoutSession", async (req, res) => {
    try {
        const { plan, successUrl, cancelUrl } = req.body;

        logger.info(`[createCheckoutSession] Request received for plan: ${plan}`);

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // Map plan to Price ID from Env
        let priceId = "";
        // Strict mapping based on user request
        switch (plan) {
            case "monthly":
                priceId = process.env.STRIPE_PRICE_MONTHLY_ID || "";
                break;
            case "quarterly":
                priceId = process.env.STRIPE_PRICE_QUARTERLY_ID || "";
                break;
            case "sixMonths":
                priceId = process.env.STRIPE_PRICE_SIX_MONTHS_ID || "";
                break;
            default:
                logger.error(`[createCheckoutSession] Invalid plan: ${plan}`);
                res.status(400).json({ ok: false, error: "Invalid plan selected" });
                return;
        }

        if (!priceId) {
            logger.error(`[createCheckoutSession] Price ID not found for plan: ${plan}. 
                Env Checks:
                MONTHLY: ${process.env.STRIPE_PRICE_MONTHLY_ID} (${process.env.STRIPE_PRICE_MONTHLY_ID ? 'Set' : 'Missing'})
                QUARTERLY: ${process.env.STRIPE_PRICE_QUARTERLY_ID} (${process.env.STRIPE_PRICE_QUARTERLY_ID ? 'Set' : 'Missing'})
                SIXMONTHS: ${process.env.STRIPE_PRICE_SIX_MONTHS_ID} (${process.env.STRIPE_PRICE_SIX_MONTHS_ID ? 'Set' : 'Missing'})
            `);
            res.status(500).json({ ok: false, error: "Server configuration error: Price ID missing" });
            return;
        }

        logger.info(`[createCheckoutSession] Using Price ID: ${priceId}`);

        // ... rest of function ...


        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();

        let customerId = userData?.stripeCustomerId;

        if (!customerId) {
            const customer = await stripe.customers.create({
                email: decodedToken.email,
                metadata: { firebaseUid: uid },
            });
            customerId = customer.id;
            await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
        }

        // Use Env vars for URLs, with fallback to request body for flexibility (though plan implies strict env usage)
        const txnSuccessUrl = process.env.STRIPE_SUCCESS_URL || successUrl || "http://localhost:5174/member/studio";
        const txnCancelUrl = process.env.STRIPE_CANCEL_URL || cancelUrl || "http://localhost:5174/pricing";

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "subscription",
            success_url: `${txnSuccessUrl}?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: txnCancelUrl,
            metadata: { firebaseUid: uid },
        });

        logger.info(`[createCheckoutSession] Session created: ${session.id}`);

        res.json({ ok: true, sessionId: session.id, url: session.url });
    } catch (error: any) {
        logger.error("createCheckoutSession error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/claimGuestSession", async (req, res) => {
    try {
        const { sessionId } = req.body;

        logger.info(`[claimGuestSession] Request received for session: ${sessionId}`);

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const email = decodedToken.email;

        if (!sessionId) {
            res.status(400).json({ ok: false, error: "Missing sessionId" });
            return;
        }

        const sessionRef = db.collection("guest_sessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
            res.status(404).json({ ok: false, error: "Guest session not found" });
            return;
        }

        const sessionData = sessionDoc.data();
        if (sessionData?.claimedBy) {
            res.status(400).json({ ok: false, error: "Session already claimed" });
            return;
        }

        // Verify email match if possible (optional but good for security)
        // If guest session has no email (didn't send yet), we might let them claim if they just created it?
        // But usually they enter email to send.
        if (sessionData?.email && sessionData.email !== email) {
            logger.warn(`[claimGuestSession] Email mismatch. Session: ${sessionData.email}, User: ${email}`);
            // We'll allow it for now as user might sign up with different email, but it's a bit risky.
            // User requirement: "If guestSessionId is present and the guest session’s email matches the signup email"
            // So we MUST enforce it.
            if (sessionData.email.toLowerCase() !== email?.toLowerCase()) {
                res.status(403).json({ ok: false, error: "Email mismatch. Please sign up with the same email used in Guest Studio." });
                return;
            }
        }

        const artworkUrl = sessionData?.artworkUrl;
        const results = sessionData?.results || [];

        logger.info(`[claimGuestSession] Found ${results.length} mockups to allow copy.`);

        // 1. Copy artwork
        if (artworkUrl) {
            logger.info(`[claimGuestSession] Copying artwork: ${artworkUrl}`);
            await db.collection("users").doc(uid).collection("artworks").add({
                url: artworkUrl,
                name: "Imported from Guest Studio",
                createdAt: FieldValue.serverTimestamp(),
            });
        } else {
            logger.warn("[claimGuestSession] No artworkUrl found in session.");
        }

        // 2. Copy mockups
        if (results.length > 0) {
            const batch = db.batch();
            for (const item of results) {
                const mockupRef = db.collection("users").doc(uid).collection("mockups").doc(); // Auto-ID
                batch.set(mockupRef, {
                    category: item.category,
                    url: item.url,
                    artworkUrl: artworkUrl, // Link loosely
                    createdAt: FieldValue.serverTimestamp(),
                    importedFromGuest: true
                });
            }
            await batch.commit();
            logger.info(`[claimGuestSession] Copied ${results.length} mockups to user text.`);
        } else {
            logger.warn("[claimGuestSession] No results array found to copy.");
        }

        // 3. Mark session as claimed
        await sessionRef.update({
            claimedBy: uid,
            claimedAt: FieldValue.serverTimestamp()
        });

        logger.info(`[claimGuestSession] Successfully claimed session ${sessionId} for user ${uid}`);

        res.json({ ok: true, copiedCount: results.length });

    } catch (error: any) {
        logger.error("claimGuestSession error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/stripeWebhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig as string, webhookSecret as string);
    } catch (err: any) {
        logger.error("Webhook signature verification failed.", err);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    try {
        if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            const usersSnapshot = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();

            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const priceId = subscription.items.data[0].price.id;
                let plan = "monthly";
                let creditsToAdd = 0;

                if (priceId === process.env.STRIPE_PRICE_MONTHLY) {
                    plan = "monthly";
                    creditsToAdd = 100;
                } else if (priceId === process.env.STRIPE_PRICE_3MONTH) {
                    plan = "3month";
                    creditsToAdd = 300;
                } else if (priceId === process.env.STRIPE_PRICE_6MONTH) {
                    plan = "6month";
                    creditsToAdd = 600;
                }

                await userDoc.ref.update({
                    plan,
                    credits: FieldValue.increment(creditsToAdd),
                });
            }
        }

        res.json({ received: true });
    } catch (err: any) {
        logger.error("Webhook handler error", err);
        res.status(500).send(`Webhook Error: ${err.message}`);
    }
});

// ... existing endpoints ...

app.post("/generateMemberMockups", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const { artworkId, artworkUrl: providedArtworkUrl, product, aspectRatio, numVariations = 1, customPrompt } = req.body;

        if ((!artworkId && !providedArtworkUrl) || !product) {
            res.status(400).json({ ok: false, error: "Missing artworkId/URL or product" });
            return;
        }

        // Check credits
        const userRef = db.collection("users").doc(uid);
        let credits = 0;

        try {
            console.log(`[MEMBER] Checking credits for user ${uid}`);
            const userDoc = await userRef.get();
            credits = userDoc.data()?.credits || 0;
            console.log(`[MEMBER] User has ${credits} credits`);
        } catch (err) {
            console.error(`[MEMBER] Failed to check credits: ${err}`);
            res.status(500).json({ ok: false, error: "Failed to check credits" });
            return;
        }

        // Cost is 1 credit per variation
        const cost = numVariations;

        if (credits < cost) {
            console.log(`[MEMBER] Insufficient credits: ${credits} < ${cost}`);
            res.status(403).json({ ok: false, error: "Insufficient credits" });
            return;
        }

        // Get artwork URL
        let artworkUrl = providedArtworkUrl;
        if (!artworkUrl) {
            try {
                console.log(`[MEMBER] Fetching artwork ${artworkId}`);
                const artworkDoc = await db.collection("users").doc(uid).collection("artworks").doc(artworkId).get();
                if (!artworkDoc.exists) {
                    console.log(`[MEMBER] Artwork not found`);
                    res.status(404).json({ ok: false, error: "Artwork not found" });
                    return;
                }
                artworkUrl = artworkDoc.data()?.url;
                console.log(`[MEMBER] Artwork URL found: ${artworkUrl}`);
            } catch (err) {
                console.error(`[MEMBER] Failed to fetch artwork from DB: ${err}`);
                res.status(500).json({ ok: false, error: "Failed to fetch artwork info" });
                return;
            }
        } else {
            console.log(`[MEMBER] Using provided artwork URL`);
        }

        const results: Array<{ id: string; url: string; category: string }> = [];
        const errors: Array<{ category: string; message: string }> = [];

        // Generate variations for the selected product
        const tasks = [];
        for (let i = 0; i < numVariations; i++) {
            tasks.push((async () => {
                try {
                    console.log(`Generating ${product} variation ${i + 1}...`);
                    const dataUrl = await generateCategoryMockup(product, artworkUrl, customPrompt, aspectRatio);

                    if (dataUrl) {
                        let mockupId = `temp_${Date.now()}_${i}`;
                        try {
                            // Upload to Storage
                            console.log(`[MEMBER] Uploading mockup to Storage...`);
                            const storagePath = `users/${uid}/mockups/${Date.now()}_${product}_${i}.png`;
                            const storageUrl = await uploadDataUrl(dataUrl, storagePath);

                            console.log(`[MEMBER] Saving mockup to Firestore...`);
                            const mockupRef = await db.collection("users").doc(uid).collection("mockups").add({
                                category: product,
                                url: storageUrl, // Save storage URL instead of data URL
                                artworkId,
                                createdAt: FieldValue.serverTimestamp(),
                                variation: i + 1,
                                aspectRatio: aspectRatio || "1:1",
                                customPrompt: customPrompt || null
                            });
                            mockupId = mockupRef.id;
                            console.log(`[MEMBER] Mockup saved with ID: ${mockupId}`);

                            results.push({ id: mockupId, url: storageUrl, category: product });
                        } catch (err) {
                            console.error(`[MEMBER] Failed to save mockup: ${err}`);
                            // If upload worked but firestore failed, we might still want to return success? 
                            // Or better to fail so user knows? 
                            // For now, if Firestore fails, we consider it a failure.
                        }
                    } else {
                        errors.push({ category: product, message: "Generation failed" });
                    }
                } catch (err: any) {
                    logger.error(`Error generating ${product}:`, err);
                    errors.push({ category: product, message: err.message });
                }
            })());
        }

        await Promise.all(tasks);

        // Deduct credits
        if (results.length > 0) {
            try {
                console.log(`[MEMBER] Deducting ${results.length} credits`);
                await userRef.update({
                    credits: FieldValue.increment(-results.length)
                });
                console.log(`[MEMBER] Credits deducted`);
            } catch (err) {
                console.error(`[MEMBER] Failed to deduct credits: ${err}`);
            }
        }

        res.json({ ok: true, results, errors, remainingCredits: credits - results.length });

    } catch (error: any) {
        logger.error("generateMemberMockups error", error);
        console.error("[MEMBER] Critical error:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

export const api = onRequest({ memory: "1GiB", timeoutSeconds: 300 }, app);

// Temporary cleanup function
app.post("/nukeEverything", async (req, res) => {
    try {
        const { confirmation } = req.body;
        if (confirmation !== "I_AM_SURE_NUKE_DEV_DATA") {
            res.status(400).json({ ok: false, error: "Invalid confirmation code" });
            return;
        }

        logger.warn("[NUKE] Starting database wipe...");

        // 1. Delete all users in Firestore and Auth
        const usersSnap = await db.collection("users").get();
        for (const doc of usersSnap.docs) {
            const uid = doc.id;
            // recursive delete subcollections usually requires tools, but we can try simple loop
            const mockupsSnap = await db.collection("users").doc(uid).collection("mockups").get();
            const artworksSnap = await db.collection("users").doc(uid).collection("artworks").get();

            const batch = db.batch();
            mockupsSnap.docs.forEach(d => batch.delete(d.ref));
            artworksSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(doc.ref);
            await batch.commit();

            try {
                await admin.auth().deleteUser(uid);
                logger.info(`[NUKE] Deleted user ${uid}`);
            } catch (e) {
                logger.error(`[NUKE] Failed to delete auth user ${uid}`, e);
            }
        }

        // 2. Delete all Guest Sessions
        const sessionsSnap = await db.collection("guest_sessions").get();
        const batchSessions = db.batch();
        sessionsSnap.docs.forEach(d => batchSessions.delete(d.ref));
        await batchSessions.commit();
        logger.info("[NUKE] Deleted guest sessions.");

        res.json({ ok: true, message: "Nuked." });
    } catch (error: any) {
        logger.error("Nuke error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
// Firestore Notification Trigger for Welcome Email
exports.onUserCreated = onDocumentCreated("users/{uid}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        logger.warn("[onUserCreated] No data associated with the event");
        return;
    }
    const userData = snapshot.data();
    const email = userData.email;
    const displayName = userData.displayName;

    if (email) {
        logger.info(`[onUserCreated] New user created: ${email}. Sending welcome email.`);
        await emailService.sendWelcomeEmail(email, displayName);
    } else {
        logger.warn(`[onUserCreated] User ${event.params.uid} has no email.`);
    }
});
