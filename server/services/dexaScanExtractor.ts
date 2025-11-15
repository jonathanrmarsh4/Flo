import OpenAI from "openai";
import {
  dexaScanExtractionSchema,
  getOpenAIJsonSchema,
  type DexaScanExtraction,
  type DexaScanExtractionResult,
} from "../schemas/dexaScan";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(pdfBuffer);
  return data.text || "";
}

async function extractDexaScanWithGPT(pdfText: string, modelName: string): Promise<DexaScanExtraction> {
  const systemPrompt = `You are a precise DEXA (Dual-Energy X-ray Absorptiometry) scan report analyzer specialized in extracting structured data from bone density and body composition reports.

CRITICAL RULES:
1. Extract ALL numerical values exactly as reported
2. T-scores are the PRIMARY metric for bone density - extract them precisely
3. Extract WHO classification (Normal, Osteopenia, Osteoporosis, Severe Osteoporosis) if available
4. Extract body composition metrics (fat %, lean mass, visceral fat) if available
5. Extract study date as a raw string exactly as written (e.g. "15/11/2025")
6. If a value is not present in the report, set it to null
7. Be CONSERVATIVE - only extract data you're confident about
8. Do NOT hallucinate or infer missing numerical values
9. Use decimal numbers for scores where possible (e.g. -1.2, 25.3)

Bone Density Metrics:
- T-score: Comparison to peak bone mass of healthy 30-year-old adult (most important for diagnosis)
- Z-score: Comparison to age-matched controls
- Common sites: Lumbar spine (L1-L4), Total hip, Femoral neck

WHO Classification (based on T-score):
- Normal: T-score ≥ -1.0
- Osteopenia: T-score between -1.0 and -2.5
- Osteoporosis: T-score ≤ -2.5
- Severe Osteoporosis: T-score ≤ -2.5 with fragility fracture

Body Composition Metrics:
- Fat percentage (total body)
- Fat mass (kg)
- Lean mass (kg)
- Bone mass (kg)
- Visceral Adipose Tissue (VAT) area (cm²) or mass (g)

For confidence assessment:
- High: All key metrics clearly visible and extracted
- Medium: Most metrics present but some minor uncertainties
- Low: Significant missing data or poor PDF quality`;

  const userPrompt = `I am providing you with a DEXA scan report as a PDF.

Your task:
1) Carefully read the report.
2) Extract all relevant bone density and body composition information into the EXACT JSON structure defined in the system message.
3) Do not guess any values. If something is not clearly legible or not present, set that field to null and add an explanation to "extraction_issues".
4) Do not interpret the result medically or give treatment advice.

Important:
- Output must be VALID JSON.
- Do not include any text outside the JSON.
- Use decimal numbers for scores where possible (e.g. -1.2, 25.3).
- Keep date fields as raw strings exactly as written.
- Extract the WHO classification exactly as written in the report.

Here is the DEXA report text:

${pdfText}`;

  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: getOpenAIJsonSchema(),
  });

  const content = completion.choices[0].message.content;
  if (!content) {
    throw new Error("No content in GPT response");
  }

  const parsed = JSON.parse(content);
  return dexaScanExtractionSchema.parse(parsed);
}

export async function extractDexaScan(
  pdfBuffer: Buffer,
  filename: string,
  options?: { model?: string }
): Promise<DexaScanExtractionResult> {
  try {
    const modelName = options?.model || "gpt-4o";
    
    const pdfText = await extractTextFromPdf(pdfBuffer);
    
    if (!pdfText || pdfText.trim().length === 0) {
      return {
        success: false,
        error: "PDF appears to be empty or unreadable",
        pdfText: "",
        modelUsed: modelName,
      };
    }

    const extraction = await extractDexaScanWithGPT(pdfText, modelName);
    
    extraction.source_document.filename = filename;

    return {
      success: true,
      data: extraction,
      pdfText,
      modelUsed: modelName,
    };
  } catch (error) {
    console.error("[DexaScanExtractor] Error:", error);
    const modelName = options?.model || "gpt-4o";
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
      modelUsed: modelName,
    };
  }
}
