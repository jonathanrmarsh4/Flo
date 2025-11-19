import OpenAI from "openai";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { trackOpenAICompletion } from './aiUsageTracker';

function getOpenAIClient(): OpenAI {
  if (!process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    throw new Error("AI_INTEGRATIONS_OPENAI_API_KEY environment variable is not set. Please configure OpenAI integration.");
  }
  
  if (!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL) {
    throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL environment variable is not set. Please configure OpenAI integration.");
  }
  
  return new OpenAI({
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  });
}

const rawBiomarkerSchema = z.object({
  biomarker_name_raw: z.string().describe("The biomarker name exactly as it appears in the PDF"),
  value_raw: z.string().describe("The value exactly as written (e.g., '145', '12.5', '<5.0')"),
  unit_raw: z.string().describe("The unit exactly as written (e.g., 'mg/dL', 'mmol/L', '%')"),
  ref_range_raw: z.string().describe("The reference range exactly as written (e.g., '70-100', '<5.6', 'M: 300-1000')"),
  flag_raw: z.string().nullable().describe("Any flag/status exactly as written (e.g., 'High', 'Low', 'H', 'L', '*') or null"),
  date_raw: z.string().nullable().describe("Test date if visible on same line, else null"),
});

const extractionResponseSchema = z.object({
  biomarkers: z.array(rawBiomarkerSchema),
});

export type RawBiomarker = z.infer<typeof rawBiomarkerSchema>;
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export interface SimpleExtractionResult {
  success: boolean;
  data?: ExtractionResponse;
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

async function extractRawBiomarkersWithGPT(pdfText: string, userId?: string): Promise<ExtractionResponse> {
  const startTime = Date.now();
  const systemPrompt = `You are a precise medical lab report data extractor. Your ONLY job is to extract biomarker measurements EXACTLY as they appear in the report.

CRITICAL RULES:
1. Extract the biomarker name, value, unit, reference range, and flag EXACTLY as written - do NOT interpret, convert, or validate
2. If a value is "<5.0", extract "<5.0" as-is
3. If a reference range is "M: 300-1000 F: 15-70", extract "M: 300-1000 F: 15-70" as-is
4. If a flag is "H" or "High" or "*", extract it exactly as-is
5. Extract ONLY what you can see - if there's no flag, set flag_raw to null
6. Be CONSERVATIVE - only extract data you're 100% confident about
7. If a value or unit is missing, skip that biomarker entirely
8. Do NOT hallucinate or infer missing data

Output pure extracted data only.`;

  const userPrompt = `Extract all biomarker measurements from this lab report. For each biomarker, extract the 6 fields exactly as they appear:\n\n${pdfText}`;

  const openai = getOpenAIClient();
  
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "raw_biomarker_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            biomarkers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  biomarker_name_raw: {
                    type: "string",
                    description: "The biomarker name exactly as it appears in the PDF",
                  },
                  value_raw: {
                    type: "string",
                    description: "The value exactly as written (e.g., '145', '12.5', '<5.0')",
                  },
                  unit_raw: {
                    type: "string",
                    description: "The unit exactly as written (e.g., 'mg/dL', 'mmol/L', '%')",
                  },
                  ref_range_raw: {
                    type: "string",
                    description: "The reference range exactly as written (e.g., '70-100', '<5.6', 'M: 300-1000')",
                  },
                  flag_raw: {
                    anyOf: [{ type: "string" }, { type: "null" }],
                    description: "Any flag/status exactly as written (e.g., 'High', 'Low', 'H', 'L', '*') or null",
                  },
                  date_raw: {
                    anyOf: [{ type: "string" }, { type: "null" }],
                    description: "Test date if visible on same line, else null",
                  },
                },
                required: ["biomarker_name_raw", "value_raw", "unit_raw", "ref_range_raw", "flag_raw", "date_raw"],
                additionalProperties: false,
              },
            },
          },
          required: ["biomarkers"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("GPT-4o failed to return a response");
  }

  const latencyMs = Date.now() - startTime;

  // Track usage
  if (completion.usage) {
    await trackOpenAICompletion(
      'biomarker-extraction',
      'gpt-4o',
      {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      },
      {
        userId,
        latencyMs,
        status: 'success',
      }
    );
  }

  const parsed = JSON.parse(content);
  return extractionResponseSchema.parse(parsed);
}

export async function extractRawBiomarkers(pdfBuffer: Buffer, userId?: string): Promise<SimpleExtractionResult> {
  const MAX_PDF_SIZE = 10 * 1024 * 1024;
  
  if (pdfBuffer.length > MAX_PDF_SIZE) {
    return {
      success: false,
      error: `PDF file too large (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.`,
    };
  }
  
  try {
    const pdfText = await extractTextFromPdf(pdfBuffer);
    
    if (pdfText.length < 100) {
      return {
        success: false,
        error: "PDF appears to be empty or contains insufficient text",
      };
    }

    const extractionData = await extractRawBiomarkersWithGPT(pdfText, userId);
    
    if (!extractionData.biomarkers || extractionData.biomarkers.length === 0) {
      return {
        success: false,
        error: "No biomarkers were extracted from the report",
        pdfText,
      };
    }

    return {
      success: true,
      data: extractionData,
      pdfText,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error occurred during extraction",
    };
  }
}
