import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import { db, auth, getBucketSafe } from "./admin";

const TOP_LEVEL_COLLECTIONS = ["rate_limits", "guest_sessions", "creditAdjustments"] as const;
const REFERENCE_COLLECTIONS = ["rate_limits", "guest_sessions", "creditAdjustments", "artworks", "mockups"] as const;
const REFERENCE_FIELDS = ["uid", "userId", "ownerId", "createdBy"] as const;

async function deleteAllSubcollections(docRef: FirebaseFirestore.DocumentReference, depth = 0): Promise<Record<string, number>> {
    const subcollections = await docRef.listCollections();
    const results: Record<string, number> = {};
    for (const sub of subcollections) {
        const snap = await sub.get();
        if (!snap.empty) {
            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        results[sub.id] = snap.size;
        // recurse into nested subcollections of each doc (if any)
        for (const subDoc of snap.docs) {
            const nested = await deleteAllSubcollections(subDoc.ref, depth + 1);
            if (Object.keys(nested).length > 0) {
                results[`${sub.id}/${subDoc.id}`] = Object.values(nested).reduce((a, b) => a + b, 0);
            }
        }
    }
    return results;
}

async function deleteUserStorage(uid: string): Promise<number> {
    const bucket = await getBucketSafe();
    if (!bucket) return 0;
    const prefixes = [
        `users/${uid}/`,
        `artworks/${uid}/`,
        `mockups/${uid}/`
    ];
    let total = 0;
    for (const prefix of prefixes) {
        try {
            const [files] = await bucket.getFiles({ prefix });
            if (files.length === 0) continue;
            await Promise.all(files.map(file => file.delete().catch(err => {
                logger.error(`[Purge] Failed to delete file ${file.name}`, err);
            })));
            total += files.length;
        } catch (err) {
            logger.error(`[Purge] Storage deletion failed for prefix ${prefix}`, err);
        }
    }
    return total;
}

async function deleteTopLevelDocs(uid: string): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const coll of TOP_LEVEL_COLLECTIONS) {
        const path = `${coll}/${uid}`;
        const ref = db.doc(path);
        const snap = await ref.get();
        if (snap.exists) {
            await ref.delete();
            results[path] = true;
        } else {
            results[path] = false;
        }
    }
    return results;
}

async function deleteDocsByFields(collection: string, uid: string, fields: string[]): Promise<number> {
    let deleted = 0;
    for (const field of fields) {
        const snap = await db.collection(collection).where(field, "==", uid).get();
        if (snap.empty) continue;
        const batch = db.batch();
        snap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += snap.size;
    }
    return deleted;
}

async function describeUserFootprint(uid: string) {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const subcollections = await userRef.listCollections();
    const subcollectionDocs: Record<string, number> = {};

    for (const sub of subcollections) {
        const snap = await sub.get();
        subcollectionDocs[sub.id] = snap.size;
    }

    const topLevel: Record<string, boolean> = {};
    for (const coll of TOP_LEVEL_COLLECTIONS) {
        const path = `${coll}/${uid}`;
        const ref = db.doc(path);
        const snap = await ref.get();
        topLevel[path] = snap.exists;
    }

    const references: Record<string, Record<string, number>> = {};
    for (const coll of REFERENCE_COLLECTIONS) {
        for (const field of REFERENCE_FIELDS) {
            const snap = await db.collection(coll).where(field, "==", uid).get();
            if (!snap.empty) {
                references[coll] = references[coll] || {};
                references[coll][field] = snap.size;
            }
        }
    }

    return {
        userDocExists: userSnap.exists,
        subcollections: subcollectionDocs,
        topLevel,
        references,
    };
}

export async function purgeUserByUidOrEmail(uidOrEmail: string, dryRun = false) {
    const summary: any = {
        uid: null,
        email: null,
        deleted: {
            firestore: false,
            storage: false,
            auth: false
        },
        firestoreDetails: {},
        errors: [] as string[]
    };

    let authUser: admin.auth.UserRecord | null = null;
    let firestoreUid: string | null = null;
    let authUid: string | null = null;
    let resolvedEmail: string | null = null;

    try {
        if (uidOrEmail.includes("@")) {
            resolvedEmail = uidOrEmail.toLowerCase();
            try {
                authUser = await auth.getUserByEmail(resolvedEmail);
                authUid = authUser.uid;
            } catch (err: any) {
                if (err.code === "auth/user-not-found") {
                    logger.info(`[Purge] Auth user not found for email ${resolvedEmail}`);
                } else {
                    logger.error(`[Purge] Auth lookup error for ${resolvedEmail}`, { code: err.code, message: err.message });
                    summary.errors.push(`Auth Lookup Error: ${err.message} (Code: ${err.code})`);
                }
            }

            // Separately search Firestore by email to find orphans
            const usersSnap = await db.collection("users").where("email", "in", [resolvedEmail, uidOrEmail]).limit(1).get();
            if (!usersSnap.empty) {
                firestoreUid = usersSnap.docs[0].id;
                logger.info(`[Purge] Located Firestore doc with ID=${firestoreUid} for email=${resolvedEmail}`);
            }
        } else {
            authUid = uidOrEmail;
            try {
                authUser = await auth.getUser(authUid);
                resolvedEmail = authUser.email || null;
            } catch (err: any) {
                if (err.code === "auth/user-not-found") {
                    logger.info(`[Purge] Auth user NOT found for UID ${authUid}`);
                } else {
                    summary.errors.push(`Auth UID Lookup Error: ${err.message} (Code: ${err.code})`);
                }
            }
            firestoreUid = authUid; // Assume they match if starting with UID
        }
    } catch (err: any) {
        logger.warn(`[Purge] Resolution failed for ${uidOrEmail}: ${err.message}`);
    }

    // UID to actually purge data for is prioritized: Auth UID if available, else Firestore UID
    const finalUid = authUid || firestoreUid || (uidOrEmail.includes("@") ? null : uidOrEmail);

    if (!finalUid) {
        summary.errors.push("Could not resolve any UID to purge.");
        summary.email = resolvedEmail;
        return summary;
    }

    summary.uid = finalUid;
    summary.authUid = authUid;
    summary.firestoreUid = firestoreUid;
    summary.email = resolvedEmail;
    summary.uidMismatch = (authUid && firestoreUid && authUid !== firestoreUid) || false;

    if (summary.uidMismatch) {
        summary.errors.push(`UID Mismatch Detected! Auth=${authUid}, Firestore=${firestoreUid}. Purging for prioritized UID: ${finalUid}`);
    }

    // 1. Auth Deletion (Try EARLY to avoid false successes if Auth is blocked)
    try {
        if (!dryRun && finalUid) {
            await auth.deleteUser(finalUid);
            summary.deleted.auth = true;
        } else if (dryRun && finalUid) {
            summary.deleted.auth = true;
        }
    } catch (err: any) {
        logger.error("[Purge] Auth deletion error", err);
        summary.errors.push(`auth: ${err.message}`);

        // If we can't delete from Auth (e.g. 403), we log a warning but proceed 
        // with deleting the Firestore data as requested by the user flow.
        if (!dryRun && err.code !== "auth/user-not-found") {
            summary.errors.push(`WARNING: Could not delete Auth account (403). Proceeding with data cleanup.`);
        }
    }

    let firestoreDeletedCount = 0;

    try {
        const footprint = await describeUserFootprint(finalUid);
        summary.firestoreDetails.before = footprint;

        if (process.env.PURGE_DIAGNOSE === "1") {
            summary.diagnose = footprint;
        }

        if (!dryRun && process.env.PURGE_DIAGNOSE !== "1") {
            summary.firestoreDetails.subcollections = await deleteAllSubcollections(db.collection("users").doc(finalUid));
            const deletedUserDoc = footprint.userDocExists ? 1 : 0;
            await db.collection("users").doc(finalUid).delete();
            firestoreDeletedCount += deletedUserDoc;
            const topLevel = await deleteTopLevelDocs(finalUid);
            summary.firestoreDetails.topLevel = topLevel;
            firestoreDeletedCount += Object.values(topLevel).filter(Boolean).length;

            const perCollection: Record<string, number> = {};
            for (const coll of REFERENCE_COLLECTIONS) {
                const count = await deleteDocsByFields(coll, finalUid, [...REFERENCE_FIELDS]);
                perCollection[coll] = count;
                firestoreDeletedCount += count;
            }
            summary.firestoreDetails.collectionDeletes = perCollection;
        } else {
            // Dry run or Diagnose mode
            summary.firestoreDetails.subcollections = footprint.subcollections;
            summary.firestoreDetails.userDocExists = footprint.userDocExists;
            summary.firestoreDetails.topLevel = footprint.topLevel;
            summary.firestoreDetails.collectionCounts = footprint.references;
        }
    } catch (err: any) {
        logger.error("[Purge] Firestore deletion error", err);
        summary.errors.push(`firestore: ${err.message}`);
    }

    try {
        if (!dryRun) {
            const deletedCount = await deleteUserStorage(finalUid);
            summary.deleted.storage = deletedCount > 0;
            summary.storageDeletedCount = deletedCount;
        } else {
            summary.storageDeletedCount = "would delete";
        }
    } catch (err: any) {
        logger.error("[Purge] Storage deletion error", err);
        summary.errors.push(`storage: ${err.message}`);
    }

    summary.deleted.firestore = firestoreDeletedCount > 0;
    summary.projectId = admin.app().options.projectId || "unknown";

    logger.info(`[Purge] Completed for ${finalUid}: ${JSON.stringify(summary)}`);
    return summary;
}
