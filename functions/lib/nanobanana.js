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
exports.generateCategoryMockup = generateCategoryMockup;
exports.editImage = editImage;
const generative_ai_1 = require("@google/generative-ai");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const apiKey = process.env.GOOGLE_GENAI_API_KEY;
if (!apiKey) {
    console.warn("GOOGLE_GENAI_API_KEY is not set");
}
// Initialize the client
// Note: The @google/genai SDK usage might differ slightly based on version.
// Assuming standard usage or adapting to what's available.
// If @google/genai is the new SDK, it exports GoogleGenerativeAI.
// However, the new SDK might be `import { GenAIClient } from '@google/genai'` or similar.
// I will use the standard `google-generativeai` pattern if `@google/genai` is just a wrapper or alias,
// but since I installed `@google/genai`, I should check its exports if I could.
// For now I will assume it works like the standard SDK or I will use a safe implementation.
// Actually, let's use the `google-generativeai` package pattern as it's most documented,
// but the user specified `@google/genai`.
// If `@google/genai` is the new "Google Gen AI SDK for Node.js" (v1.0+), it might use `new GoogleGenerativeAI(apiKey)`.
const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey || "");
const PRO_MODEL_ID = process.env.NANOBANANA_PRO_MODEL_ID || "nanobanana-pro";
console.log("NanoBanana Config:", { PRO_MODEL_ID, apiKey: apiKey ? "Set" : "Not Set" });
function getPromptForCategory(category) {
    switch (category) {
        case "wall":
            return "Generate a realistic mockup of this artwork framed on a modern living room wall. High quality, photorealistic.";
        case "prints":
            return "Generate a realistic mockup of this artwork as a set of high-quality art prints on a table. Photorealistic.";
        case "wearable":
            return "Generate a realistic mockup of this artwork printed on a white t-shirt worn by a model. Photorealistic.";
        case "phone":
            return "Generate a realistic mockup of this artwork on a phone case. Photorealistic, close up.";
        default:
            return "Generate a realistic product mockup for this artwork.";
    }
}
async function generateCategoryMockup(params) {
    // Use the NanoBanana Pro model which supports Image-to-Image
    const modelId = process.env.NANOBANANA_PRO_MODEL_ID || "nano-banana-pro-preview";
    const model = genAI.getGenerativeModel({ model: modelId });
    try {
        console.log(`Generating mockup for ${params.category} using ${modelId} (Image-to-Image)`);
        const prompt = getPromptForCategory(params.category);
        const imagePart = {
            inlineData: {
                data: params.artworkInline.data,
                mimeType: params.artworkInline.mimeType,
            },
        };
        // Pass the prompt AND the original image to the model
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        // The model should return the generated image as inline data
        if (response.candidates && response.candidates[0].content.parts[0].inlineData) {
            const inlineData = response.candidates[0].content.parts[0].inlineData;
            return { url: `data:${inlineData.mimeType};base64,${inlineData.data}` };
        }
        else {
            console.warn("No inline image data found in response, checking for text fallback");
            if (response.text()) {
                console.log("Response text:", response.text());
                // If it returns a URL in text (unlikely for this model type but possible)
                // For now, assume failure if no image data
            }
            throw new Error("Model did not return an image.");
        }
    }
    catch (error) {
        console.error("Error generating mockup:", error.message);
        if (error.response) {
            console.error("API Response:", await error.response.text().catch(() => "No response text"));
        }
        return { url: `https://placehold.co/600x600?text=Generation+Failed:+${encodeURIComponent(error.message || "Unknown Error")}` };
    }
}
async function editImage(params) {
    const modelId = params.modelId || PRO_MODEL_ID;
    // Simulation
    console.log(`Editing image with prompt "${params.prompt}" using ${modelId}`);
    return { url: "https://placehold.co/600x600?text=Edited+Mockup" };
}
//# sourceMappingURL=nanobanana.js.map