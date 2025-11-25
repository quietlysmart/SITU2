import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import express from "express";
import cors from "cors";
import Stripe from "stripe";
import * as admin from "firebase-admin";
import { generateCategoryMockup, editImage } from "./nanobanana";
import { emailService } from "./emailService";
import { GuestMockupRequest, GuestMockupResponse, SendGuestMockupsRequest } from "./types";

admin.initializeApp();
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
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Deduct credit
        await userRef.update({
            credits: admin.firestore.FieldValue.increment(-1),
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

app.post("/generateGuestMockups", async (req, res) => {
    try {
        const { artworkUrl, categories } = req.body as GuestMockupRequest;

        if (!artworkUrl || !categories || categories.length === 0) {
            res.status(400).json({ ok: false, error: "Missing artworkUrl or categories" });
            return;
        }

        const matches = artworkUrl.match(/^data:(.+);base64,(.+)$/);
        if (!matches) {
            res.status(400).json({ ok: false, error: "Invalid data URL" });
            return;
        }
        const mimeType = matches[1];
        const data = matches[2];

        const results = [];
        const errors = [];

        const promises = categories.map(async (category) => {
            try {
                const result = await generateCategoryMockup({
                    category,
                    artworkInline: { data, mimeType },
                });
                return { category, url: result.url, error: null };
            } catch (err: any) {
                logger.error(`Error generating ${category}:`, err);
                return { category, url: null, error: err.message || "Generation failed" };
            }
        });

        const generationResults = await Promise.all(promises);

        for (const res of generationResults) {
            if (res.url) {
                results.push({ category: res.category, url: res.url });
            } else {
                errors.push({ category: res.category, message: res.error });
            }
        }

        const response: GuestMockupResponse = {
            ok: true,
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
        const { email, mockupUrls } = req.body as SendGuestMockupsRequest;

        if (!email || !mockupUrls || mockupUrls.length === 0) {
            res.status(400).json({ ok: false, error: "Missing email or mockupUrls" });
            return;
        }

        await emailService.sendGuestMockups({ email, mockupUrls });
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
                    credits: admin.firestore.FieldValue.increment(creditsToAdd),
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

        const { artworkId, products } = req.body;

        // Check credits
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();
        const credits = userDoc.data()?.credits || 0;
        const cost = products.length; // 1 credit per product

        if (credits < cost) {
            res.status(403).json({ ok: false, error: "Insufficient credits" });
            return;
        }

        // Get artwork URL
        const artworkDoc = await db.collection("users").doc(uid).collection("artworks").doc(artworkId).get();
        if (!artworkDoc.exists) {
            res.status(404).json({ ok: false, error: "Artwork not found" });
            return;
        }
        const artworkUrl = artworkDoc.data()?.url;

        // Fetch image data (needed for NanoBanana)
        // In a real app, we might pass the URL directly if the model supports it, 
        // or download it here. NanoBanana abstraction expects inline data.
        // For this demo, we'll assume we can fetch it.
        const imageRes = await fetch(artworkUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        const mimeType = imageRes.headers.get("content-type") || "image/jpeg";

        const results = [];

        // Deduct credits first (optimistic) or after? 
        // Let's deduct after success or partial success.

        for (const category of products) {
            try {
                const result = await generateCategoryMockup({
                    category,
                    artworkInline: { data: base64, mimeType },
                    modelId: process.env.NANOBANANA_PRO_MODEL_ID,
                });

                // Save to Firestore
                const mockupRef = await db.collection("users").doc(uid).collection("mockups").add({
                    category,
                    url: result.url,
                    artworkId,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                results.push({ category, url: result.url, id: mockupRef.id });
            } catch (error) {
                logger.error(`Failed to generate ${category}`, error);
            }
        }

        // Deduct credits based on successful generations
        if (results.length > 0) {
            await userRef.update({
                credits: admin.firestore.FieldValue.increment(-results.length),
            });
        }

        res.json({ ok: true, results });
    } catch (error: any) {
        logger.error("generateMemberMockups error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});

export const api = onRequest({ memory: "1GiB", timeoutSeconds: 300 }, app);
