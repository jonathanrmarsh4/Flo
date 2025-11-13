import OpenAI from "openai";
import { z } from "zod";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const extractedBiomarkerSchema = z.object({
  name: z.string().describe("The biomarker name as it appears in the lab report"),
  value: z.number().describe("The numeric measurement value"),
  unit: z.string().describe("The unit of measurement (e.g., mg/dL, mmol/L, %)"),
  referenceRangeLow: z.number().optional().describe("Lower bound of reference range if provided"),
  referenceRangeHigh: z.number().optional().describe("Upper bound of reference range if provided"),
  flags: z.array(z.string()).optional().describe("Any flags like 'High', 'Low', 'Critical' from the report"),
});

const gptResponseSchema = z.object({
  testDate: z.string().describe("The date the lab test was performed (ISO 8601 format: YYYY-MM-DD)"),
  labName: z.string().optional().describe("Name of the laboratory if mentioned"),
  biomarkers: z.array(extractedBiomarkerSchema).describe("Array of all biomarkers extracted from the lab report"),
  notes: z.string().optional().describe("Any relevant notes or observations from the report"),
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

async function downloadPdfFromGCS(fileUrl: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  try {
    const response = await fetch(fileUrl, {
      signal: controller.signal,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(pdfBuffer);
  return data.text;
}

async function extractBiomarkersWithGPT(pdfText: string): Promise<GPTResponse> {
  const systemPrompt = `You are a medical lab report analyzer. Extract biomarker measurements from lab reports with high accuracy.

Instructions:
1. Identify all biomarker measurements with their values and units
2. Extract reference ranges when provided
3. Note any flags (High, Low, Critical, etc.)
4. Find the test date
5. Be conservative - only extract data you're confident about
6. For biomarker names, use the exact terminology from the report

Common biomarkers to look for:
- Cholesterol panel: Total Cholesterol, LDL, HDL, Triglycerides
- Metabolic: Glucose, HbA1c, Insulin
- Liver: ALT, AST, ALP, Bilirubin
- Kidney: Creatinine, BUN, eGFR
- Thyroid: TSH, T3, T4
- Inflammation: CRP, ESR
- Complete Blood Count: WBC, RBC, Hemoglobin, Hematocrit, Platelets
- Vitamins: Vitamin D, B12, Folate
- Hormones: Testosterone, Estradiol, Cortisol

Output only the structured data as JSON.`;

  const userPrompt = `Extract all biomarker measurements from this lab report:\n\n${pdfText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-2024-08-06",
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
              type: "string",
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
                    description: "The unit of measurement (e.g., mg/dL, mmol/L, %)",
                  },
                  referenceRangeLow: {
                    type: "number",
                    description: "Lower bound of reference range if provided",
                  },
                  referenceRangeHigh: {
                    type: "number",
                    description: "Upper bound of reference range if provided",
                  },
                  flags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Any flags like 'High', 'Low', 'Critical' from the report",
                  },
                },
                required: ["name", "value", "unit"],
                additionalProperties: false,
              },
            },
            notes: {
              type: "string",
              description: "Any relevant notes or observations from the report",
            },
          },
          required: ["testDate", "biomarkers"],
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
  return gptResponseSchema.parse(parsed);
}

export async function processLabUpload(fileUrl: string): Promise<ProcessingResult> {
  const steps: ProcessingStep[] = [
    { name: "download_pdf", status: "pending", timestamp: new Date().toISOString() },
    { name: "extract_text", status: "pending", timestamp: new Date().toISOString() },
    { name: "gpt_analysis", status: "pending", timestamp: new Date().toISOString() },
    { name: "validate_output", status: "pending", timestamp: new Date().toISOString() },
  ];

  try {
    steps[0].status = "in_progress";
    const pdfBuffer = await downloadPdfFromGCS(fileUrl);
    steps[0].status = "completed";
    steps[0].timestamp = new Date().toISOString();

    steps[1].status = "in_progress";
    const pdfText = await extractTextFromPdf(pdfBuffer);
    steps[1].status = "completed";
    steps[1].timestamp = new Date().toISOString();

    if (pdfText.length < 100) {
      throw new Error("PDF appears to be empty or contains insufficient text");
    }

    steps[2].status = "in_progress";
    const extractedData = await extractBiomarkersWithGPT(pdfText);
    steps[2].status = "completed";
    steps[2].timestamp = new Date().toISOString();

    steps[3].status = "in_progress";
    if (!extractedData.biomarkers || extractedData.biomarkers.length === 0) {
      throw new Error("No biomarkers were extracted from the report");
    }
    steps[3].status = "completed";
    steps[3].timestamp = new Date().toISOString();

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
