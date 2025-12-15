import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

const db = admin.firestore();
const bucket = admin.storage().bucket();

export const onUserDeleted = functions.auth.user().onDelete(async (user) => {
    const uid = user.uid;
    console.log(`[CLEANUP] Deleting data for user ${uid}`);

    try {
        // 1. Delete Storage Files (users/{uid}/*)
        const prefix = `users/${uid}/`;
        await bucket.deleteFiles({ prefix });
        console.log(`[CLEANUP] Storage files deleted for ${prefix}`);

        // 2. Delete Firestore User Doc (and subcollections recursively)
        const userRef = db.collection("users").doc(uid);

        // Note: recursiveDelete is available in firebase-admin/firestore (newer versions) or needs manual implementation.
        // For simplicity and standard usage in Cloud Functions:
        await db.recursiveDelete(userRef);

        console.log(`[CLEANUP] Firestore doc and subcollections deleted for ${uid}`);

        // 3. Delete Guest Sessions linked to Email
        if (user.email) {
            const email = user.email;
            const guestSessionsSnap = await db.collection("guest_sessions")
                .where("email", "==", email)
                .get();

            if (!guestSessionsSnap.empty) {
                console.log(`[CLEANUP] Found ${guestSessionsSnap.size} guest sessions for ${email}`);
                const batch = db.batch();
                guestSessionsSnap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                console.log(`[CLEANUP] Deleted guest sessions.`);
            }
        }

    } catch (error) {
        console.error(`[CLEANUP] Failed to cleanup user ${uid}`, error);
        // We log error but don't rethrow to avoid infinite retries on a deleted user
    }
});
