import OpenAI from "openai";
import { z } from "zod";
import { PDFParse } from "pdf-parse";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const extractedBiomarkerSchema = z.object({
  name: z.string().describe("The biomarker name as it appears in the lab report"),
  value: z.number().describe("The numeric measurement value"),
  unit: z.string().describe("The unit of measurement (e.g., mg/dL, mmol/L, %)"),
  referenceRangeLow: z.number().nullable().describe("Lower bound of reference range if provided"),
  referenceRangeHigh: z.number().nullable().describe("Upper bound of reference range if provided"),
  flags: z.array(z.string()).nullable().describe("Any flags like 'High', 'Low', 'Critical' from the report"),
});

const gptResponseSchema = z.object({
  testDate: z.string().describe("The date the lab test was performed (ISO 8601 format: YYYY-MM-DD)"),
  labName: z.string().nullable().describe("Name of the laboratory if mentioned"),
  biomarkers: z.array(extractedBiomarkerSchema).describe("Array of all biomarkers extracted from the lab report"),
  notes: z.string().nullable().describe("Any relevant notes or observations from the report"),
});

type ExtractedBiomarker = z.infer<typeof extractedBiomarkerSchema>;
type GPTResponse = z.infer<typeof gptResponseSchema>;

export interface ProcessingStep {
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  timestamp: string;
  error?: string;
}

export interface ProcessingResult {
  success: boolean;
  steps: ProcessingStep[];
  extractedData?: GPTResponse;
  sessionId?: string;
  measurementIds?: string[];
  error?: string;
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

async function extractBiomarkersWithGPT(pdfText: string): Promise<GPTResponse> {
  const systemPrompt = `You are a medical lab report analyzer. Extract biomarker measurements from lab reports with high accuracy.

CRITICAL RULE: NEVER CONVERT, NORMALIZE, OR SIMPLIFY UNITS
You must extract the EXACT unit string as written in the PDF - character for character.

DO NOT DO THIS (Common Mistakes):
❌ PDF says "22 pmol/L" → DO NOT extract as "nmol/L" 
❌ PDF says "8.3 umol/L" → DO NOT extract as "ug/dL"
❌ PDF says "1 mIU/mL" → DO NOT extract as "IU/L"
❌ PDF says "5.3 µmol/L" → DO NOT extract as "umol/L" (preserve µ symbol)
❌ PDF says "7.2 K/µL" → DO NOT extract as "10³/µL"

DO THIS (Correct Extraction):
✓ PDF says "22 pmol/L" → Extract EXACTLY as "pmol/L"
✓ PDF says "8.3 umol/L" → Extract EXACTLY as "umol/L"
✓ PDF says "1 mIU/mL" → Extract EXACTLY as "mIU/mL"
✓ PDF says "5.3 µmol/L" → Extract EXACTLY as "µmol/L" (keep µ symbol)
✓ PDF says "95 mg/dL" → Extract EXACTLY as "mg/dL"

Instructions:
1. Identify all biomarker measurements with their values and units
2. CRITICAL: Copy the unit string EXACTLY as it appears - do not convert pmol→nmol, umol→ug, mIU→IU, etc.
3. Extract reference ranges AND their units (essential for unit conversion)
4. Note any flags (High, Low, Critical, etc.)
5. Find the test date
6. Be conservative - only extract data you're confident about
7. Use exact biomarker names from the report
8. IMPORTANT: For optional fields (labName, notes, referenceRangeLow, referenceRangeHigh, flags), explicitly return null if not available

Common biomarkers to look for:
- Cholesterol: Total Cholesterol, LDL, HDL, Triglycerides
- Metabolic: Glucose, HbA1c, Insulin
- Liver: ALT, AST, ALP, Bilirubin
- Kidney: Creatinine, BUN, eGFR
- Thyroid: TSH, T3, T4
- Inflammation: CRP, ESR
- CBC: WBC, RBC, Hemoglobin, Hematocrit, Platelets
- Vitamins: Vitamin D, B12, Folate
- Hormones: Testosterone, Estradiol, Cortisol, SHBG, DHEA-S, FSH, LH

Output only the structured data as JSON.`;

  const userPrompt = `Extract all biomarker measurements from this lab report:\n\n${pdfText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lab_report_extraction",
        strict: true,
        schema: {
          type: "object",
          properties: {
            testDate: {
              type: "string",
              description: "The date the lab test was performed (ISO 8601 format: YYYY-MM-DD)",
            },
            labName: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "Name of the laboratory if mentioned",
            },
            biomarkers: {
              type: "array",
              description: "Array of all biomarkers extracted from the lab report",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "The biomarker name as it appears in the lab report",
                  },
                  value: {
                    type: "number",
                    description: "The numeric measurement value",
                  },
                  unit: {
                    type: "string",
                    description: "EXACT unit string from PDF - DO NOT convert pmol→nmol, umol→ug, mIU→IU. Copy character-for-character (e.g., pmol/L, umol/L, mIU/mL, mg/dL, mmol/L, %)",
                  },
                  referenceRangeLow: {
                    anyOf: [{ type: "number" }, { type: "null" }],
                    description: "Lower bound of reference range if provided",
                  },
                  referenceRangeHigh: {
                    anyOf: [{ type: "number" }, { type: "null" }],
                    description: "Upper bound of reference range if provided",
                  },
                  flags: {
                    anyOf: [
                      { type: "array", items: { type: "string" } },
                      { type: "null" }
                    ],
                    description: "Any flags like 'High', 'Low', 'Critical' from the report",
                  },
                },
                required: ["name", "value", "unit", "referenceRangeLow", "referenceRangeHigh", "flags"],
                additionalProperties: false,
              },
            },
            notes: {
              anyOf: [{ type: "string" }, { type: "null" }],
              description: "Any relevant notes or observations from the report",
            },
          },
          required: ["testDate", "labName", "biomarkers", "notes"],
          additionalProperties: false,
        },
      },
    },
    temperature: 0.1,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("GPT-4 failed to return a response");
  }

  const parsed = JSON.parse(content);
  const validated = gptResponseSchema.parse(parsed);
  
  return validated;
}

export async function processLabUpload(pdfBuffer: Buffer): Promise<ProcessingResult> {
  const MAX_PDF_SIZE = 10 * 1024 * 1024;
  
  if (pdfBuffer.length > MAX_PDF_SIZE) {
    throw new Error(`PDF file too large (${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.`);
  }
  
  const steps: ProcessingStep[] = [
    { name: "extract_text", status: "pending", timestamp: new Date().toISOString() },
    { name: "gpt_analysis", status: "pending", timestamp: new Date().toISOString() },
    { name: "validate_output", status: "pending", timestamp: new Date().toISOString() },
  ];

  try {
    steps[0].status = "in_progress";
    const pdfText = await extractTextFromPdf(pdfBuffer);
    steps[0].status = "completed";
    steps[0].timestamp = new Date().toISOString();

    if (pdfText.length < 100) {
      throw new Error("PDF appears to be empty or contains insufficient text");
    }

    steps[1].status = "in_progress";
    const extractedData = await extractBiomarkersWithGPT(pdfText);
    steps[1].status = "completed";
    steps[1].timestamp = new Date().toISOString();

    steps[2].status = "in_progress";
    if (!extractedData.biomarkers || extractedData.biomarkers.length === 0) {
      throw new Error("No biomarkers were extracted from the report");
    }
    steps[2].status = "completed";
    steps[2].timestamp = new Date().toISOString();

    return {
      success: true,
      steps,
      extractedData,
    };
  } catch (error: any) {
    const failedStepIndex = steps.findIndex(s => s.status === "in_progress");
    if (failedStepIndex >= 0) {
      steps[failedStepIndex].status = "failed";
      steps[failedStepIndex].error = error.message || "Unknown error";
      steps[failedStepIndex].timestamp = new Date().toISOString();
    }

    return {
      success: false,
      steps,
      error: error.message || "Unknown error occurred during processing",
    };
  }
}
