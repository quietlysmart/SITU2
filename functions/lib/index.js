"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.creditExpirationCheck = exports.api = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
require("dotenv/config");
const firestore_1 = require("firebase-functions/v2/firestore");
const logger = __importStar(require("firebase-functions/logger"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const stripe_1 = __importDefault(require("stripe"));
const admin = __importStar(require("firebase-admin"));
const firestore_2 = require("firebase-admin/firestore");
const crypto = __importStar(require("crypto"));
const nanobanana_1 = require("./nanobanana");
const emailService_1 = require("./emailService");
admin.initializeApp({
    projectId: "situ-477910",
    storageBucket: "situ-477910.firebasestorage.app"
});
const db = admin.firestore();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
// Admin verification helper
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
function isAdmin(email) {
    if (!email)
        return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: true }));
app.use(express_1.default.json({ limit: '10mb' }));
app.post("/editMockup", async (req, res) => {
    var _a, _b;
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
        const credits = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.credits) || 0;
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
        const mockupUrl = (_b = mockupDoc.data()) === null || _b === void 0 ? void 0 : _b.url;
        // Fetch image
        const imageRes = await fetch(mockupUrl);
        const arrayBuffer = await imageRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString("base64");
        const mimeType = imageRes.headers.get("content-type") || "image/jpeg";
        // Call NanoBanana edit
        const result = await (0, nanobanana_1.editImage)({
            baseInline: { data: base64, mimeType },
            prompt: editPrompt,
            modelId: process.env.NANOBANANA_PRO_MODEL_ID,
        });
        // Update Firestore
        await mockupRef.update({
            url: result.url,
            updatedAt: firestore_2.FieldValue.serverTimestamp(),
        });
        // Deduct credit
        await userRef.update({
            credits: firestore_2.FieldValue.increment(-1),
        });
        res.json({ ok: true, url: result.url });
    }
    catch (error) {
        logger.error("editMockup error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
app.get("/health", (req, res) => {
    res.json({ ok: true, service: "situ-api", timestamp: new Date().toISOString() });
});
async function uploadDataUrl(dataUrl, path) {
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
    var _a, _b, _c, _d;
    try {
        let { artworkUrl } = req.body;
        if (!artworkUrl) {
            res.status(400).json({ ok: false, error: "Missing artworkUrl" });
            return;
        }
        // Rate limiting: Check IP for abuse (max 10 sessions per IP per day)
        const clientIp = ((_b = (_a = req.headers["x-forwarded-for"]) === null || _a === void 0 ? void 0 : _a.split(",")[0]) === null || _b === void 0 ? void 0 : _b.trim()) ||
            req.ip ||
            "unknown";
        const rateLimitKey = `rate_limit_guest_${clientIp.replace(/\./g, "_")}`;
        const rateLimitRef = db.collection("rate_limits").doc(rateLimitKey);
        const rateLimitDoc = await rateLimitRef.get();
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const GUEST_SESSION_LIMIT = 10; // Max 10 guest sessions per IP per day
        if (rateLimitDoc.exists) {
            const data = rateLimitDoc.data();
            const lastReset = ((_d = (_c = data.lastReset) === null || _c === void 0 ? void 0 : _c.toMillis) === null || _d === void 0 ? void 0 : _d.call(_c)) || 0;
            const count = data.count || 0;
            if (lastReset > oneDayAgo && count >= GUEST_SESSION_LIMIT) {
                logger.warn(`[generateGuestMockups] Rate limit exceeded for IP: ${clientIp}`);
                res.status(429).json({
                    ok: false,
                    error: "You've reached the daily limit for free mockups. Please try again tomorrow or sign up for a membership!"
                });
                return;
            }
            // Reset if more than a day has passed
            if (lastReset <= oneDayAgo) {
                await rateLimitRef.set({ count: 1, lastReset: firestore_2.FieldValue.serverTimestamp() });
            }
            else {
                await rateLimitRef.update({ count: firestore_2.FieldValue.increment(1) });
            }
        }
        else {
            await rateLimitRef.set({ count: 1, lastReset: firestore_2.FieldValue.serverTimestamp() });
        }
        // Create a session ID first
        const sessionRef = db.collection("guest_sessions").doc();
        const sessionId = sessionRef.id;
        logger.info(`[generateGuestMockups] New guest session created: ${sessionId} from IP: ${clientIp}`);
        // If artworkUrl is a base64 Data URL, upload it to Storage first
        // to avoid hitting Firestore 1MB limit.
        if (artworkUrl.startsWith("data:")) {
            try {
                const storagePath = `guest_sessions/${sessionId}/original_artwork_${Date.now()}.png`;
                artworkUrl = await uploadDataUrl(artworkUrl, storagePath);
                logger.info(`[generateGuestMockups] Uploaded base64 artwork to ${artworkUrl}`);
            }
            catch (err) {
                logger.error("[generateGuestMockups] Failed to upload input artwork", err);
                // We could fail hard, or try to proceed if it's small enough (but likely it's not)
                res.status(500).json({ ok: false, error: "Failed to process artwork image." });
                return;
            }
        }
        // Generate mockups
        const tempResults = [];
        const results = [];
        const errors = [];
        // For guest, we generate 4 standard mockups
        const categories = ["wall", "prints", "wearable", "phone"];
        // 1. Generate all (get Data URLs)
        for (const category of categories) {
            try {
                const dataUrl = await (0, nanobanana_1.generateCategoryMockup)(category, artworkUrl);
                if (dataUrl) {
                    tempResults.push({ category, dataUrl });
                }
                else {
                    errors.push({ category, message: "Generation failed" });
                }
            }
            catch (error) {
                logger.error(`Error generating ${category}:`, error);
                errors.push({ category, message: error.message });
            }
        }
        // 2. Upload generated mockups to Storage
        for (const item of tempResults) {
            try {
                const storagePath = `guest_sessions/${sessionId}/${item.category}_${Date.now()}.png`;
                const storageUrl = await uploadDataUrl(item.dataUrl, storagePath);
                results.push({ category: item.category, url: storageUrl });
            }
            catch (error) {
                logger.error(`Error uploading ${item.category}:`, error);
                errors.push({ category: item.category, message: `Upload failed: ${error.message}` });
            }
        }
        // 3. Store guest session with STORAGE URLs (small strings)
        if (results.length > 0) {
            await sessionRef.set({
                results,
                createdAt: firestore_2.FieldValue.serverTimestamp(),
                status: "generated",
                artworkUrl // Now this is a short https:// URL
            });
        }
        else {
            res.status(500).json({
                ok: false,
                error: "All generations failed.",
                errors
            });
            return;
        }
        const response = {
            ok: true,
            sessionId: results.length > 0 ? sessionId : undefined,
            results,
            errors,
        };
        res.json(response);
    }
    catch (error) {
        logger.error("generateGuestMockups error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
app.post("/sendGuestMockups", async (req, res) => {
    var _a;
    try {
        const { email, mockupUrls, sessionId } = req.body;
        if (!email) {
            res.status(400).json({ ok: false, error: "Missing email" });
            return;
        }
        let urlsToSend = [];
        if (sessionId) {
            // Upstream preferred way: update the existing session
            await db.collection("guest_sessions").doc(sessionId).update({
                email,
                status: "pending_email",
                emailRequestsAt: firestore_2.FieldValue.serverTimestamp()
            });
            const sessionDoc = await db.collection("guest_sessions").doc(sessionId).get();
            const sessionData = sessionDoc.data();
            urlsToSend = ((_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.results) === null || _a === void 0 ? void 0 : _a.map((r) => r.url)) || [];
        }
        else if (mockupUrls && mockupUrls.length > 0) {
            // Legacy way (or fallback)
            urlsToSend = mockupUrls;
            // Also store for analytics if needed
            await db.collection("guest_mockups").add({
                email,
                mockupUrls,
                createdAt: firestore_2.FieldValue.serverTimestamp(),
                status: "sent_email"
            });
        }
        else {
            res.status(400).json({ ok: false, error: "Missing sessionId or mockupUrls" });
            return;
        }
        if (urlsToSend.length === 0) {
            res.status(400).json({ ok: false, error: "No mockups to send." });
            return;
        }
        // Call Email Service
        await emailService_1.emailService.sendGuestMockups({
            email,
            mockupUrls: urlsToSend
        });
        // Update status if session exists
        if (sessionId) {
            await db.collection("guest_sessions").doc(sessionId).update({
                status: "email_sent",
                emailSentAt: firestore_2.FieldValue.serverTimestamp()
            });
        }
        res.json({ ok: true });
    }
    catch (error) {
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
        let customerId = userData === null || userData === void 0 ? void 0 : userData.stripeCustomerId;
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
    }
    catch (error) {
        logger.error("createCheckoutSession error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
// Cancel subscription endpoint
app.post("/cancelSubscription", async (req, res) => {
    try {
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
        if (!(userData === null || userData === void 0 ? void 0 : userData.stripeSubscriptionId)) {
            res.status(400).json({ ok: false, error: "No active subscription found" });
            return;
        }
        // Cancel at period end (user keeps access until current period ends)
        const subscription = await stripe.subscriptions.update(userData.stripeSubscriptionId, {
            cancel_at_period_end: true
        });
        await db.collection("users").doc(uid).update({
            subscriptionStatus: "canceling", // Will become "canceled" when webhook fires
            cancelAtPeriodEnd: true
        });
        logger.info(`[cancelSubscription] User ${uid} scheduled subscription cancellation`);
        res.json({
            ok: true,
            message: "Subscription will be canceled at the end of the current billing period",
            cancelAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : null
        });
    }
    catch (error) {
        logger.error("cancelSubscription error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
// Sync subscription status manually (workaround for local webhook issues)
// This endpoint checks Stripe for the user's active subscription and updates Firebase
app.post("/syncSubscription", async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const userEmail = decodedToken.email;
        logger.info(`[syncSubscription] Syncing subscription for user ${uid} (${userEmail})`);
        const userDoc = await db.collection("users").doc(uid).get();
        const userData = userDoc.data();
        // First, check if user has a stripeCustomerId
        let customerId = userData === null || userData === void 0 ? void 0 : userData.stripeCustomerId;
        // If no customer ID, try to find by email
        if (!customerId && userEmail) {
            const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
            if (customers.data.length > 0) {
                customerId = customers.data[0].id;
                // Save for future use
                await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
                logger.info(`[syncSubscription] Found customer by email: ${customerId}`);
            }
        }
        if (!customerId) {
            res.json({ ok: true, message: "No Stripe customer found. Not subscribed.", plan: "free" });
            return;
        }
        // Get active subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 10
        });
        // Find an active or trialing subscription
        const activeSubscription = subscriptions.data.find(sub => sub.status === "active" || sub.status === "trialing");
        if (!activeSubscription) {
            logger.info(`[syncSubscription] No active subscription found for customer ${customerId}`);
            res.json({ ok: true, message: "No active subscription found.", plan: "free" });
            return;
        }
        // Determine plan from price ID
        const priceId = activeSubscription.items.data[0].price.id;
        let plan = "monthly";
        if (priceId === process.env.STRIPE_PRICE_MONTHLY_ID) {
            plan = "monthly";
        }
        else if (priceId === process.env.STRIPE_PRICE_QUARTERLY_ID) {
            plan = "quarterly";
        }
        else if (priceId === process.env.STRIPE_PRICE_SIX_MONTHS_ID) {
            plan = "sixMonths";
        }
        // Calculate credits reset date
        const currentPeriodEnd = activeSubscription.current_period_end;
        const creditsResetAt = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
        // All subscription plans get 50 credits
        const SUBSCRIPTION_CREDITS = 50;
        // Update user document
        await db.collection("users").doc(uid).update({
            plan,
            credits: SUBSCRIPTION_CREDITS,
            creditsResetAt,
            subscriptionStatus: activeSubscription.status,
            stripeSubscriptionId: activeSubscription.id,
            stripeCustomerId: customerId
        });
        logger.info(`[syncSubscription] Updated user ${uid}: plan=${plan}, credits=${SUBSCRIPTION_CREDITS}`);
        res.json({
            ok: true,
            message: `Subscription synced! You now have ${SUBSCRIPTION_CREDITS} credits.`,
            plan,
            credits: SUBSCRIPTION_CREDITS,
            creditsResetAt: creditsResetAt === null || creditsResetAt === void 0 ? void 0 : creditsResetAt.toISOString()
        });
    }
    catch (error) {
        logger.error("syncSubscription error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
// Create credit top-up checkout session (one-time purchase)
app.post("/createTopUpSession", async (req, res) => {
    try {
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
        let customerId = userData === null || userData === void 0 ? void 0 : userData.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: decodedToken.email,
                metadata: { firebaseUid: uid },
            });
            customerId = customer.id;
            await db.collection("users").doc(uid).update({ stripeCustomerId: customerId });
        }
        const txnSuccessUrl = process.env.STRIPE_SUCCESS_URL || "http://localhost:5173/account";
        const txnCancelUrl = process.env.STRIPE_CANCEL_URL || "http://localhost:5173/account";
        // For top-ups, we use price_data (inline pricing) if no dedicated top-up price exists
        // This creates a one-time $12 charge for 50 credits
        const topUpPriceId = process.env.STRIPE_PRICE_TOPUP_ID;
        let lineItems;
        if (topUpPriceId) {
            // Use pre-configured one-time price if available
            lineItems = [{ price: topUpPriceId, quantity: 1 }];
        }
        else {
            // Use inline price_data for one-time payment
            lineItems = [{
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: "Situ Credits Top-Up",
                            description: "50 credits for mockup generation",
                        },
                        unit_amount: 1200, // $12.00 in cents
                    },
                    quantity: 1,
                }];
        }
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ["card"],
            line_items: lineItems,
            mode: "payment", // One-time payment, not subscription
            success_url: `${txnSuccessUrl}?topup=success`,
            cancel_url: txnCancelUrl,
            metadata: {
                firebaseUid: uid,
                type: "credit_topup",
                credits: "50"
            },
        });
        logger.info(`[createTopUpSession] Top-up session created for user ${uid}: ${session.id}`);
        res.json({ ok: true, sessionId: session.id, url: session.url });
    }
    catch (error) {
        logger.error("createTopUpSession error", error);
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
        if (sessionData === null || sessionData === void 0 ? void 0 : sessionData.claimedBy) {
            res.status(400).json({ ok: false, error: "Session already claimed" });
            return;
        }
        // Verify email match if possible (optional but good for security)
        // If guest session has no email (didn't send yet), we might let them claim if they just created it?
        // But usually they enter email to send.
        if ((sessionData === null || sessionData === void 0 ? void 0 : sessionData.email) && sessionData.email !== email) {
            logger.warn(`[claimGuestSession] Email mismatch. Session: ${sessionData.email}, User: ${email}`);
            // We'll allow it for now as user might sign up with different email, but it's a bit risky.
            // User requirement: "If guestSessionId is present and the guest session’s email matches the signup email"
            // So we MUST enforce it.
            if (sessionData.email.toLowerCase() !== (email === null || email === void 0 ? void 0 : email.toLowerCase())) {
                res.status(403).json({ ok: false, error: "Email mismatch. Please sign up with the same email used in Guest Studio." });
                return;
            }
        }
        const artworkUrl = sessionData === null || sessionData === void 0 ? void 0 : sessionData.artworkUrl;
        const results = (sessionData === null || sessionData === void 0 ? void 0 : sessionData.results) || [];
        logger.info(`[claimGuestSession] Found ${results.length} mockups to allow copy.`);
        // 1. Copy artwork
        if (artworkUrl) {
            logger.info(`[claimGuestSession] Copying artwork: ${artworkUrl}`);
            await db.collection("users").doc(uid).collection("artworks").add({
                url: artworkUrl,
                name: "Imported from Guest Studio",
                createdAt: firestore_2.FieldValue.serverTimestamp(),
            });
        }
        else {
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
                    createdAt: firestore_2.FieldValue.serverTimestamp(),
                    importedFromGuest: true
                });
            }
            await batch.commit();
            logger.info(`[claimGuestSession] Copied ${results.length} mockups to user text.`);
        }
        else {
            logger.warn("[claimGuestSession] No results array found to copy.");
        }
        // 3. Mark session as claimed
        await sessionRef.update({
            claimedBy: uid,
            claimedAt: firestore_2.FieldValue.serverTimestamp()
        });
        logger.info(`[claimGuestSession] Successfully claimed session ${sessionId} for user ${uid}`);
        res.json({ ok: true, copiedCount: results.length });
    }
    catch (error) {
        logger.error("claimGuestSession error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
app.post("/stripeWebhook", express_1.default.raw({ type: "application/json" }), async (req, res) => {
    var _a, _b;
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    }
    catch (err) {
        logger.error("Webhook signature verification failed.", err);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            logger.info(`[Webhook] Processing ${event.type} for customer: ${customerId}`);
            let usersSnapshot = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
            // Fallback: If no user found by customerId, try to find by looking up the customer's metadata
            if (usersSnapshot.empty) {
                logger.warn(`[Webhook] No user found by stripeCustomerId: ${customerId}. Attempting customer metadata lookup.`);
                try {
                    const customer = await stripe.customers.retrieve(customerId);
                    if (customer && !customer.deleted && ((_a = customer.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUid)) {
                        const firebaseUid = customer.metadata.firebaseUid;
                        logger.info(`[Webhook] Found firebaseUid in customer metadata: ${firebaseUid}`);
                        const userDoc = await db.collection("users").doc(firebaseUid).get();
                        if (userDoc.exists) {
                            // Update the user with stripeCustomerId for future lookups
                            await userDoc.ref.update({ stripeCustomerId: customerId });
                            usersSnapshot = {
                                empty: false,
                                docs: [userDoc]
                            };
                            logger.info(`[Webhook] Found user via metadata and updated stripeCustomerId`);
                        }
                    }
                }
                catch (customerErr) {
                    logger.error(`[Webhook] Failed to retrieve customer metadata`, customerErr);
                }
            }
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                const priceId = subscription.items.data[0].price.id;
                let plan = "monthly";
                // All subscription plans get 50 credits per billing period (non-rolling)
                const SUBSCRIPTION_CREDITS = 50;
                // Determine plan name from price ID
                if (priceId === process.env.STRIPE_PRICE_MONTHLY_ID) {
                    plan = "monthly";
                }
                else if (priceId === process.env.STRIPE_PRICE_QUARTERLY_ID) {
                    plan = "quarterly";
                }
                else if (priceId === process.env.STRIPE_PRICE_SIX_MONTHS_ID) {
                    plan = "sixMonths";
                }
                // Calculate next billing date for credit reset
                const subscriptionData = subscription;
                const currentPeriodEnd = subscriptionData.current_period_end;
                const creditsResetAt = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
                // SET credits to 50 (not increment) - credits do NOT roll over
                await userDoc.ref.update({
                    plan,
                    credits: SUBSCRIPTION_CREDITS,
                    creditsResetAt,
                    subscriptionStatus: subscription.status,
                    stripeSubscriptionId: subscription.id,
                });
                logger.info(`[Webhook] Updated user ${userDoc.id}: plan=${plan}, credits=${SUBSCRIPTION_CREDITS}, resetsAt=${(creditsResetAt === null || creditsResetAt === void 0 ? void 0 : creditsResetAt.toISOString()) || 'N/A'}`);
            }
            else {
                logger.error(`[Webhook] CRITICAL: No user found for customer ${customerId} - credits NOT updated!`);
            }
        }
        // Handle subscription cancellation
        if (event.type === "customer.subscription.deleted") {
            const subscription = event.data.object;
            const customerId = subscription.customer;
            const usersSnapshot = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                await userDoc.ref.update({
                    plan: "free",
                    subscriptionStatus: "canceled",
                    stripeSubscriptionId: null,
                    creditsResetAt: null,
                    // Keep existing credits - they can use them until they run out
                });
                logger.info(`[Webhook] Subscription canceled for user ${userDoc.id}`);
            }
        }
        // Handle one-time credit top-up purchases
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;
            // Only handle top-up purchases (mode: payment, not subscription)
            if (session.mode === "payment" && ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.type) === "credit_topup") {
                const uid = session.metadata.firebaseUid;
                const creditsToAdd = parseInt(session.metadata.credits || "0");
                if (uid && creditsToAdd > 0) {
                    await db.collection("users").doc(uid).update({
                        credits: firestore_2.FieldValue.increment(creditsToAdd)
                    });
                    logger.info(`[Webhook] Added ${creditsToAdd} credits to user ${uid} via top-up`);
                }
            }
        }
        res.json({ received: true });
    }
    catch (err) {
        logger.error("Webhook handler error", err);
        res.status(500).send(`Webhook Error: ${err.message}`);
    }
});
// ... existing endpoints ...
app.post("/generateMemberMockups", async (req, res) => {
    var _a, _b;
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
            credits = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.credits) || 0;
            console.log(`[MEMBER] User has ${credits} credits`);
        }
        catch (err) {
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
                artworkUrl = (_b = artworkDoc.data()) === null || _b === void 0 ? void 0 : _b.url;
                console.log(`[MEMBER] Artwork URL found: ${artworkUrl}`);
            }
            catch (err) {
                console.error(`[MEMBER] Failed to fetch artwork from DB: ${err}`);
                res.status(500).json({ ok: false, error: "Failed to fetch artwork info" });
                return;
            }
        }
        else {
            console.log(`[MEMBER] Using provided artwork URL`);
        }
        const results = [];
        const errors = [];
        // Generate variations for the selected product
        const tasks = [];
        for (let i = 0; i < numVariations; i++) {
            tasks.push((async () => {
                try {
                    console.log(`Generating ${product} variation ${i + 1}...`);
                    const dataUrl = await (0, nanobanana_1.generateCategoryMockup)(product, artworkUrl, customPrompt, aspectRatio);
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
                                createdAt: firestore_2.FieldValue.serverTimestamp(),
                                variation: i + 1,
                                aspectRatio: aspectRatio || "1:1",
                                customPrompt: customPrompt || null
                            });
                            mockupId = mockupRef.id;
                            console.log(`[MEMBER] Mockup saved with ID: ${mockupId}`);
                            results.push({ id: mockupId, url: storageUrl, category: product });
                        }
                        catch (err) {
                            console.error(`[MEMBER] Failed to save mockup: ${err}`);
                            // If upload worked but firestore failed, we might still want to return success? 
                            // Or better to fail so user knows? 
                            // For now, if Firestore fails, we consider it a failure.
                        }
                    }
                    else {
                        errors.push({ category: product, message: "Generation failed" });
                    }
                }
                catch (err) {
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
                    credits: firestore_2.FieldValue.increment(-results.length)
                });
                console.log(`[MEMBER] Credits deducted`);
            }
            catch (err) {
                console.error(`[MEMBER] Failed to deduct credits: ${err}`);
            }
        }
        res.json({ ok: true, results, errors, remainingCredits: credits - results.length });
    }
    catch (error) {
        logger.error("generateMemberMockups error", error);
        console.error("[MEMBER] Critical error:", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
// ============================================
// ADMIN ENDPOINTS
// ============================================
// Admin middleware helper
async function verifyAdmin(req, res) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return null;
    }
    try {
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (!isAdmin(decodedToken.email)) {
            logger.warn(`[Admin] Non-admin access attempt by ${decodedToken.email}`);
            res.status(403).json({ ok: false, error: "Forbidden: Admin access required" });
            return null;
        }
        return { uid: decodedToken.uid, email: decodedToken.email || "" };
    }
    catch (err) {
        res.status(401).json({ ok: false, error: "Invalid token" });
        return null;
    }
}
// GET /admin/stats - Dashboard metrics
app.get("/admin/stats", async (req, res) => {
    var _a, _b, _c, _d;
    const adminUser = await verifyAdmin(req, res);
    if (!adminUser)
        return;
    try {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        // Get all users
        const usersSnap = await db.collection("users").get();
        const totalUsers = usersSnap.size;
        let newUsersLast7Days = 0;
        let totalCreditsGranted = 0;
        let totalCreditsSpent = 0;
        for (const doc of usersSnap.docs) {
            const data = doc.data();
            const createdAt = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
            if (createdAt && createdAt > sevenDaysAgo) {
                newUsersLast7Days++;
            }
            // Track credits (approximation based on current balance and plan)
            totalCreditsGranted += data.credits || 0;
        }
        // Count mockups
        let totalMockups = 0;
        let mockupsLast7Days = 0;
        for (const userDoc of usersSnap.docs) {
            const mockupsSnap = await db.collection("users").doc(userDoc.id).collection("mockups").get();
            totalMockups += mockupsSnap.size;
            for (const mockupDoc of mockupsSnap.docs) {
                const createdAt = (_d = (_c = mockupDoc.data().createdAt) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c);
                if (createdAt && createdAt > sevenDaysAgo) {
                    mockupsLast7Days++;
                }
            }
        }
        res.json({
            ok: true,
            stats: {
                totalUsers,
                newUsersLast7Days,
                totalMockups,
                mockupsLast7Days,
                totalCreditsGranted,
                totalCreditsSpent // Would need tracking to calculate accurately
            }
        });
    }
    catch (error) {
        logger.error("[Admin] Stats error", error);
        res.status(500).json({ ok: false, error: "Failed to fetch stats" });
    }
});
// GET /admin/users - Paginated user list
app.get("/admin/users", async (req, res) => {
    var _a, _b, _c;
    const adminUser = await verifyAdmin(req, res);
    if (!adminUser)
        return;
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;
        const search = (req.query.search || "").toLowerCase();
        const filter = req.query.filter; // "zero_credits", "subscribed"
        let query = db.collection("users");
        // Get all users (for pagination with filters, we need to fetch more)
        const snapshot = await query.get();
        let users = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const user = {
                uid: doc.id,
                email: data.email || "",
                displayName: data.displayName || "",
                plan: data.plan || "free",
                credits: data.credits || 0,
                createdAt: ((_c = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || null,
            };
            // Get counts
            const artworksSnap = await db.collection("users").doc(doc.id).collection("artworks").get();
            const mockupsSnap = await db.collection("users").doc(doc.id).collection("mockups").get();
            user.artworkCount = artworksSnap.size;
            user.mockupCount = mockupsSnap.size;
            // Apply search filter
            if (search && !user.email.toLowerCase().includes(search) && !user.displayName.toLowerCase().includes(search)) {
                continue;
            }
            // Apply status filters
            if (filter === "zero_credits" && user.credits > 0)
                continue;
            if (filter === "subscribed" && user.plan === "free")
                continue;
            users.push(user);
        }
        // Sort by createdAt desc
        users.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        // Paginate
        const total = users.length;
        users = users.slice(offset, offset + limit);
        res.json({ ok: true, users, total, limit, offset });
    }
    catch (error) {
        logger.error("[Admin] Users list error", error);
        res.status(500).json({ ok: false, error: "Failed to fetch users" });
    }
});
// GET /admin/users/:uid - User detail
app.get("/admin/users/:uid", async (req, res) => {
    var _a, _b, _c;
    const adminUser = await verifyAdmin(req, res);
    if (!adminUser)
        return;
    try {
        const { uid } = req.params;
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            res.status(404).json({ ok: false, error: "User not found" });
            return;
        }
        const userData = userDoc.data();
        // Get artworks and mockups
        const artworksSnap = await db.collection("users").doc(uid).collection("artworks").get();
        const mockupsSnap = await db.collection("users").doc(uid).collection("mockups")
            .orderBy("createdAt", "desc")
            .limit(10)
            .get();
        const recentMockups = mockupsSnap.docs.map(d => {
            var _a, _b, _c;
            return ({
                id: d.id,
                url: d.data().url,
                category: d.data().category,
                createdAt: ((_c = (_b = (_a = d.data().createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || null
            });
        });
        res.json({
            ok: true,
            user: {
                uid,
                email: userData.email || "",
                displayName: userData.displayName || "",
                plan: userData.plan || "free",
                credits: userData.credits || 0,
                createdAt: ((_c = (_b = (_a = userData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) === null || _c === void 0 ? void 0 : _c.toISOString()) || null,
                stripeCustomerId: userData.stripeCustomerId || null,
                subscriptionStatus: userData.subscriptionStatus || null,
                artworkCount: artworksSnap.size,
                mockupCount: mockupsSnap.size,
                recentMockups
            }
        });
    }
    catch (error) {
        logger.error("[Admin] User detail error", error);
        res.status(500).json({ ok: false, error: "Failed to fetch user" });
    }
});
// POST /admin/users/:uid/credits - Adjust credits
app.post("/admin/users/:uid/credits", async (req, res) => {
    var _a;
    const adminUser = await verifyAdmin(req, res);
    if (!adminUser)
        return;
    try {
        const { uid } = req.params;
        const { delta, reason } = req.body;
        if (typeof delta !== "number" || !Number.isInteger(delta)) {
            res.status(400).json({ ok: false, error: "Delta must be an integer" });
            return;
        }
        if (!reason || typeof reason !== "string") {
            res.status(400).json({ ok: false, error: "Reason is required" });
            return;
        }
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            res.status(404).json({ ok: false, error: "User not found" });
            return;
        }
        const currentCredits = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.credits) || 0;
        const newCredits = Math.max(0, currentCredits + delta); // Prevent negative credits
        // Update credits atomically
        await userRef.update({ credits: newCredits });
        // Create audit log
        await db.collection("creditAdjustments").add({
            userId: uid,
            delta,
            reason,
            previousCredits: currentCredits,
            newCredits,
            adminEmail: adminUser.email,
            adminUid: adminUser.uid,
            timestamp: firestore_2.FieldValue.serverTimestamp()
        });
        logger.info(`[Admin] Credit adjustment: ${adminUser.email} adjusted ${uid} by ${delta}. Reason: ${reason}`);
        res.json({ ok: true, previousCredits: currentCredits, newCredits });
    }
    catch (error) {
        logger.error("[Admin] Credit adjustment error", error);
        res.status(500).json({ ok: false, error: "Failed to adjust credits" });
    }
});
// DELETE /admin/users/all - Delete all non-admin users (for testing)
app.delete("/admin/users/all", async (req, res) => {
    var _a;
    const adminUser = await verifyAdmin(req, res);
    if (!adminUser)
        return;
    try {
        const usersSnap = await db.collection("users").get();
        let deletedCount = 0;
        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            const userEmail = ((_a = userData.email) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || "";
            // Skip admin users
            if (isAdmin(userEmail)) {
                logger.info(`[Admin] Skipping admin user: ${userEmail}`);
                continue;
            }
            // Delete subcollections first
            const artworksDocs = await db.collection("users").doc(userDoc.id).collection("artworks").get();
            for (const art of artworksDocs.docs) {
                await art.ref.delete();
            }
            const mockupsDocs = await db.collection("users").doc(userDoc.id).collection("mockups").get();
            for (const mock of mockupsDocs.docs) {
                await mock.ref.delete();
            }
            // Delete user document
            await userDoc.ref.delete();
            // Delete from Firebase Auth
            try {
                await admin.auth().deleteUser(userDoc.id);
            }
            catch (authErr) {
                logger.warn(`[Admin] Could not delete auth user ${userDoc.id}: ${authErr.message}`);
            }
            deletedCount++;
        }
        logger.info(`[Admin] Deleted ${deletedCount} non-admin users by ${adminUser.email}`);
        res.json({ ok: true, deletedCount });
    }
    catch (error) {
        logger.error("[Admin] Delete all users error", error);
        res.status(500).json({ ok: false, error: "Failed to delete users" });
    }
});
exports.api = (0, https_1.onRequest)({ memory: "1GiB", timeoutSeconds: 300 }, app);
// NOTE: nukeEverything endpoint has been removed for production safety.
// If you need to clear dev data, use Firebase Console or a separate admin script.
// Firestore Notification Trigger for Welcome Email
exports.onUserCreated = (0, firestore_1.onDocumentCreated)("users/{uid}", async (event) => {
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
        await emailService_1.emailService.sendWelcomeEmail(email, displayName);
    }
    else {
        logger.warn(`[onUserCreated] User ${event.params.uid} has no email.`);
    }
});
// Scheduled function: Credit expiration enforcement
// Runs daily at midnight UTC to reset credits for users whose billing period has ended
exports.creditExpirationCheck = (0, scheduler_1.onSchedule)("every day 00:00", async () => {
    logger.info("[creditExpirationCheck] Starting daily credit expiration check");
    const now = new Date();
    try {
        // Find all users with creditsResetAt in the past and an active subscription
        const usersSnapshot = await db.collection("users")
            .where("creditsResetAt", "<=", now)
            .where("subscriptionStatus", "in", ["active", "canceling"])
            .get();
        let resetCount = 0;
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            // For users whose subscription is still active, their credits will be
            // refreshed when Stripe sends the subscription.updated webhook at the start
            // of their new billing period. This cron is mainly for:
            // 1. Users whose subscription just ended (canceling -> canceled)
            // 2. Cleanup for edge cases where webhook might have been missed
            // If subscription is canceling and past reset date, mark as canceled
            if (userData.subscriptionStatus === "canceling") {
                await userDoc.ref.update({
                    plan: "free",
                    subscriptionStatus: "canceled",
                    stripeSubscriptionId: null,
                    creditsResetAt: null,
                    cancelAtPeriodEnd: null
                });
                resetCount++;
                logger.info(`[creditExpirationCheck] User ${userDoc.id} subscription expired, set to free`);
            }
        }
        // Also clean up old rate limit entries (older than 7 days)
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oldRateLimits = await db.collection("rate_limits")
            .where("lastReset", "<", sevenDaysAgo)
            .limit(500)
            .get();
        const batch = db.batch();
        oldRateLimits.docs.forEach(doc => batch.delete(doc.ref));
        if (oldRateLimits.size > 0) {
            await batch.commit();
            logger.info(`[creditExpirationCheck] Cleaned up ${oldRateLimits.size} old rate limit entries`);
        }
        logger.info(`[creditExpirationCheck] Completed. Processed ${usersSnapshot.size} users, reset ${resetCount}`);
    }
    catch (error) {
        logger.error("[creditExpirationCheck] Error during credit expiration check", error);
    }
});
//# sourceMappingURL=index.js.map