
import { GoogleGenAI, Type } from "@google/genai";
import { Product } from "../types";

const productSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      sku: {
        type: Type.STRING,
        description: "The unique part number, SKU, or model ID. Must be captured with 100% character precision including special characters/hyphens.",
      },
      description: {
        type: Type.STRING,
        description: "Full product description. Merge related lines if the text wraps. Include size, color, or technical specs if present.",
      },
      normalPrice: {
        type: Type.STRING,
        description: "The base or standard price. Clean of currency symbols. Return empty string '' if absolutely missing.",
      },
      specialPrice: {
        type: Type.STRING,
        description: "The promotional, dealer, or sale price. Clean of currency symbols. Return empty string '' if absolutely missing.",
      },
    },
    required: ["sku", "description", "normalPrice", "specialPrice"],
  },
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Retrieves a random API key from the environment variables to rotate requests.
 * Supports API_KEY, API_KEY_2, API_KEY_3, API_KEY_4, API_KEY_5
 */
const getRotatingApiKey = (): string => {
  const keys = [
    process.env.API_KEY,
    (process.env as any).API_KEY_2,
    (process.env as any).API_KEY_3,
    (process.env as any).API_KEY_4,
    (process.env as any).API_KEY_5,
  ].filter(Boolean);
  
  if (keys.length === 0) return process.env.API_KEY || '';
  return keys[Math.floor(Math.random() * keys.length)];
};

const SYSTEM_INSTRUCTION = `You are an elite, industrial-grade data extraction engine specializing in complex price lists and product catalogs.

CRITICAL OPERATIONAL PROTOCOLS FOR MAXIMUM ACCURACY:
1. HIGH-FIDELITY OCR: You must perform character-level validation on every SKU. Do not guess or auto-correct part numbers. Capture them exactly as visually rendered.
2. TOTAL RECALL: Extract EVERY SINGLE product line item on the document. Zero omissions are tolerated.
3. CONTEXTUAL MERGING: Product descriptions often span multiple vertical lines. You must intelligently merge these into a single coherent description string for the corresponding SKU.
4. SPATIAL ALIGNMENT: Use the visual grid of the document to correctly associate Prices with their respective SKUs and Descriptions. Ensure columns are not mismatched.
5. STRICT SEQUENTIAL ORDER: Process the document in a logical flow (typically top-to-bottom, left-to-right). The resulting JSON array must reflect this visual order.
6. DATA SANITIZATION: 
   - Prices: Remove currency symbols (e.g., $, R, £) but keep decimals.
   - Missing Data: If a price field is empty or contains placeholders like 'N/A', '-', or 'TBA', return an empty string "". Never invent data.
7. OUTPUT: Return ONLY a valid JSON array conforming to the provided schema.`;

export async function extractProductsFromImage(
  base64Image: string,
  retryCount = 0
): Promise<Partial<Product>[]> {
  const model = "gemini-3-pro-preview";
  const MAX_RETRIES = 3;
  
  // Use rotating key for each attempt to minimize 429 errors
  const apiKey = getRotatingApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            { text: "EXTRACT ALL PRODUCT DATA WITH MAXIMUM PRECISION. Identify every line item, capture SKUs exactly, merge multi-line descriptions, and align prices correctly. Ensure NO items are missed. Return result as a JSON array." },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: productSchema,
        temperature: 0.1, 
      },
    });

    const text = response.text;
    if (!text) return [];
    
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to parse Gemini output:", text);
      return [];
    }
  } catch (error: any) {
    const errorMsg = error?.message || "";
    const isRateLimit = error?.status === 429 || errorMsg.includes('429') || errorMsg.includes('quota');
    
    if (isRateLimit && retryCount < MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000 + Math.random() * 500;
      await delay(waitTime);
      return extractProductsFromImage(base64Image, retryCount + 1);
    }
    
    throw error;
  }
}

export async function normalizeProductData(
  jsonText: string,
  retryCount = 0
): Promise<Partial<Product>[]> {
  const model = "gemini-3-flash-preview"; 
  const MAX_RETRIES = 2;
  const apiKey = getRotatingApiKey();
  const ai = new GoogleGenAI({ apiKey });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: `Precisely normalize and format this batch of product data. Maintain strict order and data integrity: ${jsonText}` },
          ],
        },
      ],
      config: {
        systemInstruction: "Normalize product data for database ingestion. Ensure SKUs are preserved exactly and prices are sanitized to numerical strings. Return JSON array.",
        responseMimeType: "application/json",
        responseSchema: productSchema,
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text);
  } catch (error: any) {
    if ((error?.status === 429) && retryCount < MAX_RETRIES) {
      await delay(1000);
      return normalizeProductData(jsonText, retryCount + 1);
    }
    return [];
  }
}
