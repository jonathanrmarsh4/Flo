import OpenAI from "openai";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { 
  countryUnitConventions, 
  COUNTRY_NAMES,
  type CountryCode,
  type BiomarkerUnitConvention
} from "../../shared/domain/countryUnitConventions";
import { 
  validateBiomarkerUnits, 
  type ValidationResult 
} from "./labValidation";

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
  validation?: ValidationResult;
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

async function extractBiomarkersWithGPT(pdfText: string, country: CountryCode = "US"): Promise<GPTResponse> {
  const countryName = COUNTRY_NAMES[country];

  const systemPrompt = `You are a medical lab report analyzer. Extract biomarker measurements from lab reports.

Your task:
1. Find all biomarker measurements in the report
2. For each biomarker, extract:
   - The biomarker name exactly as shown
   - The numeric result value
   - The unit of measurement exactly as printed (e.g., mg/dL, nmol/L, pmol/L, µmol/L, IU/L, mIU/L)
   - The reference range (low and high values if provided)
   - Any flags (High, Low, Critical, etc.)
3. Find the test date and convert to YYYY-MM-DD format
4. Extract the lab name if visible

Important:
- Copy units EXACTLY as they appear - do not convert or substitute
- For missing data (labName, notes, reference ranges, flags), use null
- Include ALL biomarkers you can identify with confidence

Output the data as structured JSON.`;

  const userPrompt = `Extract all biomarker measurements from this ${countryName} lab report:\n\n${pdfText}`;

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
                    description: "Unit of measurement as seen in PDF (e.g., mg/dL, mmol/L, pmol/L, pg/mL, umol/L, ug/dL, mIU/mL, IU/L, %)",
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
  
  // Log GPT extraction for debugging
  console.log('[GPT Extraction] Raw biomarkers:', JSON.stringify(validated.biomarkers.map(b => ({
    name: b.name,
    value: b.value,
    unit: b.unit
  })), null, 2));
  
  return validated;
}

export async function processLabUpload(
  pdfBuffer: Buffer, 
  country: CountryCode = "US"
): Promise<ProcessingResult> {
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
    const extractedData = await extractBiomarkersWithGPT(pdfText, country);
    steps[1].status = "completed";
    steps[1].timestamp = new Date().toISOString();

    steps[2].status = "in_progress";
    if (!extractedData.biomarkers || extractedData.biomarkers.length === 0) {
      throw new Error("No biomarkers were extracted from the report");
    }
    
    const validation = validateBiomarkerUnits(extractedData.biomarkers, country);
    
    if (validation.hasBlockingIssues) {
      const errorIssues = validation.issues.filter(i => i.severity === "error");
      throw new Error(`Critical unit validation errors: ${errorIssues.map(i => `${i.biomarkerName} (${i.confidence})`).join(", ")}`);
    }
    
    if (validation.issues.length > 0) {
      console.log(`[Validation] Found ${validation.issues.length} unit validation issue(s) for ${country}:`, 
        JSON.stringify(validation.issues, null, 2));
    }
    
    steps[2].status = "completed";
    steps[2].timestamp = new Date().toISOString();

    return {
      success: true,
      steps,
      extractedData,
      validation,
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
