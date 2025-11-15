import OpenAI from "openai";
import { PDFParse } from "pdf-parse";
import {
  calciumScoreExtractionSchema,
  getOpenAIJsonSchema,
  type CalciumScoreExtraction,
  type CalciumScoreExtractionResult,
} from "../schemas/calciumScore";
import { logger } from "../logger";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

async function extractTextFromPdf(pdfBuffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  return result.text;
}

async function extractCalciumScoreWithGPT(pdfText: string): Promise<CalciumScoreExtraction> {
  const systemPrompt = `You are a precise coronary calcium score report analyzer. Your job is to extract structured data from cardiac CT imaging reports.

CRITICAL RULES:
1. Extract ALL numerical values exactly as reported
2. The total Agatston score is the PRIMARY metric - extract it precisely
3. Extract per-vessel scores (LAD, RCA, LCX, LM) if available
4. Extract age-matched percentile if reported
5. Identify risk category (zero, minimal, mild, moderate, severe)
6. Extract study date as a raw string exactly as written (e.g. "15/11/2025")
7. If a value is not present in the report, set it to null
8. Be CONSERVATIVE - only extract data you're confident about
9. Do NOT hallucinate or infer missing numerical values
10. Use decimal numbers for scores where possible (e.g. 12, 120.5)

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

  const userPrompt = `I am providing you with a coronary artery calcium (CAC) scoring report as a PDF scan.

Your task:
1) Carefully read the report.
2) Extract all relevant information into the EXACT JSON structure defined in the system message.
3) Do not guess any values. If something is not clearly legible, set that field to null and add an explanation to "extraction_issues".
4) Do not interpret the result medically or give treatment advice.

Important:
- Output must be VALID JSON.
- Do not include any text outside the JSON.
- Use decimal numbers for scores where possible (e.g. 12, 120.5).
- Keep date fields as raw strings exactly as written.

Here is the CAC report text:

${pdfText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: getOpenAIJsonSchema(),
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
    logger.error("Calcium score extraction error", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
    };
  }
}
