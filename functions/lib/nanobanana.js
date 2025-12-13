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
const dotenv = __importStar(require("dotenv"));
dotenv.config();
/**
 * GEMINI IMAGE MODEL CONFIGURATION
 * ================================
 * Restored to logic from commit 5057605 (Known Good Generation).
 */
const GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
if (!GENAI_API_KEY) {
    console.warn("GOOGLE_GENAI_API_KEY is not set");
}
console.log("NanoBanana Config:", { MODEL_ID, apiKey: GENAI_API_KEY ? "Set" : "Not Set" });
/**
 * Generate a mockup using the Gemini API.
 *
 * RESTORED LOGIC + ASPECT RATIO CONFIG:
 * - Tries official aspect ratio config first.
 * - FALLBACK: If API rejects config (400), retries with standard body (Known Good).
 */
async function generateCategoryMockup(category, artworkUrl, customPrompt, aspectRatio) {
    var _a;
    try {
        console.log(`[NANOBANANA] Starting generation for ${category} (RESTORED + AR Config)`);
        console.log(`[NANOBANANA] Artwork URL: ${artworkUrl}`);
        // 1. SECURITY: SSRF Protection (Enhanced)
        const validateArtworkUrl = (url) => {
            try {
                const parsed = new URL(url);
                if (parsed.protocol !== "https:")
                    throw new Error("Protocol must be https");
                const allowedHosts = [
                    "firebasestorage.googleapis.com",
                    "storage.googleapis.com",
                    "situ-477910.firebasestorage.app" // Hardcoded bucket for stability, or use logic if env avail
                ];
                // Allow env var overrides if present
                if (process.env.ALLOWED_IMAGE_HOSTS) {
                    allowedHosts.push(...process.env.ALLOWED_IMAGE_HOSTS.split(",").map(h => h.trim()));
                }
                if (!allowedHosts.includes(parsed.hostname.toLowerCase())) {
                    throw new Error(`Host not allowed: ${parsed.hostname}`);
                }
                // Path traversal check for shared hosts
                if (parsed.hostname === "firebasestorage.googleapis.com" || parsed.hostname === "storage.googleapis.com") {
                    // Must contain our bucket name (situ-477910)
                    if (!parsed.pathname.includes("situ-477910")) {
                        throw new Error("URL must point to Situ storage bucket");
                    }
                }
            }
            catch (e) {
                throw new Error(`Security validation failed: ${e.message}`);
            }
        };
        validateArtworkUrl(artworkUrl);
        // Product Prompts
        const PRODUCT_PROMPTS = {
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
        // Aspect Ratio Prompt Addition (Keep as fallback guidance in prompt even if config used)
        let ratioPrompt = "";
        if (aspectRatio) {
            switch (aspectRatio) {
                case "1:1":
                    ratioPrompt = "Square aspect ratio.";
                    break;
                case "16:9":
                    ratioPrompt = "Wide landscape 16:9 aspect ratio.";
                    break;
                case "9:16":
                    ratioPrompt = "Tall portrait 9:16 aspect ratio.";
                    break;
                case "4:3":
                    ratioPrompt = "Standard landscape 4:3 aspect ratio.";
                    break;
                case "3:4":
                    ratioPrompt = "Standard portrait 3:4 aspect ratio.";
                    break;
                default: ratioPrompt = "";
            }
        }
        // Generate prompt
        const basePrompt = PRODUCT_PROMPTS[category] || `Professional product photography of a ${category} featuring the provided artwork. Clean, modern, high quality, photorealistic, studio lighting.`;
        const prompt = `${basePrompt} ${ratioPrompt} ${customPrompt ? "IMPORTANT: " + customPrompt : ""} The output image MUST match the exact aspect ratio specified.`.trim();
        console.log(`[NANOBANANA] Full prompt: ${prompt}`);
        // Fetch the artwork image (Securely)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
        let imageResp;
        try {
            imageResp = await fetch(artworkUrl, { signal: controller.signal });
        }
        catch (err) {
            if (err.name === 'AbortError')
                throw new Error("Artwork download timed out");
            throw err;
        }
        finally {
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
        // Prepare Request Bodies
        const contents = [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: mimeType, data: imageBase64 } }
                ]
            }];
        const standardBody = { contents };
        const configBody = {
            contents,
            generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: {
                    aspectRatio: aspectRatio || "1:1"
                }
            }
        };
        // Helper to make the request with retry logic
        const makeRequestWithRetry = async (prefix, body, maxRetries = 3) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${prefix}/${MODEL_ID}:generateContent?key=${GENAI_API_KEY}`;
            let lastError;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[NANOBANANA] API attempt ${attempt}/${maxRetries} with prefix '${prefix}'`);
                    // PROOF LOGGING
                    if (attempt === 1) {
                        console.log(`[NANOBANANA] PROOF - Request Body Keys: ${Object.keys(body).join(", ")}`);
                        if (body.generationConfig)
                            console.log(`[NANOBANANA] PROOF - Using generationConfig: ${JSON.stringify(body.generationConfig)}`);
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
                }
                catch (err) {
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
        // Execution Strategy:
        // 1. Try 'models' with config (Official AR support)
        // 2. If 400, try 'models' without config (Fallback to baseline)
        // 3. If 404, repeat logic for 'tunedModels' (unlikely but preserved)
        let response;
        let usedConfig = true;
        // Try standard model with config
        response = await makeRequestWithRetry("models", configBody);
        if (response.status === 400) {
            console.warn(`[NANOBANANA] API rejected config (400). Fallback to standard request.`);
            response = await makeRequestWithRetry("models", standardBody);
            usedConfig = false;
        }
        else if (response.status === 404) {
            console.log(`[NANOBANANA] 'models/' endpoint returned 404. Retrying with 'tunedModels/'...`);
            // Try tuned with config
            response = await makeRequestWithRetry("tunedModels", configBody);
            if (response.status === 400) {
                console.warn(`[NANOBANANA] Tuned Model rejected config. Fallback.`);
                response = await makeRequestWithRetry("tunedModels", standardBody);
                usedConfig = false;
            }
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[NANOBANANA] API Error: ${response.status} ${errorText}`);
            throw new Error(`Gemini API Error: ${response.status} ${errorText}`);
        }
        const data = await response.json();
        console.log(`[NANOBANANA] API Response received (Config used: ${usedConfig})`);
        // PROOF LOGGING: Response Parsing
        if (data.candidates && data.candidates.length > 0) {
            const candidate = data.candidates[0];
            const parts = ((_a = candidate.content) === null || _a === void 0 ? void 0 : _a.parts) || [];
            console.log(`[NANOBANANA] PROOF - Candidate Finish Reason: ${candidate.finishReason}`);
            const imagePart = parts.find((p) => p.inline_data || p.inlineData);
            if (imagePart) {
                const inlineData = imagePart.inline_data || imagePart.inlineData;
                const base64Image = inlineData.data;
                const rMimeType = inlineData.mime_type || inlineData.mimeType || "image/png";
                console.log(`[NANOBANANA] PROOF - Image Bytes Found: ${base64Image.length}`);
                return `data:${rMimeType};base64,${base64Image}`;
            }
            else {
                console.log(`[NANOBANANA] PROOF - NO IMAGE DATA found in parts.`);
                const textPart = parts.find((p) => p.text);
                if (textPart)
                    console.log(`[NANOBANANA] Text: "${textPart.text.substring(0, 200)}..."`);
            }
        }
        else {
            console.log(`[NANOBANANA] PROOF - No candidates found.`);
        }
        return null;
    }
    catch (error) {
        console.error("[NANOBANANA] Error in generateCategoryMockup:", error);
        throw error;
    }
}
//# sourceMappingURL=nanobanana.js.map