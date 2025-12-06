import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import * as crypto from "crypto";
import { generateCategoryMockup, editImage } from "./nanobanana";
import { GuestMockupRequest, GuestMockupResponse, SendGuestMockupsRequest } from "./types";

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
        const { artworkUrl } = req.body as GuestMockupRequest;

        if (!artworkUrl) {
            res.status(400).json({ ok: false, error: "Missing artworkUrl" });
            return;
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

        // 2. Upload to Storage (to avoid Firestore size limits)
        let sessionId = "";

        // We create a session ID first to organize storage
        // Actually, let's just use UUID or random string if we don't have doc ID yet.
        // Or we can create the doc ref first.
        const sessionRef = db.collection("guest_sessions").doc();
        sessionId = sessionRef.id;

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
                artworkUrl
            });
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

        if (sessionId) {
            // Upstream preferred way: update the existing session
            await db.collection("guest_sessions").doc(sessionId).update({
                email,
                status: "pending_email",
                emailRequestsAt: FieldValue.serverTimestamp()
            });
            // Also log for debugging
            const sessionDoc = await db.collection("guest_sessions").doc(sessionId).get();
            const sessionData = sessionDoc.data();
            const urls = sessionData?.results?.map((r: any) => r.url) || [];
            logger.info(`[MOCK EMAIL] Would send email to ${email} with ${urls.length} mockups (session ${sessionId}).`);

        } else if (mockupUrls && mockupUrls.length > 0) {
            // Legacy way (or fallback)
            await db.collection("guest_mockups").add({
                email,
                mockupUrls,
                createdAt: FieldValue.serverTimestamp(),
                status: "pending_email"
            });
            logger.info(`[MOCK EMAIL] Would send email to ${email} with ${mockupUrls.length} mockups (legacy).`);
        } else {
            res.status(400).json({ ok: false, error: "Missing sessionId or mockupUrls" });
            return;
        }

        res.json({ ok: true });
    } catch (error: any) {
        logger.error("sendGuestMockups error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

app.post("/createCheckoutSession", async (req, res) => {
    try {
        const { priceId, successUrl, cancelUrl } = req.body;
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

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

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            mode: "subscription",
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: { firebaseUid: uid },
        });

        res.json({ ok: true, sessionId: session.id, url: session.url });
    } catch (error: any) {
        logger.error("createCheckoutSession error", error);
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
