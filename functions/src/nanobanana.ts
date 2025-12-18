import * as dotenv from "dotenv";

dotenv.config();

/**
 * GEMINI IMAGE MODEL CONFIGURATION
 * ================================
 * Restored to logic from commit 5057605 (Known Good Generation).
 */
import { resolveProjectId } from "./admin";
import sharp from "sharp";

const GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

if (!GENAI_API_KEY) {
    console.warn("GOOGLE_GENAI_API_KEY is not set");
}

console.log("NanoBanana Config:", { MODEL_ID, apiKey: GENAI_API_KEY ? "Set" : "Not Set" });

/**
 * Generate a minimal blank PNG at a specific aspect ratio using sharp.
 */
async function generateBlankPNG(aspectRatio: string): Promise<{ data: string; width: number; height: number }> {
    const dimensions: Record<string, { width: number; height: number }> = {
        "1:1": { width: 512, height: 512 },
        "16:9": { width: 896, height: 512 },
        "9:16": { width: 512, height: 896 },
        "4:3": { width: 640, height: 480 },
        "3:4": { width: 480, height: 640 },
    };

    const { width, height } = dimensions[aspectRatio] || dimensions["1:1"];

    // Use sharp to create a neutral gray 1x1 image and resize it to the target dimensions
    // This ensures a valid, high-quality placeholder for the AI to follow.
    const buffer = await sharp({
        create: {
            width: width,
            height: height,
            channels: 3,
            background: { r: 128, g: 128, b: 128 }
        }
    })
        .png()
        .toBuffer();

    return { data: buffer.toString('base64'), width, height };
}

// Helpers removed in favor of sharp

/**
 * Generate a mockup using the Gemini API.
 * 
 * TWO-IMAGE STRATEGY:
 * 1. Sends the user's artwork.
 * 2. Sends a "Blank PNG" seeding image that matched the target aspect ratio.
 * 3. Instructs the AI to output at the ratio of the seed image.
 */
export async function generateCategoryMockup(category: string, artworkUrl: string, customPrompt?: string, aspectRatio?: string): Promise<string | null> {
    try {
        console.log(`[NANOBANANA] Starting generation for ${category} (RESTORED + AR Config)`);
        console.log(`[NANOBANANA] Artwork URL: ${artworkUrl}`);

        // 1. SECURITY: SSRF Protection (Enhanced)
        const validateArtworkUrl = (url: string) => {
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== "https:") throw new Error("Protocol must be https");

                const projectID = resolveProjectId() || "situ-477910";
                const allowedHosts = [
                    "firebasestorage.googleapis.com",
                    "storage.googleapis.com",
                    `${projectID}.firebasestorage.app`,
                    `${projectID}.appspot.com`,
                    "firebasestorage.googleapis.com",
                    "storage.googleapis.com"
                ];

                // Allow env var overrides if present
                if (process.env.ALLOWED_IMAGE_HOSTS) {
                    allowedHosts.push(...process.env.ALLOWED_IMAGE_HOSTS.split(",").map(h => h.trim().toLowerCase()));
                }

                if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
                    throw new Error(`Host not allowed: ${parsed.hostname}`);
                }

                // Path traversal check for shared hosts
                if (parsed.hostname === "firebasestorage.googleapis.com" || parsed.hostname === "storage.googleapis.com") {
                    // Must contain our project ID
                    if (!parsed.pathname.includes(projectID)) {
                        throw new Error(`URL must point to ${projectID} storage bucket`);
                    }
                }
            } catch (e: any) {
                console.error(`[NANOBANANA] SSRF Validation failed for ${url}:`, e.message);
                throw new Error(`Security validation failed: ${e.message}`);
            }
        };
        validateArtworkUrl(artworkUrl);

        // Product Prompts
        const PRODUCT_PROMPTS: Record<string, string> = {
            "wall": "Ultra-realistic interior design photo of framed wall art in a stylish, modern room. Dramatic natural lighting casting soft shadows. The provided artwork is the focal point, framed elegantly on the wall. High-end furniture and decor in the background, cinematic composition.",
            "prints": "High-end lifestyle photography of art prints arranged on a desk or table. Overhead or slight three-quarter view. Multiple prints clearly on paper, maybe a few overlapping, plus a few small props (pens, clips, etc.). Still ultra-realistic, nice shallow depth of field. Soft, warm lighting. The provided artwork is the main focus.",
            "wearable": "GENERATE AN IMAGE OF A REAL PERSON wearing the provided artwork as apparel (t-shirt, hoodie, or hat). High-end fashion photography style, ultra-realistic, natural lifestyle setting, dramatic lighting. The artwork MUST be clearly visible on the fabric.",
            "phone": "Ultra-realistic lifestyle shot of a smartphone with a custom case featuring the provided artwork. Held by a hand or resting on a textured surface (wood, marble). Shallow depth of field, focusing on the case design. Modern and sleek.",
            "mug": "Cozy lifestyle photography of a ceramic mug featuring the provided artwork. Placed on a wooden table with coffee beans, a book, or a laptop nearby. Warm, inviting lighting with steam rising. Realistic ceramic texture and reflections.",
            "tote": "Street-style photography of a person carrying a canvas tote bag with the provided artwork. Natural outdoor lighting or trendy indoor setting. The bag is the focus, showing realistic fabric texture and weight. Casual and stylish.",
            "pillow": "Interior design shot of a decorative throw pillow on a plush sofa. The provided artwork is printed on the fabric. Cozy, inviting atmosphere with soft lighting and complementary decor. High-quality textile rendering.",
            "notebook": "Creative workspace photography of a notebook with the provided artwork on the cover. Surrounded by artist tools, pens, or a laptop. Top-down or angled view with good lighting to show the cover texture. Inspiring and organized.",
            "patch": "Close-up product photo of an embroidered patch with the provided artwork stitched into fabric. The patch is lying on or pinned to denim or canvas. Soft, directional lighting that shows stitch texture and thread sheen. Modern, clean, realistic product photography."
        };

        // Aspect Ratio Prompt Addition (Keep as fallback guidance in prompt even if config used)
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

        let prompt;
        if (aspectRatio) {
            prompt = `${basePrompt} ${ratioPrompt} ${customPrompt ? "USER REQUEST: " + customPrompt : ""} MANDATORY: Your output image MUST match the exact aspect ratio of the SECOND image provided in this prompt (the blank seed). Do not simply match the aspect ratio of the first image (the artwork). Output ONLY the generated image.`.trim();
        } else {
            prompt = `${basePrompt} ${customPrompt ? "USER REQUEST: " + customPrompt : ""} MANDATORY: Output ONLY the generated image. Do not provide descriptions or conversational text.`.trim();
        }
        console.log(`[NANOBANANA] Full prompt: ${prompt}`);

        // Fetch the artwork image (Securely)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

        let imageResp;
        try {
            imageResp = await fetch(artworkUrl, { signal: controller.signal });
        } catch (err: any) {
            if (err.name === 'AbortError') throw new Error("Artwork download timed out");
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }

        if (!imageResp.ok) {
            throw new Error(`Failed to fetch artwork: ${imageResp.status} ${imageResp.statusText}`);
        }

        const contentLength = imageResp.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
            throw new Error("Artwork too large (max 10MB)");
        }

        const imageBuffer = await imageResp.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

        console.log(`[NANOBANANA] Calling Gemini REST API with model: ${MODEL_ID}`);

        // Part 1: Always include the artwork
        const artworkPart = { inline_data: { mime_type: mimeType, data: imageBase64 } };

        // Prepare the "Standard" (Known Good) body - ALWAYS one image, one prompt
        const standardContents = [{
            parts: [
                { text: `${basePrompt} ${customPrompt ? "USER REQUEST: " + customPrompt : ""} MANDATORY: Output ONLY the generated image.`.trim() },
                artworkPart
            ]
        }];
        const standardBody = { contents: standardContents };

        // Prepare the "Ratio" body - uses the seed PNG hack
        let ratioBody: any = standardBody;
        if (aspectRatio) {
            const seed = await generateBlankPNG(aspectRatio);
            console.log(`[NANOBANANA] Seeding with ${aspectRatio} blank PNG (${seed.width}x${seed.height})`);

            ratioBody = {
                contents: [{
                    parts: [
                        { text: prompt }, // The enhanced prompt targeting the seed
                        artworkPart,
                        { inline_data: { mime_type: "image/png", data: seed.data } } // The seed
                    ]
                }],
                generationConfig: { aspectRatio } // Formal parameter as secondary reinforcement
            };
        }

        // Force Gemini 2.5 for specific aspect ratios
        const effectiveModelId = aspectRatio ? "gemini-2.5-flash-image" : MODEL_ID;

        // Helper to make the request with retry logic
        const makeRequestWithRetry = async (prefix: string, body: any, modelToUse: string, maxRetries = 3): Promise<Response> => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${prefix}/${modelToUse}:generateContent?key=${GENAI_API_KEY}`;

            let lastError: any;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[NANOBANANA] API attempt ${attempt}/${maxRetries} with prefix '${prefix}'`);

                    // PROOF LOGGING
                    if (attempt === 1) {
                        console.log(`[NANOBANANA] PROOF - Request Body Keys: ${Object.keys(body).join(", ")}`);
                        if (body.generationConfig) console.log(`[NANOBANANA] PROOF - Using generationConfig: ${JSON.stringify(body.generationConfig)}`);
                    }

                    const response = await fetch(apiUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body)
                    });

                    // Return immediately for success or client errors (4xx) - Caller handles fallback
                    if (response.ok || (response.status >= 400 && response.status < 500)) {
                        return response;
                    }

                    // For server errors (5xx), retry with exponential backoff
                    console.log(`[NANOBANANA] Server error ${response.status}, will retry...`);
                    lastError = new Error(`Server error: ${response.status}`);

                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } catch (err) {
                    console.log(`[NANOBANANA] Network error on attempt ${attempt}:`, err);
                    lastError = err;

                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000;
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }
            }

            throw lastError || new Error("Max retries exceeded");
        };

        // Execution Strategy: Try with aspect ratio config (if requested) using Gemini 2.5
        let response = await makeRequestWithRetry("models", ratioBody, effectiveModelId);

        // Fallback: If 400 (Bad Config) or 404, retry with standard prompt-only logic
        if (response.status === 400 && aspectRatio) {
            console.warn(`[NANOBANANA] AR config rejected (400). Retrying with prompt-only fallback...`);
            response = await makeRequestWithRetry("models", standardBody, MODEL_ID);
        }

        if (response.status === 404) {
            console.log(`[NANOBANANA] 'models/' endpoint returned 404. Retrying with 'tunedModels/'...`);
            response = await makeRequestWithRetry("tunedModels", aspectRatio ? ratioBody : standardBody, effectiveModelId);

            if (response.status === 400 && aspectRatio) {
                console.warn(`[NANOBANANA] AR config rejected (400) on tunedModels. Retrying with prompt-only fallback...`);
                response = await makeRequestWithRetry("tunedModels", standardBody, MODEL_ID);
            }
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[NANOBANANA] API Error Status: ${response.status}`);
            console.error(`[NANOBANANA] API Error Body: ${errorText.substring(0, 500)}`);
            throw new Error(`Gemini API Error: ${response.status} ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        console.log(`[NANOBANANA] API Response received`);

        // PROOF LOGGING: Response Parsing
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            const parts = candidate.content?.parts || [];

            console.log(`[NANOBANANA] PROOF - Candidate Finish Reason: ${candidate.finishReason}`);

            const imagePart = parts.find((p: any) => p.inline_data || p.inlineData);

            if (imagePart) {
                const inlineData = imagePart.inline_data || imagePart.inlineData;
                const base64Image = inlineData.data;
                const rMimeType = inlineData.mime_type || inlineData.mimeType || "image/png";

                console.log(`[NANOBANANA] PROOF - Image Bytes Found: ${base64Image.length}`);

                // PIXEL LEVEL VERIFICATION
                try {
                    const buf = Buffer.from(base64Image, 'base64');
                    const metadata = await sharp(buf).metadata();
                    console.log(`[NANOBANANA] PIXEL PROOF - Dimensions: ${metadata.width}x${metadata.height} (Aspect Ratio: ${(metadata.width! / metadata.height!).toFixed(2)})`);
                } catch (err) {
                    console.warn(`[NANOBANANA] Could not verify pixel dimensions:`, err);
                }

                return `data:${rMimeType};base64,${base64Image}`;
            } else {
                console.log(`[NANOBANANA] PROOF - NO IMAGE DATA found in parts.`);
                const textPart = parts.find((p: any) => p.text);
                const textSnippet = textPart ? textPart.text.substring(0, 100) : "none";
                throw new Error(`AI returned text but no image. Snippet: ${textSnippet}`);
            }
        } else {
            const finishReason = data.candidates?.[0]?.finishReason;
            console.log(`[NANOBANANA] PROOF - No candidates found. Reason: ${finishReason}`);
            throw new Error(`AI refused to generate image. Reason: ${finishReason || "unknown"}`);
        }

    } catch (error: any) {
        console.error("[NANOBANANA] Error in generateCategoryMockup:", error);
        throw error;
    }
}
