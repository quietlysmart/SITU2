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
exports.validateUrls = exports.Urls = void 0;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
/**
 * URL CONFIGURATION
 * Centralized logic for generating absolute URLs for emails and external links.
 */
// Helper to get base URL with lazy validation
const getBaseUrl = () => {
    const url = process.env.APP_BASE_URL;
    if (!url) {
        throw new Error("APP_BASE_URL is not set in environment variables.");
    }
    return url;
};
const getGoogleFormUrl = () => {
    return process.env.GOOGLE_FORM_URL || "https://docs.google.com/forms/d/e/1FAIpQLSc3UMMIEpwxO05bsf_LFfHyTCz9pAO-tGV_BbNmOWaE79_bAg/viewform?usp=header";
};
/**
 * Helper to ensure valid absolute URLs
 */
const buildUrl = (path) => {
    const baseUrl = getBaseUrl();
    try {
        const url = new URL(path, baseUrl);
        return url.toString();
    }
    catch (e) {
        throw new Error(`Invalid URL configuration: base='${baseUrl}', path='${path}'`);
    }
};
exports.Urls = {
    signup: () => buildUrl("/signup"),
    studio: () => buildUrl("/member/studio"),
    pricing: () => buildUrl("/pricing"),
    guest: () => buildUrl("/guest"),
    feedback: () => getGoogleFormUrl(),
    // Helper for custom paths if needed
    custom: (path) => buildUrl(path)
};
// Safe validation function that doesn't throw, just logs
const validateUrls = () => {
    try {
        const baseUrl = process.env.APP_BASE_URL;
        console.log("🔗 URL Configuration Check:");
        console.log(`   Base URL: ${baseUrl || "(missing)"}`);
        if (baseUrl) {
            console.log(`   Signup:   ${exports.Urls.signup()}`);
            if (!baseUrl.startsWith("https://") && !baseUrl.includes("localhost")) {
                console.warn("⚠️ APP_BASE_URL should be an absolute HTTPS URL (in production).");
            }
        }
        else {
            console.warn("⚠️ APP_BASE_URL is missing. Email links will fail if sent.");
        }
    }
    catch (e) {
        console.error("URL Validation failed:", e);
    }
};
exports.validateUrls = validateUrls;
//# sourceMappingURL=urls.js.map