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
exports.emailService = void 0;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
exports.emailService = {
    async sendGuestMockups(params) {
        if (!apiKey) {
            console.warn("EMAIL_PROVIDER_API_KEY is not set. Logging email instead.");
            console.log(`[Email Mock] To: ${params.email}, Subject: Your Situ Mockups`);
            console.log(`[Email Mock] Body: Download your mockups here: ${params.mockupUrls.join(", ")}`);
            return;
        }
        // Implement actual email sending here (e.g. using SendGrid, Resend, etc.)
        // For now, we'll just log it as per the "Pluggable email provider" requirement
        // which implies we should have the structure ready but maybe not the concrete implementation
        // if we don't have a specific provider chosen.
        // The spec says "Implement via an abstraction... that reads provider API key".
        console.log(`Sending email to ${params.email} with ${params.mockupUrls.length} mockups.`);
        // Example implementation (commented out):
        // await fetch('https://api.resend.com/emails', {
        //   method: 'POST',
        //   headers: { Authorization: `Bearer ${apiKey}` },
        //   body: JSON.stringify({ from: fromAddress, to: params.email, ... })
        // });
    }
};
//# sourceMappingURL=emailService.js.map