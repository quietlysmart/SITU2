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
exports.onUserDeleted = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const bucket = admin.storage().bucket();
exports.onUserDeleted = functions.auth.user().onDelete(async (user) => {
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
    }
    catch (error) {
        console.error(`[CLEANUP] Failed to cleanup user ${uid}`, error);
        // We log error but don't rethrow to avoid infinite retries on a deleted user
    }
});
//# sourceMappingURL=onUserDeleted.js.map