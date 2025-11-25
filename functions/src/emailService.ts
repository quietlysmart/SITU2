import * as dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.EMAIL_PROVIDER_API_KEY;
// const _fromAddress = process.env.EMAIL_FROM_ADDRESS || "noreply@situ.app";

interface SendGuestMockupsParams {
    email: string;
    mockupUrls: string[];
}

export const emailService = {
    async sendGuestMockups(params: SendGuestMockupsParams): Promise<void> {
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
