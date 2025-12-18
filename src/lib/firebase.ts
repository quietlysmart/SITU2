import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if config is valid
const isConfigValid = Object.values(firebaseConfig).every(value => !!value);

if (!isConfigValid) {
    console.warn("Firebase config is missing or incomplete. Please check your .env file. Firebase features will be disabled.");
}

// Project ID Validation
const EXPECTED_PROJECT_ID = "situ-477910";
if (firebaseConfig.projectId && firebaseConfig.projectId !== EXPECTED_PROJECT_ID) {
    console.error(`[Firebase] PROJECT ID MISMATCH! Expected ${EXPECTED_PROJECT_ID}, got ${firebaseConfig.projectId}. Critical failure imminent.`);
}

// Initialize Firebase with error handling
let app: any;
let auth: any;
let db: any;
let storage: any;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch(err => {
        console.warn("[Firebase] Failed to set local persistence", err);
    });
    console.log("[Firebase] initialized", { projectId: firebaseConfig.projectId, authDomain: firebaseConfig.authDomain });
    // db = getFirestore(app);
    // Use initializeFirestore to force long polling and avoid QUIC errors
    db = initializeFirestore(app, { experimentalForceLongPolling: true });
    storage = getStorage(app);
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Failed to initialize Firebase:", error);
    // Provide mock objects to prevent crashes
    auth = null;
    db = null;
    storage = null;
}

export { auth, db, storage };
