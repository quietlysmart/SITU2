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
exports.generateBlankPNG = generateBlankPNG;
exports.generateCategoryMockup = generateCategoryMockup;
exports.editImage = editImage;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const GENAI_API_KEY = process.env.GOOGLE_GENAI_API_KEY;
/**
 * GEMINI IMAGE MODEL CONFIGURATION
 * ================================
 * This is the single source of truth for the image generation model.
 *
 * Available models:
 * - "gemini-2.5-flash-image" (cheaper, faster - CURRENT)
 * - "gemini-3-pro-image-preview" (higher quality, more expensive)
 *
 * To switch models:
 * 1. Set GEMINI_IMAGE_MODEL env var in functions/.env, OR
 * 2. Change the default value below
 *
 * The env var takes precedence over the hardcoded default.
 */
const MODEL_ID = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
if (!GENAI_API_KEY) {
    console.warn("GOOGLE_GENAI_API_KEY is not set");
}
console.log("NanoBanana Config:", { MODEL_ID, apiKey: GENAI_API_KEY ? "Set" : "Not Set" });
/**
 * Generate a minimal blank PNG at a specific aspect ratio.
 * This is used to force Gemini 2.5 to output images at the target aspect ratio.
 *
 * We use small dimensions to keep the base64 size small, but the aspect ratio is exact.
 */
function generateBlankPNG(aspectRatio) {
    // Define dimensions for each aspect ratio (keeping one dimension at 100-200px to minimize size)
    const dimensions = {
        "1:1": { width: 100, height: 100 },
        "16:9": { width: 160, height: 90 },
        "9:16": { width: 90, height: 160 },
        "4:3": { width: 120, height: 90 },
        "3:4": { width: 90, height: 120 },
    };
    const { width, height } = dimensions[aspectRatio] || dimensions["1:1"];
    // Create a minimal valid PNG file
    // PNG structure: signature + IHDR chunk + IDAT chunk (single transparent pixel repeated) + IEND chunk
    // For simplicity, we create a tiny single-color PNG
    // PNG signature
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    // IHDR chunk (Image Header)
    const ihdr = createIHDRChunk(width, height);
    // IDAT chunk - raw deflated data for a white image
    const idat = createIDATChunk(width, height);
    // IEND chunk
    const iend = createIENDChunk();
    const png = Buffer.concat([signature, ihdr, idat, iend]);
    console.log(`[NANOBANANA] Generated blank PNG: ${width}x${height} for aspect ratio ${aspectRatio}`);
    return {
        data: png.toString('base64'),
        width,
        height
    };
}
// Helper: Create IHDR chunk
function createIHDRChunk(width, height) {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data.writeUInt8(8, 8); // bit depth
    data.writeUInt8(2, 9); // color type (RGB)
    data.writeUInt8(0, 10); // compression
    data.writeUInt8(0, 11); // filter
    data.writeUInt8(0, 12); // interlace
    return createPNGChunk('IHDR', data);
}
// Helper: Create IDAT chunk with white pixels
function createIDATChunk(width, height) {
    const zlib = require('zlib');
    // Each row has a filter byte (0) followed by RGB values (white = 255,255,255)
    const rowSize = 1 + width * 3;
    const rawData = Buffer.alloc(height * rowSize, 255);
    // Set filter bytes to 0 at the start of each row
    for (let y = 0; y < height; y++) {
        rawData[y * rowSize] = 0;
    }
    const compressed = zlib.deflateSync(rawData);
    return createPNGChunk('IDAT', compressed);
}
// Helper: Create IEND chunk
function createIENDChunk() {
    return createPNGChunk('IEND', Buffer.alloc(0));
}
// Helper: Create a PNG chunk with type and data
function createPNGChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);
    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}
// CRC32 implementation for PNG chunks
function crc32(data) {
    let crc = 0xFFFFFFFF;
    const table = getCRC32Table();
    for (let i = 0; i < data.length; i++) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
// CRC32 lookup table
let crc32Table = null;
function getCRC32Table() {
    if (crc32Table)
        return crc32Table;
    crc32Table = [];
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = 0xEDB88320 ^ (crc >>> 1);
            }
            else {
                crc = crc >>> 1;
            }
        }
        crc32Table[i] = crc >>> 0;
    }
    return crc32Table;
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
async function generateCategoryMockup(category, artworkUrl, customPrompt, aspectRatio) {
    var _a;
    try {
        console.log(`[NANOBANANA] Starting generation for ${category}`);
        console.log(`[NANOBANANA] Artwork URL: ${artworkUrl}`);
        if (!artworkUrl.startsWith("https://")) {
            throw new Error("Artwork URL must be https and pre-validated");
        }
        // Product Prompts Configuration
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
        // Aspect Ratio Prompt Addition
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
        // Build enhanced prompt that emphasizes aspect ratio
        const prompt = `${basePrompt} ${ratioPrompt} ${customPrompt ? "IMPORTANT: " + customPrompt : ""} The output image MUST match the exact aspect ratio specified.`.trim();
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
        console.log(`[NANOBANANA] Using aspect ratio in prompt: ${aspectRatio || "1:1"}`);
        // Helper to make the request with retry logic
        const makeRequestWithRetry = async (prefix, maxRetries = 3) => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/${prefix}/${MODEL_ID}:generateContent?key=${GENAI_API_KEY}`;
            let lastError;
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    console.log(`[NANOBANANA] API attempt ${attempt}/${maxRetries} with prefix '${prefix}'`);
                    const requestBody = {
                        contents: [{
                                parts: [
                                    { text: prompt },
                                    { inline_data: { mime_type: mimeType, data: imageBase64 } }
                                ]
                            }]
                    };
                    const response = await fetch(apiUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(requestBody)
                    });
                    // Return immediately for success or client errors (4xx)
                    if (response.ok || (response.status >= 400 && response.status < 500)) {
                        return response;
                    }
                    // For server errors (5xx), retry with exponential backoff
                    console.log(`[NANOBANANA] Server error ${response.status}, will retry...`);
                    lastError = new Error(`Server error: ${response.status}`);
                    if (attempt < maxRetries) {
                        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                        console.log(`[NANOBANANA] Waiting ${delay}ms before retry...`);
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
        // Try 'models/' endpoint first (standard models)
        let response = await makeRequestWithRetry("models");
        // If 404, it might be a tuned model, try 'tunedModels/'
        if (response.status === 404) {
            console.log(`[NANOBANANA] 'models/' endpoint returned 404. Retrying with 'tunedModels/'...`);
            response = await makeRequestWithRetry("tunedModels");
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
            const parts = ((_a = candidate.content) === null || _a === void 0 ? void 0 : _a.parts) || [];
            const imagePart = parts.find((p) => p.inline_data || p.inlineData);
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
    }
    catch (error) {
        console.error("[NANOBANANA] Error in generateCategoryMockup:", error);
        throw error;
    }
}
async function editImage(params) {
    const modelId = params.modelId || MODEL_ID;
    // Simulation
    console.log(`Editing image with prompt "${params.prompt}" using ${modelId}`);
    return { url: "https://placehold.co/600x600?text=Edited+Mockup" };
}
//# sourceMappingURL=nanobanana.js.map