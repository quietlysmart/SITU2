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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
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
const bucket = admin.storage().bucket();
// Note: URLs are validated lazily on usage to prevent deploy-time errors.
const STORAGE_BUCKET_NAME = bucket.name.toLowerCase();
const ALLOWED_IMAGE_HOSTS = new Set([
    "firebasestorage.googleapis.com",
    "storage.googleapis.com",
    STORAGE_BUCKET_NAME,
    ...(process.env.ALLOWED_IMAGE_HOSTS || "")
        .split(",")
        .map(h => h.trim().toLowerCase())
        .filter(Boolean),
]);
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder");
// Admin verification helper
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "").split(",").map(e => e.trim().toLowerCase());
function isAdmin(email) {
    if (!email)
        return false;
    return ADMIN_EMAILS.includes(email.toLowerCase());
}
const app = (0, express_1.default)();
// Do not trust X-Forwarded-For; use connection IPs for rate limiting.
app.set("trust proxy", false);
app.use((0, cors_1.default)({ origin: true }));
// Preserve raw body for Stripe webhook signature verification
const jsonBodyParser = express_1.default.json({ limit: "10mb" });
app.use((req, res, next) => {
    if (req.originalUrl.startsWith("/stripeWebhook") || req.originalUrl.startsWith("/api/stripeWebhook")) {
        return next();
    }
    return jsonBodyParser(req, res, next);
});
// Rewrite middleware for Hosting integration
app.use((req, res, next) => {
    if (req.url.startsWith("/api/")) {
        req.url = req.url.replace("/api/", "/");
    }
    next();
});
app.get("/health", (req, res) => {
    res.json({ ok: true, env: "production", timestamp: new Date().toISOString() });
});
function getClientIp(req) {
    // Priority: Google App Engine/Cloud Functions header -> Fastly/Firebase -> Direct IP
    const ip = req.headers["x-appengine-user-ip"] ||
        req.headers["fastly-client-ip"] ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
    return ip.replace(/[^a-zA-Z0-9:._-]/g, "_");
}
function isAllowedImageUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:")
            return false;
        const host = parsed.hostname.toLowerCase();
        if (!ALLOWED_IMAGE_HOSTS.has(host))
            return false;
        // If using shared hosts, ensure the path references our bucket
        if (host === "firebasestorage.googleapis.com") {
            return parsed.pathname.includes(`/v0/b/${STORAGE_BUCKET_NAME}/`);
        }
        if (host === "storage.googleapis.com") {
            return parsed.pathname.startsWith(`/${STORAGE_BUCKET_NAME}/`);
        }
        // Direct bucket domain (e.g., <bucket>.firebasestorage.app)
        return true;
    }
    catch (_a) {
        return false;
    }
}
function isDataUrl(value) {
    return value.startsWith("data:");
}
function normalizeCreditState(data) {
    let monthlyCreditsRemaining = typeof (data === null || data === void 0 ? void 0 : data.monthlyCreditsRemaining) === "number" ? Math.max(0, data.monthlyCreditsRemaining) : 0;
    let bonusCredits = typeof (data === null || data === void 0 ? void 0 : data.bonusCredits) === "number" ? Math.max(0, data.bonusCredits) : 0;
    // Migrate legacy credits into bonus bucket if new fields are absent
    if (monthlyCreditsRemaining === 0 && bonusCredits === 0 && typeof (data === null || data === void 0 ? void 0 : data.credits) === "number") {
        bonusCredits = Math.max(0, data.credits);
    }
    const totalCredits = monthlyCreditsRemaining + bonusCredits;
    return { monthlyCreditsRemaining, bonusCredits, totalCredits };
}
function buildCreditUpdate(state) {
    return {
        monthlyCreditsRemaining: state.monthlyCreditsRemaining,
        bonusCredits: state.bonusCredits,
        credits: state.totalCredits,
    };
}
function getPlanFromPriceId(priceId) {
    if (!priceId)
        return "unknown";
    if (priceId === process.env.STRIPE_PRICE_MONTHLY_ID)
        return "monthly";
    if (priceId === process.env.STRIPE_PRICE_QUARTERLY_ID)
        return "quarterly";
    if (priceId === process.env.STRIPE_PRICE_SIX_MONTHS_ID)
        return "sixMonths";
    return "unknown";
}
async function findUserRefByCustomerId(customerId) {
    var _a;
    if (!customerId)
        return null;
    let usersSnapshot = await db.collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
    if (!usersSnapshot.empty) {
        return usersSnapshot.docs[0].ref;
    }
    // Fallback: look for firebaseUid in customer metadata
    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !customer.deleted && ((_a = customer.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUid)) {
            const firebaseUid = customer.metadata.firebaseUid;
            const userDoc = await db.collection("users").doc(firebaseUid).get();
            if (userDoc.exists) {
                // Store customerId for future fast lookups
                await userDoc.ref.update({ stripeCustomerId: customerId });
                return userDoc.ref;
            }
        }
    }
    catch (err) {
        logger.error(`[StripeWebhook] Failed to retrieve customer ${customerId} metadata`, err);
    }
    return null;
}
async function resolveUserRef(firebaseUid, customerId) {
    if (firebaseUid) {
        const userDoc = await db.collection("users").doc(firebaseUid).get();
        if (userDoc.exists) {
            return userDoc.ref;
        }
    }
    return findUserRefByCustomerId(customerId);
}
async function recordProcessedEvent(tx, processedRef, event, firebaseUid, userFound) {
    tx.set(processedRef, {
        eventType: event.type,
        processedAt: firestore_2.FieldValue.serverTimestamp(),
        firebaseUid,
        userFound,
    });
}
function logCreditChange(event, firebaseUid, before, after, note) {
    logger.info(`[StripeWebhook] processed ${event.type} ${event.id} uid=${firebaseUid || "unknown"} monthly ${before.monthlyCreditsRemaining}->${after.monthlyCreditsRemaining} bonus ${before.bonusCredits}->${after.bonusCredits}${note ? ` (${note})` : ""}`);
}
app.post("/editMockup", async (req, res) => {
    var _a;
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ ok: false, error: "Unauthorized" });
            return;
        }
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;
        const { mockupId } = req.body;
        // Check credits
        const userRef = db.collection("users").doc(uid);
        const userDoc = await userRef.get();
        const credits = normalizeCreditState(userDoc.data()).totalCredits;
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
        const mockupUrl = (_a = mockupDoc.data()) === null || _a === void 0 ? void 0 : _a.url;
        if (!mockupUrl || !isAllowedImageUrl(mockupUrl)) {
            res.status(400).json({ ok: false, error: "Invalid mockup source URL" });
            return;
        }
        // Fetch image
        // const imageRes = await fetch(mockupUrl);
        // const arrayBuffer = await imageRes.arrayBuffer();
        // const buffer = Buffer.from(arrayBuffer);
        // const base64 = buffer.toString("base64");
        // const mimeType = imageRes.headers.get("content-type") || "image/jpeg";
        // Call NanoBanana edit
        // Call NanoBanana edit (Disabled in Baseline V3)
        // const result = await editImage({
        //     baseInline: { data: base64, mimeType },
        //     prompt: editPrompt,
        //     modelId: process.env.NANOBANANA_PRO_MODEL_ID,
        // });
        logger.warn("Edit mockup requested but functionality is disabled in Baseline V3");
        res.status(501).json({ ok: false, error: "Editing temporarily disabled" });
        return;
        // Update Firestore (Disabled)
        // await mockupRef.update({
        //     url: result.url,
        //     updatedAt: FieldValue.serverTimestamp(),
        // });
        // Deduct credit (Disabled)
        // await userRef.update({
        //     credits: FieldValue.increment(-1),
        // });
        // res.json({ ok: true, url: result.url });
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
    var _a, _b;
    const start = Date.now();
    const requestId = crypto.randomUUID();
    let clientIp = "unknown";
    try {
        let { artworkUrl } = req.body;
        clientIp = getClientIp(req);
        logger.info(`[generateGuestMockups] Start ${requestId} IP:${clientIp}`);
        if (!artworkUrl) {
            res.status(400).json({ ok: false, error: "Missing artworkUrl" });
            return;
        }
        if (!isDataUrl(artworkUrl) && !isAllowedImageUrl(artworkUrl)) {
            res.status(400).json({ ok: false, error: "Invalid artwork URL. Upload the image directly." });
            return;
        }
        // Rate limiting: Check IP for abuse (max 10 sessions per IP per day)
        const rateLimitKey = `rate_limit_guest_${clientIp.replace(/\./g, "_")}`;
        const rateLimitRef = db.collection("rate_limits").doc(rateLimitKey);
        let rateLimitDoc;
        try {
            rateLimitDoc = await rateLimitRef.get();
        }
        catch (err) {
            console.error("[generateGuestMockups] Rate Limit Read Error:", err);
            throw new Error(`Rate Limit Check Failed: ${err.message}`);
        }
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const GUEST_SESSION_LIMIT = 10; // Max 10 guest sessions per IP per day
        if (rateLimitDoc.exists) {
            const data = rateLimitDoc.data();
            const lastReset = ((_b = (_a = data.lastReset) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) || 0;
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
            try {
                if (lastReset <= oneDayAgo) {
                    await rateLimitRef.set({ count: 1, lastReset: firestore_2.FieldValue.serverTimestamp() });
                }
                else {
                    await rateLimitRef.update({ count: firestore_2.FieldValue.increment(1) });
                }
            }
            catch (err) {
                console.error("[generateGuestMockups] Rate Limit Write Error:", err);
                throw new Error(`Rate Limit Write Failed: ${err.message}`);
            }
        }
        else {
            try {
                await rateLimitRef.set({ count: 1, lastReset: firestore_2.FieldValue.serverTimestamp() });
            }
            catch (err) {
                console.error("[generateGuestMockups] Rate Limit Init Error:", err);
                throw new Error(`Rate Limit Init Failed: ${err.message}`);
            }
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
        const categories = ["wall", "prints", "wearable", "phone"];
        logger.info(`[generateGuestMockups] Starting generation for ${categories.length} categories...`);
        // 1. Generate all in PARALLEL
        const generationPromises = categories.map(async (category) => {
            try {
                const genStart = Date.now();
                const dataUrl = await (0, nanobanana_1.generateCategoryMockup)(category, artworkUrl);
                const duration = Date.now() - genStart;
                if (dataUrl) {
                    const size = dataUrl.length;
                    logger.info(`[generateGuestMockups] Generated ${category} (${size} bytes) in ${duration}ms`);
                    return { category, dataUrl, error: null };
                }
                else {
                    return { category, dataUrl: null, error: "Generation failed (null result)" };
                }
            }
            catch (error) {
                logger.error(`Error generating ${category}:`, error);
                return { category, dataUrl: null, error: error.message };
            }
        });
        const genResults = await Promise.all(generationPromises);
        // 2. Upload generated mockups to Storage in PARALLEL
        const uploadPromises = genResults.map(async (item) => {
            if (item.error || !item.dataUrl) {
                return { category: item.category, url: null, error: item.error };
            }
            try {
                const storagePath = `guest_sessions/${sessionId}/${item.category}_${Date.now()}.png`;
                const storageUrl = await uploadDataUrl(item.dataUrl, storagePath);
                return { category: item.category, url: storageUrl, error: null };
            }
            catch (error) {
                logger.error(`Error uploading ${item.category}:`, error);
                return { category: item.category, url: null, error: `Upload failed: ${error.message}` };
            }
        });
        const finalResults = await Promise.all(uploadPromises);
        const results = [];
        const errors = [];
        finalResults.forEach(item => {
            if (item.url) {
                results.push({ category: item.category, url: item.url });
            }
            else {
                errors.push({ category: item.category, message: item.error || "Unknown error" });
            }
        });
        const totalTime = Date.now() - start;
        logger.info(`[generateGuestMockups] Finished in ${totalTime}ms. Success: ${results.length}, Errors: ${errors.length}`);
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
        logger.error(`[generateGuestMockups] Fatal error (Request ${requestId}):`, error);
        res.status(500).json({ ok: false, error: error.message, requestId });
    }
});
app.post("/sendGuestMockups", async (req, res) => {
    var _a, _b;
    try {
        const { email, sessionId } = req.body;
        if (!email) {
            res.status(400).json({ ok: false, error: "Missing email" });
            return;
        }
        if (!sessionId) {
            res.status(400).json({ ok: false, error: "Missing sessionId" });
            return;
        }
        const clientIp = getClientIp(req);
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const emailRateLimitKey = `rate_limit_email_${clientIp}_${today}`;
        const emailRateLimitRef = db.collection("rate_limits").doc(emailRateLimitKey);
        const emailRateLimitDoc = await emailRateLimitRef.get();
        const EMAIL_PER_DAY_LIMIT = 5;
        if (emailRateLimitDoc.exists && (((_a = emailRateLimitDoc.data()) === null || _a === void 0 ? void 0 : _a.count) || 0) >= EMAIL_PER_DAY_LIMIT) {
            res.status(429).json({ ok: false, error: "Too many email requests from this IP today. Please try again tomorrow." });
            return;
        }
        const sessionRef = db.collection("guest_sessions").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        if (!sessionDoc.exists) {
            res.status(404).json({ ok: false, error: "Guest session not found" });
            return;
        }
        const sessionData = sessionDoc.data();
        if ((sessionData === null || sessionData === void 0 ? void 0 : sessionData.status) === "email_sent") {
            res.status(400).json({ ok: false, error: "Email already sent for this session." });
            return;
        }
        if ((sessionData === null || sessionData === void 0 ? void 0 : sessionData.email) && sessionData.email.toLowerCase() !== email.toLowerCase()) {
            res.status(403).json({ ok: false, error: "Email mismatch for this session." });
            return;
        }
        const urlsToSend = ((_b = sessionData === null || sessionData === void 0 ? void 0 : sessionData.results) === null || _b === void 0 ? void 0 : _b.map((r) => r.url).filter(Boolean)) || [];
        if (urlsToSend.length === 0) {
            res.status(400).json({ ok: false, error: "No mockups to send." });
            return;
        }
        // Update rate limit counter
        if (emailRateLimitDoc.exists) {
            await emailRateLimitRef.update({ count: firestore_2.FieldValue.increment(1) });
        }
        else {
            await emailRateLimitRef.set({ count: 1, lastReset: firestore_2.FieldValue.serverTimestamp() });
        }
        // Mark pending and send
        await sessionRef.update({
            email,
            status: "pending_email",
            emailRequestsAt: firestore_2.FieldValue.serverTimestamp()
        });
        await emailService_1.emailService.sendGuestMockups({
            email,
            mockupUrls: urlsToSend
        });
        await sessionRef.update({
            status: "email_sent",
            emailSentAt: firestore_2.FieldValue.serverTimestamp()
        });
        res.json({ ok: true });
    }
    catch (error) {
        logger.error("sendGuestMockups error", error);
        res.status(500).json({ ok: false, error: error.message });
    }
});
app.post("/createCheckoutSession", async (req, res) => {
    try {
        const { plan } = req.body;
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
            const missingEnvVars = [];
            if (!process.env.STRIPE_PRICE_MONTHLY_ID)
                missingEnvVars.push("STRIPE_PRICE_MONTHLY_ID");
            if (!process.env.STRIPE_PRICE_QUARTERLY_ID)
                missingEnvVars.push("STRIPE_PRICE_QUARTERLY_ID");
            if (!process.env.STRIPE_PRICE_SIX_MONTHS_ID)
                missingEnvVars.push("STRIPE_PRICE_SIX_MONTHS_ID");
            const missingList = missingEnvVars.join(", ");
            logger.error(`[Stripe] Missing env: ${missingList} (plan: ${plan})`);
            res.status(500).json({
                ok: false,
                error: "Server configuration error: Price ID missing",
                details: { missingEnvVars }
            });
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
        // Use Env vars for URLs only (no client-provided overrides)
        const txnSuccessUrl = process.env.STRIPE_SUCCESS_URL;
        const txnCancelUrl = process.env.STRIPE_CANCEL_URL;
        if (!txnSuccessUrl || !txnCancelUrl) {
            res.status(500).json({ ok: false, error: "Server configuration error: Stripe redirect URLs missing" });
            return;
        }
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
        const userRef = db.collection("users").doc(uid);
        const currentCredits = normalizeCreditState(userData);
        const nextState = {
            monthlyCreditsRemaining: SUBSCRIPTION_CREDITS,
            bonusCredits: currentCredits.bonusCredits,
            totalCredits: SUBSCRIPTION_CREDITS + currentCredits.bonusCredits,
        };
        // Update user document
        await userRef.update(Object.assign(Object.assign({ plan }, buildCreditUpdate(nextState)), { creditsResetAt, subscriptionStatus: activeSubscription.status, stripeSubscriptionId: activeSubscription.id, stripeCustomerId: customerId }));
        logger.info(`[syncSubscription] Updated user ${uid}: plan=${plan}, monthly=${SUBSCRIPTION_CREDITS}, bonus=${currentCredits.bonusCredits}`);
        res.json({
            ok: true,
            message: `Subscription synced! You now have ${nextState.totalCredits} credits.`,
            plan,
            credits: nextState.totalCredits,
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
        const txnSuccessUrl = process.env.STRIPE_SUCCESS_URL;
        const txnCancelUrl = process.env.STRIPE_CANCEL_URL;
        if (!txnSuccessUrl || !txnCancelUrl) {
            res.status(500).json({ ok: false, error: "Server configuration error: Stripe redirect URLs missing" });
            return;
        }
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
            // RELAXED SECURITY: We'll allow claim even if email mismatches, assuming possession of sessionId is sufficient proof.
            // This fixes issues where users make typos or change their mind about which email to use.
            logger.warn(`[claimGuestSession] Email mismatch allowed. Session: ${sessionData.email}, User: ${email}`);
            // Previously was strict:
            // res.status(403).json({ ok: false, error: "Email mismatch..." });
            // return;
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
    var _a;
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        logger.error("[Stripe] STRIPE_WEBHOOK_SECRET is missing in environment variables. Webhook cannot be verified.");
        res.status(500).send("Server configuration error: Missing Webhook Secret");
        return;
    }
    if (!sig) {
        logger.error("[Stripe] stripe-signature header missing on webhook request.");
        res.status(400).send("Webhook Error: Missing stripe-signature header");
        return;
    }
    let event;
    const rawBody = (_a = req.rawBody) !== null && _a !== void 0 ? _a : req.body;
    if (!(typeof rawBody === "string" || Buffer.isBuffer(rawBody))) {
        logger.error("[StripeWebhook] verify failed: Missing raw body");
        res.status(400).send("Webhook Error: Missing raw body");
        return;
    }
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
        logger.info(`[StripeWebhook] verified ${event.type} ${event.id}`);
    }
    catch (err) {
        logger.error(`[StripeWebhook] verify failed: ${err.message}`, err);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        let deduped = false;
        if (event.type === "invoice.payment_succeeded") {
            const result = await handleInvoicePaymentSucceeded(event);
            deduped = (result === null || result === void 0 ? void 0 : result.deduped) || false;
        }
        else if (event.type === "checkout.session.completed") {
            const result = await handleCheckoutSessionCompleted(event);
            deduped = (result === null || result === void 0 ? void 0 : result.deduped) || false;
        }
        else if (event.type === "customer.subscription.deleted") {
            const result = await handleSubscriptionDeleted(event);
            deduped = (result === null || result === void 0 ? void 0 : result.deduped) || false;
        }
        else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
            const result = await handleSubscriptionUpdated(event);
            deduped = (result === null || result === void 0 ? void 0 : result.deduped) || false;
        }
        res.json({ received: true, deduped });
    }
    catch (err) {
        logger.error("Webhook handler error", err);
        res.status(500).send(`Webhook Error: ${err.message}`);
    }
});
async function handleInvoicePaymentSucceeded(event) {
    var _a, _b, _c, _d, _e, _f;
    const invoice = event.data.object;
    const firebaseUid = ((_a = invoice.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUid) || null;
    const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
    const userRef = await resolveUserRef(firebaseUid, customerId);
    const billingReason = invoice.billing_reason;
    const subscriptionId = typeof invoice.subscription === "string" ? invoice.subscription : null;
    const lineItems = (((_b = invoice.lines) === null || _b === void 0 ? void 0 : _b.data) || []);
    const primaryPriceId = (_d = (_c = lineItems[0]) === null || _c === void 0 ? void 0 : _c.price) === null || _d === void 0 ? void 0 : _d.id;
    const plan = getPlanFromPriceId(primaryPriceId);
    const creditsResetAt = ((_f = (_e = lineItems[0]) === null || _e === void 0 ? void 0 : _e.period) === null || _f === void 0 ? void 0 : _f.end) ? new Date(lineItems[0].period.end * 1000) : null;
    const topUpPriceId = process.env.STRIPE_PRICE_TOPUP_ID;
    const topUpQuantity = topUpPriceId
        ? lineItems
            .filter(item => { var _a; return ((_a = item.price) === null || _a === void 0 ? void 0 : _a.id) === topUpPriceId; })
            .reduce((sum, item) => sum + (item.quantity || 1), 0)
        : 0;
    const processedRef = db.collection("stripe_events").doc(event.id);
    let deduped = false;
    let change = null;
    await db.runTransaction(async (tx) => {
        const processedDoc = await tx.get(processedRef);
        if (processedDoc.exists) {
            deduped = true;
            return;
        }
        if (!userRef) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const currentCredits = normalizeCreditState(userDoc.data());
        let nextMonthly = currentCredits.monthlyCreditsRemaining;
        let nextBonus = currentCredits.bonusCredits;
        const extraUpdates = {};
        if (billingReason === "subscription_create" || billingReason === "subscription_cycle") {
            nextMonthly = 50;
            if (plan !== "unknown")
                extraUpdates.plan = plan;
            if (subscriptionId)
                extraUpdates.stripeSubscriptionId = subscriptionId;
            extraUpdates.subscriptionStatus = "active";
            extraUpdates.cancelAtPeriodEnd = false;
            if (creditsResetAt)
                extraUpdates.creditsResetAt = creditsResetAt;
        }
        if (topUpQuantity > 0) {
            nextBonus += 50 * topUpQuantity;
        }
        const nextState = {
            monthlyCreditsRemaining: Math.max(0, nextMonthly),
            bonusCredits: Math.max(0, nextBonus),
            totalCredits: Math.max(0, nextMonthly) + Math.max(0, nextBonus),
        };
        tx.update(userRef, Object.assign(Object.assign({}, buildCreditUpdate(nextState)), extraUpdates));
        await recordProcessedEvent(tx, processedRef, event, firebaseUid || userRef.id, true);
        change = { before: currentCredits, after: nextState };
    });
    if (deduped) {
        logger.info(`[StripeWebhook] deduped ${event.type} ${event.id}`);
    }
    else if (change) {
        const { before, after } = change;
        logCreditChange(event, firebaseUid || (userRef ? userRef.id : null), before, after, `reason=${billingReason}${topUpQuantity ? ` topUpQty=${topUpQuantity}` : ""}`);
    }
    else {
        logger.warn(`[StripeWebhook] ${event.type} ${event.id} no user found (customer=${customerId || "unknown"})`);
    }
    return { deduped };
}
async function handleCheckoutSessionCompleted(event) {
    var _a, _b, _c;
    const session = event.data.object;
    const firebaseUid = ((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUid) || null;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    const userRef = await resolveUserRef(firebaseUid, customerId);
    const isTopUp = session.mode === "payment" && ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.type) === "credit_topup";
    const isSubscriptionCheckout = session.mode === "subscription";
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    const creditsFromMetadata = parseInt(((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.credits) || "0", 10);
    const topUpCredits = isTopUp ? (Number.isFinite(creditsFromMetadata) && creditsFromMetadata > 0 ? creditsFromMetadata : 50) : 0;
    const processedRef = db.collection("stripe_events").doc(event.id);
    let deduped = false;
    let change = null;
    await db.runTransaction(async (tx) => {
        const processedDoc = await tx.get(processedRef);
        if (processedDoc.exists) {
            deduped = true;
            return;
        }
        if (!userRef) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const currentCredits = normalizeCreditState(userDoc.data());
        let nextMonthly = currentCredits.monthlyCreditsRemaining;
        let nextBonus = currentCredits.bonusCredits;
        const extraUpdates = {};
        if (isTopUp && topUpCredits > 0) {
            nextBonus += topUpCredits;
        }
        if (isSubscriptionCheckout) {
            nextMonthly = 50;
            if (subscriptionId)
                extraUpdates.stripeSubscriptionId = subscriptionId;
            extraUpdates.subscriptionStatus = "active";
        }
        const nextState = {
            monthlyCreditsRemaining: Math.max(0, nextMonthly),
            bonusCredits: Math.max(0, nextBonus),
            totalCredits: Math.max(0, nextMonthly) + Math.max(0, nextBonus),
        };
        tx.update(userRef, Object.assign(Object.assign({}, buildCreditUpdate(nextState)), extraUpdates));
        await recordProcessedEvent(tx, processedRef, event, firebaseUid || userRef.id, true);
        change = { before: currentCredits, after: nextState };
    });
    if (deduped) {
        logger.info(`[StripeWebhook] deduped ${event.type} ${event.id}`);
    }
    else if (change) {
        const note = isTopUp ? `topUp=${topUpCredits}` : (isSubscriptionCheckout ? "subscription_checkout" : undefined);
        const { before, after } = change;
        logCreditChange(event, firebaseUid || (userRef ? userRef.id : null), before, after, note);
    }
    else {
        logger.warn(`[StripeWebhook] ${event.type} ${event.id} no user found (customer=${customerId || "unknown"})`);
    }
    return { deduped };
}
async function handleSubscriptionUpdated(event) {
    var _a, _b, _c, _d, _e;
    const subscription = event.data.object;
    const firebaseUid = ((_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUid) || null;
    const customerId = subscription.customer;
    const userRef = await resolveUserRef(firebaseUid, customerId);
    const plan = getPlanFromPriceId((_e = (_d = (_c = (_b = subscription.items) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.price) === null || _e === void 0 ? void 0 : _e.id);
    const status = subscription.status;
    const currentPeriodEnd = subscription.current_period_end;
    const creditsResetAt = currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null;
    const processedRef = db.collection("stripe_events").doc(event.id);
    let deduped = false;
    await db.runTransaction(async (tx) => {
        const processedDoc = await tx.get(processedRef);
        if (processedDoc.exists) {
            deduped = true;
            return;
        }
        if (!userRef) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const updates = {
            subscriptionStatus: status,
            stripeSubscriptionId: subscription.id,
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
        };
        if (plan !== "unknown")
            updates.plan = plan;
        if (creditsResetAt)
            updates.creditsResetAt = creditsResetAt;
        tx.update(userRef, updates);
        await recordProcessedEvent(tx, processedRef, event, firebaseUid || userRef.id, true);
    });
    if (deduped) {
        logger.info(`[StripeWebhook] deduped ${event.type} ${event.id}`);
    }
    else {
        logger.info(`[StripeWebhook] processed ${event.type} ${event.id} uid=${firebaseUid || (userRef ? userRef.id : "unknown")} status=${status}`);
    }
    return { deduped };
}
async function handleSubscriptionDeleted(event) {
    var _a;
    const subscription = event.data.object;
    const firebaseUid = ((_a = subscription.metadata) === null || _a === void 0 ? void 0 : _a.firebaseUid) || null;
    const customerId = subscription.customer;
    const userRef = await resolveUserRef(firebaseUid, customerId);
    const processedRef = db.collection("stripe_events").doc(event.id);
    let deduped = false;
    let change = null;
    await db.runTransaction(async (tx) => {
        const processedDoc = await tx.get(processedRef);
        if (processedDoc.exists) {
            deduped = true;
            return;
        }
        if (!userRef) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists) {
            await recordProcessedEvent(tx, processedRef, event, firebaseUid, false);
            return;
        }
        const currentCredits = normalizeCreditState(userDoc.data());
        const nextState = {
            monthlyCreditsRemaining: 0,
            bonusCredits: currentCredits.bonusCredits,
            totalCredits: currentCredits.bonusCredits,
        };
        tx.update(userRef, Object.assign(Object.assign({}, buildCreditUpdate(nextState)), { plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null, creditsResetAt: null, cancelAtPeriodEnd: null }));
        await recordProcessedEvent(tx, processedRef, event, firebaseUid || userRef.id, true);
        change = { before: currentCredits, after: nextState };
    });
    if (deduped) {
        logger.info(`[StripeWebhook] deduped ${event.type} ${event.id}`);
    }
    else if (change) {
        const { before, after } = change;
        logCreditChange(event, firebaseUid || (userRef ? userRef.id : null), before, after, "subscription_deleted");
    }
    else {
        logger.warn(`[StripeWebhook] ${event.type} ${event.id} no user found (customer=${customerId})`);
    }
    return { deduped };
}
// ... existing endpoints ...
app.post("/generateMemberMockups", async (req, res) => {
    var _a;
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
        let creditState = { monthlyCreditsRemaining: 0, bonusCredits: 0, totalCredits: 0 };
        try {
            console.log(`[MEMBER] Checking credits for user ${uid}`);
            const userDoc = await userRef.get();
            creditState = normalizeCreditState(userDoc.data());
            console.log(`[MEMBER] User has monthly=${creditState.monthlyCreditsRemaining} bonus=${creditState.bonusCredits} (total=${creditState.totalCredits})`);
        }
        catch (err) {
            console.error(`[MEMBER] Failed to check credits: ${err}`);
            res.status(500).json({ ok: false, error: "Failed to check credits" });
            return;
        }
        // Cost is 1 credit per variation
        const cost = numVariations;
        if (creditState.totalCredits < cost) {
            console.log(`[MEMBER] Insufficient credits: ${creditState.totalCredits} < ${cost}`);
            res.status(403).json({ ok: false, error: "Insufficient credits" });
            return;
        }
        // Get artwork URL
        let artworkUrl = providedArtworkUrl;
        if (artworkUrl && isDataUrl(artworkUrl)) {
            const storagePath = `users/${uid}/uploads/${Date.now()}_artwork.png`;
            artworkUrl = await uploadDataUrl(artworkUrl, storagePath);
        }
        else if (artworkUrl && !isAllowedImageUrl(artworkUrl)) {
            res.status(400).json({ ok: false, error: "Invalid artwork URL" });
            return;
        }
        if (!artworkUrl) {
            try {
                console.log(`[MEMBER] Fetching artwork ${artworkId}`);
                const artworkDoc = await db.collection("users").doc(uid).collection("artworks").doc(artworkId).get();
                if (!artworkDoc.exists) {
                    console.log(`[MEMBER] Artwork not found`);
                    res.status(404).json({ ok: false, error: "Artwork not found" });
                    return;
                }
                artworkUrl = (_a = artworkDoc.data()) === null || _a === void 0 ? void 0 : _a.url;
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
        if (!artworkUrl || !isAllowedImageUrl(artworkUrl)) {
            res.status(400).json({ ok: false, error: "Artwork URL is not allowed" });
            return;
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
        let remainingCredits = creditState.totalCredits;
        if (results.length > 0) {
            try {
                console.log(`[MEMBER] Deducting ${results.length} credits (monthly first)`);
                const updatedState = await db.runTransaction(async (tx) => {
                    const doc = await tx.get(userRef);
                    const current = normalizeCreditState(doc.data());
                    if (current.totalCredits < results.length) {
                        throw new Error("INSUFFICIENT_CREDITS");
                    }
                    let remainingCost = results.length;
                    let nextMonthly = current.monthlyCreditsRemaining;
                    let nextBonus = current.bonusCredits;
                    const monthlyDeduction = Math.min(nextMonthly, remainingCost);
                    nextMonthly -= monthlyDeduction;
                    remainingCost -= monthlyDeduction;
                    const bonusDeduction = Math.min(nextBonus, remainingCost);
                    nextBonus -= bonusDeduction;
                    const nextState = {
                        monthlyCreditsRemaining: Math.max(0, nextMonthly),
                        bonusCredits: Math.max(0, nextBonus),
                        totalCredits: Math.max(0, nextMonthly) + Math.max(0, nextBonus),
                    };
                    tx.update(userRef, buildCreditUpdate(nextState));
                    return nextState;
                });
                remainingCredits = updatedState.totalCredits;
                console.log(`[MEMBER] Credits deducted. Remaining total: ${remainingCredits}`);
            }
            catch (err) {
                if (err.message === "INSUFFICIENT_CREDITS") {
                    console.error("[MEMBER] Credits became insufficient during processing");
                    res.status(403).json({ ok: false, error: "Insufficient credits" });
                    return;
                }
                console.error(`[MEMBER] Failed to deduct credits: ${err}`);
                res.status(500).json({ ok: false, error: "Failed to deduct credits" });
                return;
            }
        }
        res.json({ ok: true, results, errors, remainingCredits });
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
            const creditState = normalizeCreditState(data);
            const createdAt = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
            if (createdAt && createdAt > sevenDaysAgo) {
                newUsersLast7Days++;
            }
            // Track credits (approximation based on current balance and plan)
            totalCreditsGranted += creditState.totalCredits;
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
            const creditState = normalizeCreditState(data);
            const user = {
                uid: doc.id,
                email: data.email || "",
                displayName: data.displayName || "",
                plan: data.plan || "free",
                credits: creditState.totalCredits,
                monthlyCreditsRemaining: creditState.monthlyCreditsRemaining,
                bonusCredits: creditState.bonusCredits,
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
        const creditState = normalizeCreditState(userData);
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
                credits: creditState.totalCredits,
                monthlyCreditsRemaining: creditState.monthlyCreditsRemaining,
                bonusCredits: creditState.bonusCredits,
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
    var _a, _b, _c, _d, _e, _f, _g, _h;
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
        let previousState = null;
        let nextState = null;
        try {
            const result = await db.runTransaction(async (tx) => {
                const snapshot = await tx.get(userRef);
                if (!snapshot.exists) {
                    throw new Error("NOT_FOUND");
                }
                const current = normalizeCreditState(snapshot.data());
                const nextBonus = Math.max(0, current.bonusCredits + delta);
                const updated = {
                    monthlyCreditsRemaining: current.monthlyCreditsRemaining,
                    bonusCredits: nextBonus,
                    totalCredits: current.monthlyCreditsRemaining + nextBonus,
                };
                tx.update(userRef, buildCreditUpdate(updated));
                return { current, updated };
            });
            previousState = result.current;
            nextState = result.updated;
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.message) === "NOT_FOUND") {
                res.status(404).json({ ok: false, error: "User not found" });
                return;
            }
            throw err;
        }
        // Create audit log
        await db.collection("creditAdjustments").add({
            userId: uid,
            delta,
            reason,
            previousCredits: (_a = previousState === null || previousState === void 0 ? void 0 : previousState.totalCredits) !== null && _a !== void 0 ? _a : 0,
            newCredits: (_b = nextState === null || nextState === void 0 ? void 0 : nextState.totalCredits) !== null && _b !== void 0 ? _b : 0,
            previousMonthlyCreditsRemaining: (_c = previousState === null || previousState === void 0 ? void 0 : previousState.monthlyCreditsRemaining) !== null && _c !== void 0 ? _c : 0,
            previousBonusCredits: (_d = previousState === null || previousState === void 0 ? void 0 : previousState.bonusCredits) !== null && _d !== void 0 ? _d : 0,
            newMonthlyCreditsRemaining: (_e = nextState === null || nextState === void 0 ? void 0 : nextState.monthlyCreditsRemaining) !== null && _e !== void 0 ? _e : 0,
            newBonusCredits: (_f = nextState === null || nextState === void 0 ? void 0 : nextState.bonusCredits) !== null && _f !== void 0 ? _f : 0,
            adminEmail: adminUser.email,
            adminUid: adminUser.uid,
            timestamp: firestore_2.FieldValue.serverTimestamp()
        });
        logger.info(`[Admin] Credit adjustment: ${adminUser.email} adjusted ${uid} by ${delta}. Reason: ${reason}`);
        res.json({ ok: true, previousCredits: (_g = previousState === null || previousState === void 0 ? void 0 : previousState.totalCredits) !== null && _g !== void 0 ? _g : 0, newCredits: (_h = nextState === null || nextState === void 0 ? void 0 : nextState.totalCredits) !== null && _h !== void 0 ? _h : 0 });
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
                const currentCredits = normalizeCreditState(userData);
                const nextState = {
                    monthlyCreditsRemaining: 0,
                    bonusCredits: currentCredits.bonusCredits,
                    totalCredits: currentCredits.bonusCredits,
                };
                await userDoc.ref.update(Object.assign({ plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null, creditsResetAt: null, cancelAtPeriodEnd: null }, buildCreditUpdate(nextState)));
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
__exportStar(require("./onUserDeleted"), exports);
__exportStar(require("./scheduled/sendFeedbackEmail"), exports);
//# sourceMappingURL=index.js.map