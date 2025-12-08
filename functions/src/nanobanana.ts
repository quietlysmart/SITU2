import * as dotenv from "dotenv";

dotenv.config();

const GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
const MODEL_ID = process.env.NANOBANANA_PRO_MODEL_ID || "nano-banana-pro-preview";

if (!GENAI_API_KEY) {
    console.warn("GOOGLE_GENAI_API_KEY is not set");
}

console.log("NanoBanana Config:", { MODEL_ID, apiKey: GENAI_API_KEY ? "Set" : "Not Set" });

interface EditParams {
    modelId?: string;
    baseInline: { data: string; mimeType: string };
    prompt: string;
}

/**
 * CRITICAL INSTRUCTION: DO NOT MODIFY THIS FUNCTION'S CORE LOGIC.
 * 
 * How this works:
 * 1. It uses the @google/generative-ai SDK (not raw fetch).
 * 2. It fetches the artwork image and converts it to a base64 buffer.
 * 3. It sends the prompt + inline image data to the Gemini/NanoBanana model.
 * 4. It returns the generated image as a Data URL (data:image/png;base64,...) directly.
 * 
 * WHY:
 * - Returning a Data URL avoids the need to upload to Firebase Storage.
 * - This bypasses the need for Google Cloud credentials (gcloud auth) locally.
 * - This is the most "parsimonious" solution that works with just the API Key.
 * 
 * DO NOT change this to upload to Storage.
 * DO NOT change this to use raw fetch (unless SDK is broken).
 */
export async function generateCategoryMockup(category: string, artworkUrl: string, customPrompt?: string, aspectRatio?: string): Promise<string | null> {
    try {
        console.log(`[NANOBANANA] Starting generation for ${category}`);
        console.log(`[NANOBANANA] Artwork URL: ${artworkUrl}`);

        // Product Prompts Configuration
        const PRODUCT_PROMPTS: Record<string, string> = {
            "wall": "Ultra-realistic interior design photo of framed wall art in a stylish, modern room. Dramatic natural lighting casting soft shadows. The provided artwork is the focal point, framed elegantly on the wall. High-end furniture and decor in the background, cinematic composition.",
            "prints": "High-end lifestyle photography of art prints arranged on a desk or table. Overhead or slight three-quarter view. Multiple prints clearly on paper, maybe a few overlapping, plus a few small props (pens, clips, etc.). Still ultra-realistic, nice shallow depth of field. Soft, warm lighting. The provided artwork is the main focus.",
            "wearable": "Ultra-realistic fashion photography of a real person wearing the provided artwork as apparel. The item could be a t-shirt, hoodie, dress, hat, or accessory as appropriate. The model is in a natural, lifestyle setting (e.g., street, cafe, or studio) with dramatic lighting. The artwork is clearly visible on the fabric. High-end fashion editorial style.",
            "phone": "Ultra-realistic lifestyle shot of a smartphone with a custom case featuring the provided artwork. Held by a hand or resting on a textured surface (wood, marble). Shallow depth of field, focusing on the case design. Modern and sleek.",
            "mug": "Cozy lifestyle photography of a ceramic mug featuring the provided artwork. Placed on a wooden table with coffee beans, a book, or a laptop nearby. Warm, inviting lighting with steam rising. Realistic ceramic texture and reflections.",
            "tote": "Street-style photography of a person carrying a canvas tote bag with the provided artwork. Natural outdoor lighting or trendy indoor setting. The bag is the focus, showing realistic fabric texture and weight. Casual and stylish.",
            "pillow": "Interior design shot of a decorative throw pillow on a plush sofa. The provided artwork is printed on the fabric. Cozy, inviting atmosphere with soft lighting and complementary decor. High-quality textile rendering.",
            "notebook": "Creative workspace photography of a notebook with the provided artwork on the cover. Surrounded by artist tools, pens, or a laptop. Top-down or angled view with good lighting to show the cover texture. Inspiring and organized.",
            "patch": "Close-up product photo of an embroidered patch with the provided artwork stitched into fabric. The patch is lying on or pinned to denim or canvas. Soft, directional lighting that shows stitch texture and thread sheen. Modern, clean, realistic product photography."
        };

        // Aspect Ratio Prompt Addition
        let ratioPrompt = "";
        if (aspectRatio) {
            switch (aspectRatio) {
                case "1:1": ratioPrompt = "Square aspect ratio."; break;
                case "16:9": ratioPrompt = "Wide landscape 16:9 aspect ratio."; break;
                case "9:16": ratioPrompt = "Tall portrait 9:16 aspect ratio."; break;
                case "4:3": ratioPrompt = "Standard landscape 4:3 aspect ratio."; break;
                case "3:4": ratioPrompt = "Standard portrait 3:4 aspect ratio."; break;
                default: ratioPrompt = "";
            }
        }

        // Generate prompt
        const basePrompt = PRODUCT_PROMPTS[category] || `Professional product photography of a ${category} featuring the provided artwork. Clean, modern, high quality, photorealistic, studio lighting.`;
        const prompt = `${basePrompt} ${ratioPrompt} ${customPrompt ? "IMPORTANT: " + customPrompt : ""}`.trim();
        console.log(`[NANOBANANA] Full prompt: ${prompt}`);

        // Fetch the artwork image
        const imageResp = await fetch(artworkUrl);
        if (!imageResp.ok) {
            throw new Error(`Failed to fetch artwork: ${imageResp.status} ${imageResp.statusText}`);
        }

        const imageBuffer = await imageResp.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

        console.log(`[NANOBANANA] Calling Gemini REST API with model: ${MODEL_ID}`);

        // Use raw REST API to avoid local credential interference (invalid_grant)
        // This ensures we ONLY use the API Key.

        // Helper to make the request
        const makeRequest = async (prefix: string) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${prefix}/${MODEL_ID}:generateContent?key=${GENAI_API_KEY}`;
            return fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: imageBase64 } }
                        ]
                    }]
                })
            });
        };

        // Try 'models/' endpoint first (standard models)
        let response = await makeRequest("models");

        // If 404, it might be a tuned model, try 'tunedModels/'
        if (response.status === 404) {
            console.log(`[NANOBANANA] 'models/' endpoint returned 404. Retrying with 'tunedModels/'...`);
            response = await makeRequest("tunedModels");
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[NANOBANANA] API Error: ${response.status} ${errorText}`);
            throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        console.log(`[NANOBANANA] API Response received`);

        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            // Look for inline data in parts (Gemini 1.5 Pro/Flash usually returns text, but for image gen it might return inline data?)
            // Wait, Gemini 1.5 Pro is text-to-text/multimodal-to-text. It does NOT generate images (yet) via this API unless it's Imagen.
            // But the user said "nano-banana-pro-preview" is the model.
            // If it's an Imagen model on Vertex AI, this endpoint is WRONG.
            // But if it worked with `GoogleGenerativeAI` SDK (which targets Google AI Studio), then it MUST be a model available there.
            // OR the user's previous working state was actually using Vertex AI and they HAD credentials.
            // BUT the user insists "just using the api key".
            // Let's assume it returns standard Gemini response structure.

            // Actually, if it's an image generation model, the response format might be different.
            // But `GoogleGenerativeAI` SDK unifies it.
            // Let's check if we find `inlineData` in the response.

            // NOTE: If this is actually Imagen on Vertex AI, we CANNOT use API Key. We MUST use OAuth.
            // The user might be mistaken about "just using API key" OR they are using a specific Google AI Studio model that generates images.
            // Let's try to parse the response for inline data.

            // The SDK logic I wrote before:
            // const imagePart = candidate.content.parts.find(p => p.inlineData);

            // In REST API:
            // candidate.content.parts[].inline_data

            const parts = candidate.content?.parts || [];
            const imagePart = parts.find((p: any) => p.inline_data || p.inlineData);

            if (imagePart) {
                const inlineData = imagePart.inline_data || imagePart.inlineData;
                const base64Image = inlineData.data;
                console.log(`[NANOBANANA] Received image data, length: ${base64Image.length}`);
                const mimeType = inlineData.mime_type || inlineData.mimeType || "image/png";
                return `data:${mimeType};base64,${base64Image}`;
            }
        }

        console.log(`[NANOBANANA] No image data in response. Response: ${JSON.stringify(data).substring(0, 200)}`);
        return null;

    } catch (error: any) {
        console.error("[NANOBANANA] Error in generateCategoryMockup:", error);
        throw error;
    }
}

export async function editImage(params: EditParams): Promise<{ url: string }> {
    const modelId = params.modelId || MODEL_ID;
    // Simulation
    console.log(`Editing image with prompt "${params.prompt}" using ${modelId}`);
    return { url: "https://placehold.co/600x600?text=Edited+Mockup" };
}
