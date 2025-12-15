import * as dotenv from "dotenv";

dotenv.config();

/**
 * URL CONFIGURATION
 * Centralized logic for generating absolute URLs for emails and external links.
 */

// Helper to get base URL with lazy validation
const getBaseUrl = (): string => {
    const url = process.env.APP_BASE_URL;
    if (!url) {
        throw new Error("APP_BASE_URL is not set in environment variables.");
    }
    return url;
};

const getGoogleFormUrl = (): string => {
    return process.env.GOOGLE_FORM_URL || "https://docs.google.com/forms/d/e/1FAIpQLSc3UMMIEpwxO05bsf_LFfHyTCz9pAO-tGV_BbNmOWaE79_bAg/viewform?usp=header";
};


/**
 * Helper to ensure valid absolute URLs
 */
const buildUrl = (path: string): string => {
    const baseUrl = getBaseUrl();
    try {
        const url = new URL(path, baseUrl);
        return url.toString();
    } catch (e) {
        throw new Error(`Invalid URL configuration: base='${baseUrl}', path='${path}'`);
    }
};

export const Urls = {
    signup: () => buildUrl("/signup"),
    studio: () => buildUrl("/member/studio"),
    pricing: () => buildUrl("/pricing"),
    guest: () => buildUrl("/guest"),
    feedback: () => getGoogleFormUrl(),

    // Helper for custom paths if needed
    custom: (path: string) => buildUrl(path)
};

// Safe validation function that doesn't throw, just logs
export const validateUrls = () => {
    try {
        const baseUrl = process.env.APP_BASE_URL;
        console.log("🔗 URL Configuration Check:");
        console.log(`   Base URL: ${baseUrl || "(missing)"}`);

        if (baseUrl) {
            console.log(`   Signup:   ${Urls.signup()}`);
            if (!baseUrl.startsWith("https://") && !baseUrl.includes("localhost")) {
                console.warn("⚠️ APP_BASE_URL should be an absolute HTTPS URL (in production).");
            }
        } else {
            console.warn("⚠️ APP_BASE_URL is missing. Email links will fail if sent.");
        }
    } catch (e) {
        console.error("URL Validation failed:", e);
    }
};
