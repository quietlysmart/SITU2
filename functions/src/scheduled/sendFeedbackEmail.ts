import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { emailService } from "../emailService";

const db = admin.firestore();

export const sendFeedbackEmail = onSchedule("every 24 hours", async (event) => {
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
                await emailService.sendFeedbackEmail(data.email, data.displayName);
                await doc.ref.update({
                    feedbackEmailSent: true,
                    feedbackEmailSentAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.log(`[FEEDBACK] Email sent to ${data.email}`);
            } catch (error) {
                console.error(`[FEEDBACK] Failed to send to ${data.email}`, error);
            }
        }
    } catch (error) {
        console.error("[FEEDBACK] Job failed", error);
    }
});
