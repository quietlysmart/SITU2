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
const FALLBACK_MODEL_ID = process.env.NANOBANANA_FREE_MODEL_ID || MODEL_ID;
const AR_MODEL_ID = process.env.NANOBANANA_PRO_MODEL_ID || FALLBACK_MODEL_ID;

if (!GENAI_API_KEY) {
    console.warn("GOOGLE_GENAI_API_KEY is not set");
}

console.log("NanoBanana Config:", { MODEL_ID, apiKey: GENAI_API_KEY ? "Set" : "Not Set" });

/**
 * Generate a minimal blank PNG at a specific aspect ratio using sharp.
 */
/**
 * Generate a minimal blank PNG at a specific aspect ratio.
 * This is used to force Gemini 2.5 to output images at the target aspect ratio.
 * 
 * We use small dimensions to keep the base64 size small, but the aspect ratio is exact.
 */
function generateBlankPNG(aspectRatio: string): { data: string; width: number; height: number } {
    // Define dimensions for each aspect ratio (keeping one dimension at 100-200px to minimize size)
    const dimensions: Record<string, { width: number; height: number }> = {
        "1:1": { width: 512, height: 512 },
        "16:9": { width: 512, height: 288 },
        "9:16": { width: 288, height: 512 },
        "4:3": { width: 512, height: 384 },
        "3:4": { width: 384, height: 512 },
    };

    const { width, height } = dimensions[aspectRatio] || dimensions["1:1"];

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
function createIHDRChunk(width: number, height: number): Buffer {
    const data = Buffer.alloc(13);
    data.writeUInt32BE(width, 0);
    data.writeUInt32BE(height, 4);
    data.writeUInt8(8, 8);   // bit depth
    data.writeUInt8(2, 9);   // color type (RGB)
    data.writeUInt8(0, 10);  // compression
    data.writeUInt8(0, 11);  // filter
    data.writeUInt8(0, 12);  // interlace

    return createPNGChunk('IHDR', data);
}

// Helper: Create IDAT chunk with white pixels
function createIDATChunk(width: number, height: number): Buffer {
    const zlib = require('zlib');

    // Each row has a filter byte (0) followed by RGB values.
    const rowSize = 1 + width * 3;
    const rawData = Buffer.alloc(height * rowSize);
    const fill = 220;
    const border = 120;

    for (let y = 0; y < height; y++) {
        const rowStart = y * rowSize;
        rawData[rowStart] = 0; // filter byte
        for (let x = 0; x < width; x++) {
            const pixelStart = rowStart + 1 + x * 3;
            const isBorder = y === 0 || y === height - 1 || x === 0 || x === width - 1;
            const value = isBorder ? border : fill;
            rawData[pixelStart] = value;
            rawData[pixelStart + 1] = value;
            rawData[pixelStart + 2] = value;
        }
    }

    const compressed = zlib.deflateSync(rawData);
    return createPNGChunk('IDAT', compressed);
}

// Helper: Create IEND chunk
function createIENDChunk(): Buffer {
    return createPNGChunk('IEND', Buffer.alloc(0));
}

// Helper: Create a PNG chunk with type and data
function createPNGChunk(type: string, data: Buffer): Buffer {
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
function crc32(data: Buffer): number {
    let crc = 0xFFFFFFFF;
    const table = getCRC32Table();

    for (let i = 0; i < data.length; i++) {
        crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// CRC32 lookup table
let crc32Table: number[] | null = null;
function getCRC32Table(): number[] {
    if (crc32Table) return crc32Table;

    crc32Table = [];
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = 0xEDB88320 ^ (crc >>> 1);
            } else {
                crc = crc >>> 1;
            }
        }
        crc32Table[i] = crc >>> 0;
    }
    return crc32Table;
}

type ImageResult = {
    dataUrl: string;
    base64: string;
    mimeType: string;
    width: number;
    height: number;
};

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

        const ratioPromptMap: Record<string, string> = {
            "1:1": "Square aspect ratio.",
            "16:9": "Wide landscape 16:9 aspect ratio.",
            "9:16": "Tall portrait 9:16 aspect ratio.",
            "4:3": "Standard landscape 4:3 aspect ratio.",
            "3:4": "Standard portrait 3:4 aspect ratio.",
        };

        const normalizedAspectRatio = aspectRatio && aspectRatio !== "1:1" ? aspectRatio : null;
        const ratioPrompt = normalizedAspectRatio ? (ratioPromptMap[normalizedAspectRatio] || "") : "";
        const basePrompt = PRODUCT_PROMPTS[category] || `Professional product photography of a ${category} featuring the provided artwork.`;
        const userPrompt = customPrompt ? `USER REQUEST: ${customPrompt}` : "";

        const promptStandard = `${basePrompt} ${userPrompt} MANDATORY: Output ONLY the generated image. Do not provide descriptions.`.trim();
        const promptSeedSecond = normalizedAspectRatio
            ? `${basePrompt} ${ratioPrompt} ${userPrompt} MANDATORY: Your output image MUST match the exact aspect ratio of the SECOND image provided (the blank guide). Do not match the aspect ratio of the first image (the artwork). Output ONLY the generated image.`.trim()
            : promptStandard;
        const promptSeedFirst = normalizedAspectRatio
            ? `${basePrompt} ${ratioPrompt} ${userPrompt} MANDATORY: Your output image MUST match the exact aspect ratio of the FIRST image provided (the blank guide). The SECOND image is the artwork to use. Output ONLY the generated image.`.trim()
            : promptStandard;
        const reframePrompt = normalizedAspectRatio
            ? "MANDATORY: Expand the FIRST image to match the exact aspect ratio of the SECOND image (blank guide). Keep the original image centered and intact. Extend the background naturally to fill the extra space. Output ONLY the generated image."
            : "";

        console.log(`[NANOBANANA] Prompt (seed second): ${promptSeedSecond}`);
        if (normalizedAspectRatio) {
            console.log(`[NANOBANANA] Prompt (seed first): ${promptSeedFirst}`);
        }

        // Fetch the artwork image
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const imageResp = await fetch(artworkUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!imageResp.ok) throw new Error(`Failed to fetch artwork: ${imageResp.status}`);

        const imageBuffer = await imageResp.arrayBuffer();
        const imageBase64 = Buffer.from(imageBuffer).toString('base64');
        const mimeType = imageResp.headers.get("content-type") || "image/jpeg";
        const artworkPart = { inline_data: { mime_type: mimeType, data: imageBase64 } };

        const ratioMap: Record<string, number> = { "16:9": 16 / 9, "9:16": 9 / 16, "4:3": 4 / 3, "3:4": 3 / 4 };
        const targetRatio = normalizedAspectRatio ? ratioMap[normalizedAspectRatio] : null;
        const useAspectRatio = !!targetRatio;
        const seed = useAspectRatio && normalizedAspectRatio ? generateBlankPNG(normalizedAspectRatio) : null;
        const seedPart = seed ? { inline_data: { mime_type: "image/png", data: seed.data } } : null;

        if (seed && normalizedAspectRatio) {
            console.log(`[NANOBANANA] Seeding with ${normalizedAspectRatio} blank PNG (${seed.width}x${seed.height})`);
        }
        if (useAspectRatio && !seedPart) {
            throw new Error("Aspect ratio seed generation failed");
        }

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

        const requestImage = async (promptText: string, imageParts: any[], modelToUse: string, label: string): Promise<ImageResult> => {
            const parts = [{ text: promptText }, ...imageParts];
            const body = { contents: [{ parts }] };
            let lastEndpoint = `models/${modelToUse}:generateContent`;
            let response = await makeRequest("models", body, modelToUse);
            if (response.status === 404) {
                console.log(`[NANOBANANA] 'models/' endpoint returned 404. Retrying with 'tunedModels/' (${label})...`);
                lastEndpoint = `tunedModels/${modelToUse}:generateContent`;
                response = await makeRequest("tunedModels", body, modelToUse);
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

                    const buf = Buffer.from(base64Image, "base64");
                    const metadata = await sharp(buf).metadata();
                    if (!metadata.width || !metadata.height) {
                        throw new Error("Failed to read output image dimensions");
                    }

                    console.log(`[NANOBANANA] Output dimensions: ${metadata.width}x${metadata.height} (Ratio: ${(metadata.width / metadata.height).toFixed(2)})`);

                    return {
                        dataUrl: `data:${rMimeType};base64,${base64Image}`,
                        base64: base64Image,
                        mimeType: rMimeType,
                        width: metadata.width,
                        height: metadata.height,
                    };
                }
            }

            throw new Error(`AI refused to generate image or returned invalid data. Reason: ${data.candidates?.[0]?.finishReason || "No candidates"}`);
        };

        const ratioTolerance = 0.15;
        const isRatioMatch = (width: number, height: number): boolean => {
            if (!targetRatio) return true;
            const detectedRatio = width / height;
            return Math.abs(detectedRatio - targetRatio) <= ratioTolerance;
        };
        const ratioMismatchMessage = (width: number, height: number): string => {
            if (!targetRatio || !normalizedAspectRatio) {
                return "RATIO_MISMATCH";
            }
            const detectedRatio = width / height;
            return `RATIO_MISMATCH: Expected ~${targetRatio.toFixed(2)} (${normalizedAspectRatio}) but got ${detectedRatio.toFixed(2)} (${width}x${height})`;
        };

        if (!useAspectRatio) {
            const result = await requestImage(promptStandard, [artworkPart], MODEL_ID, `standard:${MODEL_ID}`);
            return result.dataUrl;
        }

        const modelCandidates = Array.from(new Set([AR_MODEL_ID, FALLBACK_MODEL_ID]));
        const seedInlinePart = seedPart;
        let lastResult: ImageResult | null = null;
        let lastError: Error | null = null;

        for (const modelToUse of modelCandidates) {
            const attempts = [
                { name: "seed_second", prompt: promptSeedSecond, parts: [artworkPart, seedInlinePart] },
                { name: "seed_first", prompt: promptSeedFirst, parts: [seedInlinePart, artworkPart] },
            ];

            for (const attempt of attempts) {
                try {
                    const result = await requestImage(attempt.prompt, attempt.parts, modelToUse, `${attempt.name}:${modelToUse}`);
                    if (isRatioMatch(result.width, result.height)) {
                        return result.dataUrl;
                    }
                    lastResult = result;
                    console.warn(`[NANOBANANA] ${attempt.name} ratio mismatch: ${ratioMismatchMessage(result.width, result.height)}`);
                } catch (err: any) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    console.warn(`[NANOBANANA] ${attempt.name} failed (${modelToUse}): ${lastError.message}`);
                }
            }
        }

        if (seedInlinePart && lastResult && reframePrompt) {
            const reframeParts = [
                { inline_data: { mime_type: lastResult.mimeType, data: lastResult.base64 } },
                seedInlinePart,
            ];

            for (const modelToUse of modelCandidates) {
                try {
                    const result = await requestImage(reframePrompt, reframeParts, modelToUse, `reframe:${modelToUse}`);
                    if (isRatioMatch(result.width, result.height)) {
                        return result.dataUrl;
                    }
                    lastResult = result;
                    console.warn(`[NANOBANANA] reframe ratio mismatch: ${ratioMismatchMessage(result.width, result.height)}`);
                } catch (err: any) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    console.warn(`[NANOBANANA] reframe failed (${modelToUse}): ${lastError.message}`);
                }
            }
        }

        if (lastResult) {
            throw new Error(ratioMismatchMessage(lastResult.width, lastResult.height));
        }

        if (lastError) {
            throw lastError;
        }

        throw new Error("AI refused to generate image or returned invalid data. Reason: No candidates");

    } catch (error: any) {
        console.error("[NANOBANANA] Error:", error.message);
        throw error;
    }
}
