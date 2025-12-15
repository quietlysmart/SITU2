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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFeedbackEmail = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const emailService_1 = require("../emailService");
const db = admin.firestore();
exports.sendFeedbackEmail = (0, scheduler_1.onSchedule)("every 24 hours", async (event) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    console.log(`[FEEDBACK] Running check for users created between ${fortyEightHoursAgo.toISOString()} and ${twentyFourHoursAgo.toISOString()}`);
    try {
        const snapshot = await db.collection("users")
            .where("createdAt", "<=", admin.firestore.Timestamp.fromDate(twentyFourHoursAgo))
            .where("createdAt", ">", admin.firestore.Timestamp.fromDate(fortyEightHoursAgo))
            .get();
        console.log(`[FEEDBACK] Found ${snapshot.size} users in window.`);
        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Skip if already sent or clearly invalid (no email)
            if (data.feedbackEmailSent || !data.email) {
                continue;
            }
            try {
                await emailService_1.emailService.sendFeedbackEmail(data.email, data.displayName);
                await doc.ref.update({
                    feedbackEmailSent: true,
                    feedbackEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[FEEDBACK] Email sent to ${data.email}`);
            }
            catch (error) {
                console.error(`[FEEDBACK] Failed to send to ${data.email}`, error);
            }
        }
    }
    catch (error) {
        console.error("[FEEDBACK] Job failed", error);
    }
});
//# sourceMappingURL=sendFeedbackEmail.js.map