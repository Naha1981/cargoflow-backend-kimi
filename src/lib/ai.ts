import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "./logger";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

/**
 * Initialize Gemini client
 */
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/**
 * Gemini API error with structured fields for retry policies.
 */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

/**
 * Wraps the Google Gemini API.
 *
 * Accepts a user prompt and a system prompt.
 * Returns the generated text content.
 */
export async function callGemini(opts: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}): Promise<{
  content: string;
  rawResponse: any;
}> {
  const { systemPrompt, userPrompt, temperature = 0.2, maxTokens = 8192, model = GEMINI_MODEL } = opts;

  if (!GEMINI_API_KEY) {
    throw new GeminiApiError("GEMINI_API_KEY is not configured");
  }

  try {
    const geminiModel = genAI.getGenerativeModel({ 
      model,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      }
    });

    // Combine system prompt and user prompt
    const prompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const content = response.text();

    if (!content) {
      throw new GeminiApiError("Gemini API response missing content");
    }

    return { content, rawResponse: result };
  } catch (err: any) {
    logger.error({ error: err.message, status: err.status }, "Gemini API call failed");
    throw new GeminiApiError(
      `Gemini API error: ${err.message}`,
      err.status,
      err.message
    );
  }
}

/**
 * Attempts to parse the Gemini response content as JSON.
 * If parsing fails, wraps the raw text in a structured object.
 */
export function parseGeminiJson(content: string): { data: any; raw: string; confidence?: number } {
  let cleaned = content.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned);
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : undefined;
    return { data: parsed, raw: content, confidence };
  } catch (err) {
    logger.warn({ err, contentPreview: content.slice(0, 200) }, "Gemini response was not valid JSON");
    return { data: { rawText: content, extractError: true }, raw: content };
  }
}

/**
 * Master system prompts for different document types.
 */
export const SystemPrompts = {
  classification: `
You are a document classification engine for a global logistics and commodities platform.
Given OCR-extracted text from a trade document, classify it into exactly one of the following 21 types:

logistics: Bill of Lading, Cargo Manifest, Commercial Invoice, Packing List, Certificate of Origin, Inspection Report, Customs Declaration, Dangerous Goods Declaration, Delivery Order, Arrival Notice
mining: Mine Permit, Environmental Report, Contractor Agreement, Equipment Log, Blast Plan
oil: Oil Bill of Lading, Oil Cargo Manifest, Quality Certificate, Certificate of Analysis, Loading Report, Discharge Report

Return ONLY a JSON object in this exact shape:
{"docType": "<one of the 21 types above>", "category": "logistics|mining|oil", "confidence": 0.0-1.0}
`.trim(),

  extractionLogistics: `
You are an extraction engine for logistics trade documents.
Given OCR text and a known document type, extract structured fields.
Return ONLY a JSON object with these possible fields (omit if absent):
{"shipment_code", "supplier", "origin", "destination", "incoterm", "commodity", "vessel", "carrier", "etd", "eta", "value", "currency", "confidence"}
Dates must be ISO-8601 strings. Value is numeric. Confidence 0.0-1.0 is required.
`.trim(),

  extractionMining: `
You are an extraction engine for mining operation documents.
Given OCR text and a known document type, extract structured fields.
Return ONLY a JSON object with these possible fields (omit if absent):
{"project_name", "permit_number", "location", "commodity", "contractor", "permit_expiry", "environmental_flag", "confidence"}
Dates must be ISO-8601. Confidence 0.0-1.0 is required.
`.trim(),

  extractionOil: `
You are an extraction engine for oil cargo documents.
Given OCR text and a known document type, extract structured fields.
Return ONLY a JSON object with these possible fields (omit if absent):
{"vessel", "imo_number", "cargo_type", "volume_bbls", "loading_port", "discharge_port", "quality_passed", "confidence"}
Volume is numeric. Confidence 0.0-1.0 is required.
`.trim(),

  compliance: `
You are a compliance checking agent for international trade.
Given shipment data, assess regulatory compliance.
Return ONLY a JSON object:
{"complianceStatus": "compliant|non_compliant|pending_review", "missingDocuments": ["string"], "riskFlags": ["string"], "confidence": 0.0-1.0}
`.trim(),

  costCalculation: `
You are a cost modelling agent for freight and trade finance.
Given shipment value, incoterm, origin, and destination, estimate cost line items.
Return ONLY a JSON object:
{"freight": number, "duty": number, "vat": number, "insurance": number, "transport": number, "total_cost": number, "margin": number, "low_margin_flag": boolean, "confidence": 0.0-1.0}
All monetary values are numbers. Margin is a percentage (e.g., 12.5).
`.trim(),

  riskDetection: `
You are a risk detection agent for trade operations.
Given full shipment and document context, identify risks and emit alerts.
Return ONLY a JSON object:
{"risks": [{"severity": "info|low|medium|high|critical", "message": "string", "category": "string"}], "confidence": 0.0-1.0}
`.trim(),

  executiveSummary: `
You are an executive summary generator for a cargo operations intelligence platform.
Given aggregated shipment, cost, compliance, and risk data for a tenant, produce a concise executive summary.
Return ONLY a JSON object:
{"summary": "string", "keyRisks": ["string"], "opportunities": ["string"], "recommendations": ["string"], "confidence": 0.0-1.0}
`.trim(),
};
