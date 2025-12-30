
import { GoogleGenAI, Type } from "@google/genai";
import { Product } from "../types";

const productSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      sku: {
        type: Type.STRING,
        description: "The unique part number, SKU, or model ID. Extract exactly as written.",
      },
      description: {
        type: Type.STRING,
        description: "Full product name or description. Merge multiple lines if necessary.",
      },
      normalPrice: {
        type: Type.STRING,
        description: "The standard price value without currency symbols.",
      },
      specialPrice: {
        type: Type.STRING,
        description: "The discounted or special price value without currency symbols.",
      },
    },
    required: ["sku", "description", "normalPrice", "specialPrice"],
  },
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const SYSTEM_INSTRUCTION = `You are a high-precision data extraction assistant. 
Your task is to extract product information from images of price lists or catalogs.

RULES:
1. Extract EVERY product found on the page.
2. SKU: Capture the product code or part number exactly.
3. DESCRIPTION: Capture the full product description. If it spans multiple lines, join them with a space.
4. PRICES: Extract prices as numbers (strings), removing any currency symbols like '$', 'R', or '£'. 
5. If a price is missing, return an empty string "".
6. Output MUST be a valid JSON array of objects.`;

export async function extractProductsFromImage(
  base64Image: string,
  retryCount = 0
): Promise<Partial<Product>[]> {
  const model = "gemini-3-flash-preview";
  const MAX_RETRIES = 2;
  
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Access to neural engine denied.");
  }

  // Directly use process.env.API_KEY as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
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
            { text: "Extract all products from this page. Focus on SKU, Description, and Prices. Return as a JSON array." },
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
    if (!text) {
      console.warn("Empty response from Gemini");
      return [];
    }
    
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("Failed to parse Gemini JSON output:", text);
      return [];
    }
  } catch (error: any) {
    const errorMsg = error?.message || "";
    const isRateLimit = error?.status === 429 || errorMsg.includes('429') || errorMsg.includes('quota');
    
    if (isRateLimit && retryCount < MAX_RETRIES) {
      const waitTime = Math.pow(2, retryCount + 1) * 1000;
      await delay(waitTime);
      return extractProductsFromImage(base64Image, retryCount + 1);
    }
    
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
}

export async function normalizeProductData(
  jsonText: string,
  retryCount = 0
): Promise<Partial<Product>[]> {
  const model = "gemini-3-flash-preview"; 
  const MAX_RETRIES = 2;
  
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing. Access denied.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: `Precisely normalize this product data into SKU and Description format: ${jsonText}` },
          ],
        },
      ],
      config: {
        systemInstruction: "Normalize the provided list into structured product JSON. Ensure SKUs and Descriptions are clean.",
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
      await delay(2000);
      return normalizeProductData(jsonText, retryCount + 1);
    }
    return [];
  }
}
