import * as dotenv from "dotenv";

dotenv.config();

import { Urls } from "./config/urls";

const apiKey = process.env.BREVO_API_KEY;
const senderEmail = process.env.BREVO_SENDER_EMAIL || "noreply@situ.app";
const senderName = process.env.BREVO_SENDER_NAME || "Situ App";

interface SendGuestMockupsParams {
    email: string;
    mockupUrls: string[];
}

export const emailService = {
    async sendGuestMockups(params: SendGuestMockupsParams): Promise<void> {
        if (!apiKey) {
            throw new Error("Email service unavailable: BREVO_API_KEY not set");
        }

        console.log(`[Email] Sending mockups to ${params.email} (${params.mockupUrls.length} files) via Brevo.`);

        const htmlContent = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #4A3B32; background-color: #FDFBF7; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #4A3B32; margin: 0; font-family: Georgia, serif; font-size: 28px;">Your Situ Mockups</h1>
                </div>

                <div style="background-color: #FFFFFF; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                    <p style="font-size: 16px; line-height: 1.6; color: #4A3B32; margin-top: 0;">
                        Hello,
                    </p>
                    <p style="font-size: 16px; line-height: 1.6; color: #4A3B32;">
                        Here are the mockups you generated with Situ. Seeing your artwork on real products brings it to life!
                    </p>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 25px 0;">
                        ${params.mockupUrls.map((url, index) => `
                            <div style="margin-bottom: 15px; text-align: center;">
                                <a href="${url}" target="_blank" style="text-decoration: none; display: block;">
                                    <img src="${url}" alt="Mockup ${index + 1}" style="width: 100%; max-width: 250px; border-radius: 8px; border: 1px solid #eee; object-fit: cover; aspect-ratio: 1/1;">
                                </a>
                                <div style="margin-top: 8px;">
                                    <a href="${url}" style="color: #9C826B; text-decoration: none; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Download Image</a>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div style="background-color: #F8F5F1; padding: 25px; border-radius: 12px; text-align: center; margin-top: 35px; border: 1px dashed #CAB8A5;">
                        <h3 style="margin-top: 0; color: #4A3B32; font-family: Georgia, serif; font-size: 20px;">Unlock Your Full Creative Potential</h3>
                        <p style="font-size: 15px; color: #666; line-height: 1.5; margin-bottom: 20px;">
                            Create a free Situ account to generate significantly more mockups with <strong>any artwork</strong> you upload.
                        </p>
                        <ul style="text-align: left; color: #555; font-size: 14px; margin-bottom: 25px; padding-left: 20px;">
                            <li style="margin-bottom: 8px;">Access premium products: Tote Bags, Pillows, Notebooks, Mugs, and more.</li>
                            <li style="margin-bottom: 8px;">Control formats: Portrait, Square, and Landscape aspect ratios.</li>
                            <li style="margin-bottom: 8px;">Organize your portfolio in a dedicated studio.</li>
                        </ul>
                        <a href="${Urls.signup()}" style="background-color: #4A3B32; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; transition: background-color 0.2s;">Create your free Situ account</a>
                         <p style="font-size: 12px; color: #888; margin-top: 15px;">
                            (Includes 12 free credits to start!)
                        </p>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
                    <p>© ${new Date().getFullYear()} Situ. All rights reserved.</p>
                </div>
            </div>
        `;

        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': apiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: {
                        name: senderName,
                        email: senderEmail
                    },
                    to: [{ email: params.email }],
                    subject: "Your Situ Mockups",
                    htmlContent: htmlContent
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Brevo API Error: ${response.status} ${errorText}`);
            }

            console.log(`Email sent successfully to ${params.email}`);
        } catch (error) {
            console.error("Failed to send email via Brevo:", error);
            throw error;
        }
    },

    async sendWelcomeEmail(email: string, displayName?: string): Promise<void> {
        if (!apiKey) {
            throw new Error("Email service unavailable: BREVO_API_KEY not set");
        }

        console.log(`[Email] Sending welcome email to ${email}`);

        const nameGreeting = displayName ? `Hi ${displayName},` : "Hi there,";

        const htmlContent = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #4A3B32; background-color: #FDFBF7; padding: 40px 20px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #4A3B32; margin: 0; font-family: Georgia, serif; font-size: 28px;">Welcome to Situ</h1>
                </div>

                <div style="background-color: #FFFFFF; padding: 30px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05);">
                    <p style="font-size: 16px; line-height: 1.6; color: #4A3B32; margin-top: 0;">
                        ${nameGreeting}
                    </p>
                    <p style="font-size: 16px; line-height: 1.6; color: #4A3B32;">
                        Welcome to Situ – the place where your artwork comes to life on real products.
                    </p>
                    <p style="font-size: 16px; line-height: 1.6; color: #4A3B32;">
                        We built Situ to help artists visualize their work in the real world:
                    </p>
                    
                    <ul style="color: #4A3B32; font-size: 16px; line-height: 1.6; padding-left: 20px; margin-bottom: 25px;">
                        <li style="margin-bottom: 10px;">Make your portfolio more convincing by showing finished products.</li>
                        <li style="margin-bottom: 10px;">Present professional concepts to clients or galleries.</li>
                        <li style="margin-bottom: 10px;">Test how different artworks feel in different settings.</li>
                    </ul>

                    <div style="text-align: center; margin: 35px 0;">
                        <a href="${Urls.studio()}" style="background-color: #4A3B32; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: bold; font-size: 16px; display: inline-block; transition: background-color 0.2s;">Open Your Studio</a>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px; font-size: 12px; color: #999;">
                    <p>© ${new Date().getFullYear()} Situ. All rights reserved.</p>
                </div>
            </div>
        `;

        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': apiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: {
                        name: senderName,
                        email: senderEmail
                    },
                    to: [{ email: email }],
                    subject: "Welcome to Situ – your artwork, on real products",
                    htmlContent: htmlContent
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Brevo API Error: ${response.status} ${errorText}`);
            }

            console.log(`Welcome Email sent successfully to ${email}`);
        } catch (error) {
            console.error("Failed to send welcome email via Brevo:", error);
            // We don't throw here to avoid crashing the trigger function completely
        }
    },
    async sendFeedbackEmail(email: string, displayName?: string): Promise<void> {
        if (!apiKey) throw new Error("BREVO_API_KEY not set");

        const nameGreeting = displayName ? `Hi ${displayName},` : "Hi there,";

        const htmlContent = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #4A3B32; padding: 40px 20px;">
                <p style="font-size: 16px; line-height: 1.6;">${nameGreeting}</p>
                <p style="font-size: 16px; line-height: 1.6;">Hope you’re enjoying Situ.</p>
                <p style="font-size: 16px; line-height: 1.6;">Could you spare 60 seconds to share feedback? It helps me fix bugs and prioritize features.</p>
                <p style="font-size: 16px; line-height: 1.6;">Fill out this form: <a href="${Urls.feedback()}" style="color: #4A3B32; font-weight: bold;">Feedback Form</a></p>
                <p style="font-size: 16px; line-height: 1.6;">As a thank you, I’ll manually add bonus credits to your account after you submit.</p>
                <p style="font-size: 16px; line-height: 1.6; margin-top: 20px;">Thanks,<br>Matt</p>
            </div>
        `;

        await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: senderName, email: senderEmail },
                to: [{ email }],
                subject: "Quick question - how’s Situ going?",
                htmlContent
            })
        });
    }
};
