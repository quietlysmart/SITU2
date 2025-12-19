import * as dotenv from "dotenv";

dotenv.config();

/**
 * GEMINI IMAGE MODEL CONFIGURATION
 * ================================
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

    const buffer = await sharp({
        create: {
            width,
            height,
            channels: 3,
            background: { r: 128, g: 128, b: 128 }
        }
    })
        .png()
        .toBuffer();

    return { data: buffer.toString("base64"), width, height };
}

/**
 * Generate a mockup using the Gemini API.
 * 
 * TWO-IMAGE SIGNIFIER STRATEGY:
 * 1. Sends the user's artwork.
 * 2. Sends a blank seed image with the target aspect ratio.
 * 3. Instructs the model to match the seed's aspect ratio.
 */
export async function generateCategoryMockup(category: string, artworkUrl: string, customPrompt?: string, aspectRatio?: string): Promise<string | null> {
    try {
        console.log(`[NANOBANANA] Starting generation for ${category} (Seeded Aspect Ratio)`);
        console.log(`[NANOBANANA] Requested aspect ratio: ${aspectRatio || "1:1"}`);
        console.log(`[NANOBANANA] Artwork URL: ${artworkUrl}`);

        // 1. SECURITY: SSRF Protection
        const validateArtworkUrl = (url: string) => {
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== "https:") throw new Error("Protocol must be https");

                const projectID = resolveProjectId() || "situ-477910";
                const allowedHosts = [
                    "firebasestorage.googleapis.com",
                    "storage.googleapis.com",
                    `${projectID}.firebasestorage.app`,
                    `${projectID}.appspot.com`
                ];

                if (process.env.ALLOWED_IMAGE_HOSTS) {
                    allowedHosts.push(...process.env.ALLOWED_IMAGE_HOSTS.split(",").map(h => h.trim().toLowerCase()));
                }

                if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
                    throw new Error(`Host not allowed: ${parsed.hostname}`);
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

        const basePrompt = PRODUCT_PROMPTS[category] || `Professional product photography of a ${category} featuring the provided artwork.`;

        let prompt: string;
        if (aspectRatio) {
            prompt = `${basePrompt} ${ratioPrompt} ${customPrompt ? "USER REQUEST: " + customPrompt : ""} MANDATORY: Your output image MUST match the exact aspect ratio of the SECOND image provided (the blank seed). Do not match the aspect ratio of the first image (the artwork). Output ONLY the generated image.`.trim();
        } else {
            prompt = `${basePrompt} ${customPrompt ? "USER REQUEST: " + customPrompt : ""} MANDATORY: Output ONLY the generated image. Do not provide descriptions.`.trim();
        }
        console.log(`[NANOBANANA] Prompt: ${prompt}`);

        // Fetch the artwork image
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const imageResp = await fetch(artworkUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!imageResp.ok) throw new Error(`Failed to fetch artwork: ${imageResp.status}`);

        const imageBuffer = await imageResp.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResp.headers.get("content-type") || "image/jpeg";

        const parts: any[] = [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: imageBase64 } }
        ];

        if (aspectRatio) {
            const seed = await generateBlankPNG(aspectRatio);
            console.log(`[NANOBANANA] Seeding with ${aspectRatio} blank PNG (${seed.width}x${seed.height})`);
            parts.push({ inline_data: { mime_type: "image/png", data: seed.data } });
        }

        const body = { contents: [{ parts }] };

        const effectiveModelId = aspectRatio ? "gemini-2.5-flash-image" : MODEL_ID;

        // Helper to make the request
        const makeRequest = async (prefix: string, bodyJson: any, modelToUse: string): Promise<Response> => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${prefix}/${modelToUse}:generateContent?key=${GENAI_API_KEY}`;

            console.log(`[NANOBANANA] Requesting ${prefix}/${modelToUse}:generateContent`);

            const resp = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(bodyJson)
            });

            if (!resp.ok) {
                const errorBody = await resp.text();
                if (resp.status === 404) {
                    console.warn(`[NANOBANANA] API 404 from ${prefix}/${modelToUse}:`, errorBody);
                    return resp;
                }
                console.error(`[NANOBANANA] API ERROR ${resp.status}:`, errorBody);
                throw new Error(`Gemini API Error ${resp.status}: ${errorBody}`);
            }
            return resp;
        };

        let lastEndpoint = `models/${effectiveModelId}:generateContent`;
        let response = await makeRequest("models", body, effectiveModelId);
        if (response.status === 404) {
            console.log(`[NANOBANANA] 'models/' endpoint returned 404. Retrying with 'tunedModels/'...`);
            lastEndpoint = `tunedModels/${effectiveModelId}:generateContent`;
            response = await makeRequest("tunedModels", body, effectiveModelId);
        }
        if (!response.ok) {
            throw new Error(`Gemini API Error ${response.status}: Request failed on ${lastEndpoint}`);
        }

        const data = await response.json();

        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            const imagePart = (candidate.content?.parts || []).find((p: any) => p.inline_data || p.inlineData);

            if (imagePart) {
                const inlineData = imagePart.inline_data || imagePart.inlineData;
                const base64Image = inlineData.data;
                const rMimeType = inlineData.mime_type || inlineData.mimeType || "image/png";

                // RATIO ASSERTION
                const buf = Buffer.from(base64Image, "base64");
                const metadata = await sharp(buf).metadata();
                if (metadata.width && metadata.height) {
                    const detectedRatio = metadata.width / metadata.height;
                    console.log(`[NANOBANANA] Output dimensions: ${metadata.width}x${metadata.height} (Ratio: ${detectedRatio.toFixed(2)})`);

                    if (aspectRatio && aspectRatio !== "1:1") {
                        const ratioMap: Record<string, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4 };
                        const targetRatio = ratioMap[aspectRatio];
                        if (targetRatio && Math.abs(detectedRatio - targetRatio) > 0.15) {
                            throw new Error(`RATIO_MISMATCH: Expected ~${targetRatio.toFixed(2)} (${aspectRatio}) but got ${detectedRatio.toFixed(2)} (${metadata.width}x${metadata.height})`);
                        }
                    }
                }

                return `data:${rMimeType};base64,${base64Image}`;
            }
        }

        throw new Error(`AI refused to generate image or returned invalid data. Reason: ${data.candidates?.[0]?.finishReason || "No candidates"}`);

    } catch (error: any) {
        console.error("[NANOBANANA] Error:", error.message);
        throw error;
    }
}
