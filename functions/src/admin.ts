import { initializeApp, getApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import * as logger from "firebase-functions/logger";

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined;

export function resolveProjectId(): string | undefined {
    if (projectId) return projectId;
    if (process.env.PROJECT_ID) return process.env.PROJECT_ID;
    if (process.env.FIREBASE_CONFIG) {
        try {
            const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
            return parsed.projectId;
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export function getStorageBucketName(): string {
    const project = resolveProjectId();
    if (process.env.FIREBASE_STORAGE_BUCKET) return process.env.FIREBASE_STORAGE_BUCKET;
    if (process.env.STORAGE_BUCKET) return process.env.STORAGE_BUCKET;
    if (process.env.STORAGE_BUCKET_NAME) return process.env.STORAGE_BUCKET_NAME;
    if (project) return `${project}.firebasestorage.app`;
    return "situ-477910.firebasestorage.app";
}

function resolveBucketName(pid?: string): string {
    return getStorageBucketName();
}

export const adminApp = getApps().length
    ? getApp()
    : initializeApp({
        credential: applicationDefault(),
        ...(resolveProjectId() ? { projectId: resolveProjectId() } : {}),
        ...(resolveBucketName(resolveProjectId()) ? { storageBucket: resolveBucketName(resolveProjectId()) } : {}),
    });

export const db = getFirestore(adminApp);
export const auth = getAuth(adminApp);

export async function getBucketSafe() {
    const bucketName = resolveBucketName(resolveProjectId());
    if (!bucketName) return null;
    try {
        const bucket = getStorage(adminApp).bucket(bucketName);
        const [exists] = await bucket.exists();
        if (!exists) {
            logger.warn(`[admin] Storage bucket ${bucketName} not found; skipping storage operations.`);
            return null;
        }
        return bucket;
    } catch (err) {
        logger.warn("[admin] Could not access storage bucket; skipping storage operations.", err);
        return null;
    }
}
