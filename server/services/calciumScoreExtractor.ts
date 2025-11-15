import OpenAI from "openai";
import { z } from "zod";
import { PDFParse } from "pdf-parse";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Zod schema matching the calcium score extraction template
const calciumScoreExtractionSchema = z.object({
  type: z.literal("coronary_calcium_score"),
  version: z.literal("1.0"),
  source_document: z.object({
    filename: z.string().nullable(),
    page_numbers: z.array(z.number()),
    lab_name: z.string().nullable(),
    report_id: z.string().nullable(),
  }),
  patient_context: z.object({
    reported_age: z.number().nullable(),
    reported_sex: z.string().nullable(),
  }),
  study: z.object({
    study_date: z.string().nullable(),
    scanner_type: z.string().nullable(),
    calcium_score_method: z.string().nullable(),
  }),
  results: z.object({
    total_agatston: z.number().nullable(),
    per_vessel: z.object({
      lad: z.number().nullable(),
      rca: z.number().nullable(),
      lcx: z.number().nullable(),
      lm: z.number().nullable(),
      other: z.record(z.number()),
    }),
    age_matched_percentile: z.number().nullable(),
    risk_category: z.string().nullable(),
    risk_category_human: z.string().nullable(),
    reference_ranges: z.object({
      zero: z.string().nullable(),
      minimal: z.string().nullable(),
      mild: z.string().nullable(),
      moderate: z.string().nullable(),
      severe: z.string().nullable(),
    }),
  }),
  interpretation: z.object({
    one_liner: z.string().nullable(),
    detail: z.string().nullable(),
    clinical_flags: z.array(z.string()),
  }),
  quality: z.object({
    confidence: z.enum(["high", "medium", "low"]).nullable(),
    extraction_issues: z.array(z.string()),
  }),
});

export type CalciumScoreExtraction = z.infer<typeof calciumScoreExtractionSchema>;

export interface CalciumScoreExtractionResult {
  success: boolean;
  data?: CalciumScoreExtraction;
  error?: string;
  pdfText?: string;
}

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractCalciumScoreWithGPT(pdfText: string): Promise<CalciumScoreExtraction> {
  const systemPrompt = `You are a precise coronary calcium score report analyzer. Your job is to extract structured data from cardiac CT imaging reports.

CRITICAL RULES:
1. Extract ALL numerical values exactly as reported
2. The total Agatston score is the PRIMARY metric - extract it precisely
3. Extract per-vessel scores (LAD, RCA, LCX, LM) if available
4. Extract age-matched percentile if reported
5. Identify risk category (zero, minimal, mild, moderate, severe)
6. Extract study date in ISO format (YYYY-MM-DD) if possible
7. If a value is not present in the report, set it to null
8. Be CONSERVATIVE - only extract data you're confident about
9. Do NOT hallucinate or infer missing numerical values

Common vessel abbreviations:
- LAD: Left Anterior Descending
- RCA: Right Coronary Artery
- LCX: Left Circumflex
- LM: Left Main

Risk categories (typical):
- Zero: 0
- Minimal: 1-10
- Mild: 11-100
- Moderate: 101-400
- Severe: >400`;

  const userPrompt = `Extract coronary calcium score data from this cardiac CT report:\n\n${pdfText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "coronary_calcium_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["coronary_calcium_score"] },
            version: { type: "string", enum: ["1.0"] },
            source_document: {
              type: "object",
              properties: {
                filename: { anyOf: [{ type: "string" }, { type: "null" }] },
                page_numbers: { type: "array", items: { type: "number" } },
                lab_name: { anyOf: [{ type: "string" }, { type: "null" }] },
                report_id: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: ["filename", "page_numbers", "lab_name", "report_id"],
              additionalProperties: false,
            },
            patient_context: {
              type: "object",
              properties: {
                reported_age: { anyOf: [{ type: "number" }, { type: "null" }] },
                reported_sex: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: ["reported_age", "reported_sex"],
              additionalProperties: false,
            },
            study: {
              type: "object",
              properties: {
                study_date: { anyOf: [{ type: "string" }, { type: "null" }] },
                scanner_type: { anyOf: [{ type: "string" }, { type: "null" }] },
                calcium_score_method: { anyOf: [{ type: "string" }, { type: "null" }] },
              },
              required: ["study_date", "scanner_type", "calcium_score_method"],
              additionalProperties: false,
            },
            results: {
              type: "object",
              properties: {
                total_agatston: { anyOf: [{ type: "number" }, { type: "null" }] },
                per_vessel: {
                  type: "object",
                  properties: {
                    lad: { anyOf: [{ type: "number" }, { type: "null" }] },
                    rca: { anyOf: [{ type: "number" }, { type: "null" }] },
                    lcx: { anyOf: [{ type: "number" }, { type: "null" }] },
                    lm: { anyOf: [{ type: "number" }, { type: "null" }] },
                    other: { type: "object", additionalProperties: { type: "number" } },
                  },
                  required: ["lad", "rca", "lcx", "lm", "other"],
                  additionalProperties: false,
                },
                age_matched_percentile: { anyOf: [{ type: "number" }, { type: "null" }] },
                risk_category: { anyOf: [{ type: "string" }, { type: "null" }] },
                risk_category_human: { anyOf: [{ type: "string" }, { type: "null" }] },
                reference_ranges: {
                  type: "object",
                  properties: {
                    zero: { anyOf: [{ type: "string" }, { type: "null" }] },
                    minimal: { anyOf: [{ type: "string" }, { type: "null" }] },
                    mild: { anyOf: [{ type: "string" }, { type: "null" }] },
                    moderate: { anyOf: [{ type: "string" }, { type: "null" }] },
                    severe: { anyOf: [{ type: "string" }, { type: "null" }] },
                  },
                  required: ["zero", "minimal", "mild", "moderate", "severe"],
                  additionalProperties: false,
                },
              },
              required: [
                "total_agatston",
                "per_vessel",
                "age_matched_percentile",
                "risk_category",
                "risk_category_human",
                "reference_ranges",
              ],
              additionalProperties: false,
            },
            interpretation: {
              type: "object",
              properties: {
                one_liner: { anyOf: [{ type: "string" }, { type: "null" }] },
                detail: { anyOf: [{ type: "string" }, { type: "null" }] },
                clinical_flags: { type: "array", items: { type: "string" } },
              },
              required: ["one_liner", "detail", "clinical_flags"],
              additionalProperties: false,
            },
            quality: {
              type: "object",
              properties: {
                confidence: {
                  anyOf: [
                    { type: "string", enum: ["high", "medium", "low"] },
                    { type: "null" },
                  ],
                },
                extraction_issues: { type: "array", items: { type: "string" } },
              },
              required: ["confidence", "extraction_issues"],
              additionalProperties: false,
            },
          },
          required: [
            "type",
            "version",
            "source_document",
            "patient_context",
            "study",
            "results",
            "interpretation",
            "quality",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content);
  return calciumScoreExtractionSchema.parse(parsed);
}

/**
 * Main extraction function - extracts calcium score data from PDF buffer
 */
export async function extractCalciumScoreFromPdf(
  pdfBuffer: Buffer
): Promise<CalciumScoreExtractionResult> {
  try {
    // Step 1: Extract text from PDF
    const pdfText = await extractTextFromPdf(pdfBuffer);

    if (!pdfText || pdfText.trim().length === 0) {
      return {
        success: false,
        error: "PDF appears to be empty or could not be read",
        pdfText,
      };
    }

    // Step 2: Extract calcium score data with GPT-4o
    const data = await extractCalciumScoreWithGPT(pdfText);

    return {
      success: true,
      data,
      pdfText,
    };
  } catch (error) {
    console.error("Calcium score extraction error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
    };
  }
}
