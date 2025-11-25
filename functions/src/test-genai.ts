import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from the same directory
dotenv.config({ path: path.join(__dirname, "../.env") });

const apiKey = process.env.GOOGLE_GENAI_API_KEY;

if (!apiKey) {
    console.error("Error: GOOGLE_GENAI_API_KEY is not set in .env");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
    console.log("Testing Google GenAI connection...");
    console.log(`Using API Key: ${apiKey!.substring(0, 5)}...`);

    try {
        // 1. List Models via REST API
        console.log("\n--- Listing Available Models (REST) ---");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);

        if (!response.ok) {
            throw new Error(`Failed to list models: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const models = data.models || [];
        console.log(`Found ${models.length} models:`);
        models.forEach((m: any) => console.log(`- ${m.name} (${m.supportedGenerationMethods?.join(", ")})`));

        // 2. Test Image Generation capabilities

        // Option A: Try Gemini 2.5 Pro (if it supports image output)
        // const geminiModelId = "gemini-2.5-pro-preview-03-25";
        // console.log(`\n--- Testing Image Generation with ${geminiModelId} ---`);
        // try {
        //     const model = genAI.getGenerativeModel({ model: geminiModelId });
        //     const result = await model.generateContent("Generate a cute cartoon image of a robot holding a paintbrush.");
        //     const response = await result.response;
        //     console.log("Gemini Response parts:", JSON.stringify(response.candidates?.[0]?.content?.parts, null, 2));
        // } catch (e: any) {
        //     console.log("Gemini generation failed:", e.message);
        // }

        // Option B: Try Imagen 4.0 via REST (predict)
        // Imagen usually requires a different endpoint: https://us-central1-aiplatform.googleapis.com/... or similar if on Vertex
        // But via AI Studio (generativelanguage), it might be different.
        // Let's try the `predict` method style if possible, or just standard generateContent if it maps.
        // The listModels output said `predict` is supported for Imagen.
        // There is no standard `predict` in GoogleGenerativeAI SDK (it's for Vertex AI SDK).
        // We might need to make a raw REST call to the predict endpoint if it exists for this API.
        // However, `generativelanguage.googleapis.com` usually uses `generateContent` or `generateImages` (deprecated/beta).

        // Let's try to hit the REST endpoint for Imagen if we can guess it.
        // Usually: POST https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-preview-06-06:predict

        // Option C: Try NanoBanana Pro Preview (The user's custom model?)
        const nanoModelId = "nano-banana-pro-preview";
        console.log(`\n--- Testing NanoBanana Pro with ${nanoModelId} ---`);
        try {
            const model = genAI.getGenerativeModel({ model: nanoModelId });

            // Create a simple red square base64 image for testing
            const dummyImageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

            const imagePart = {
                inlineData: {
                    data: dummyImageBase64,
                    mimeType: "image/png"
                }
            };

            const result = await model.generateContent(["Generate a mockup of this artwork on a wall.", imagePart]);
            const response = await result.response;
            console.log("NanoBanana Success!");
            if (response.candidates && response.candidates.length > 0) {
                console.log("Candidates found:", response.candidates.length);
                const parts = response.candidates[0].content.parts;
                console.log("Parts found:", parts.length);
                if (parts[0].text) console.log("Text part found (might be URL or base64)");
                if (parts[0].inlineData) console.log("Inline Data found");
            }

        } catch (e: any) {
            console.log("NanoBanana generation failed:", e.message);
        }

    } catch (error: any) {
        console.error("\n!!! Error !!!");
        console.error(error.message);
    }
}

test();
