import OpenAI from "openai";
import { createWorker } from "tesseract.js";
import { fromBuffer } from "pdf2pic";
import fs from "fs/promises";
import path from "path";
import os from "os";
import {
  dexaScanExtractionSchema,
  getOpenAIJsonSchema,
  type DexaScanExtraction,
  type DexaScanExtractionResult,
} from "../schemas/dexaScan";
import { logger } from "../logger";

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

async function extractTextFromPdfWithOCR(pdfBuffer: Buffer): Promise<string> {
  logger.debug("[OCR] Starting PDF text extraction with OCR fallback");
  
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getInfo() as any;
  await parser.destroy();
  const initialText = result.text || "";
  
  const meaningfulLines = initialText.trim().split('\n').filter((line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^Page \d+ of \d+$/i.test(trimmed)) return false;
    if (/^[-=_]{3,}$/.test(trimmed)) return false;
    return trimmed.length > 3;
  });
  
  const totalChars = meaningfulLines.join('').length;
  const hasMinimalText = totalChars < 50;
  
  if (!hasMinimalText) {
    logger.debug(`[OCR] PDF has extractable text (${totalChars} chars), using direct extraction`);
    return initialText;
  }
  
  logger.debug(`[OCR] PDF appears to be image-based (only ${totalChars} chars), using OCR`);
  
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-ocr-'));
  let worker;
  
  try {
    const converter = fromBuffer(pdfBuffer, {
      density: 300,
      saveFilename: "page",
      savePath: tempDir,
      format: "png",
      width: 2480,
      height: 3508
    });
    
    worker = await createWorker('eng');
    
    let ocrText = '';
    const pdfInfo: any = result;
    const numPages = pdfInfo.numpages || 1;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      logger.debug(`[OCR] Processing page ${pageNum}/${numPages}`);
      
      try {
        const pageResult = await converter(pageNum, { responseType: 'image' });
        
        if (!pageResult.path) {
          logger.error(`[OCR] No path returned for page ${pageNum}`);
          continue;
        }
        
        const { data: { text } } = await worker.recognize(pageResult.path);
        ocrText += text + '\n\n--- Page ' + pageNum + ' ---\n\n';
        
        await fs.unlink(pageResult.path);
      } catch (pageError) {
        logger.error(`[OCR] Error processing page ${pageNum}`, pageError);
      }
    }
    
    logger.debug(`[OCR] Extraction complete. Extracted ${ocrText.length} characters from ${numPages} pages`);
    
    if (ocrText.trim().length === 0) {
      logger.warn('[OCR] Warning: OCR produced no text output');
    }
    
    return ocrText;
    
  } finally {
    if (worker) {
      await worker.terminate();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractDexaScanWithGPT(pdfText: string, modelName: string): Promise<DexaScanExtraction> {
  const systemPrompt = `You are a precise DEXA (Dual-Energy X-ray Absorptiometry) scan report analyzer specialized in extracting structured data from bone density and body composition reports, including poor quality or difficult-to-read PDFs.

CRITICAL RULES:
1. Extract ALL numerical values exactly as reported, even if the PDF quality is poor
2. T-scores are the PRIMARY metric for bone density - extract them precisely
3. Extract WHO classification (Normal, Osteopenia, Osteoporosis, Severe Osteoporosis) if available
4. Extract body composition metrics (fat %, lean mass, visceral fat) if available
5. Extract study date as a raw string exactly as written (e.g. "15/11/2025")
6. If a value is not present in the report, set it to null
7. Be CONSERVATIVE - only extract data you're confident about
8. Do NOT hallucinate or infer missing numerical values
9. Use decimal numbers for scores where possible (e.g. -1.2, 25.3)
10. For poor quality PDFs, use context clues and medical knowledge to interpret unclear text
11. Look for common OCR errors and correct them (e.g., "O" vs "0", "l" vs "1", "-" vs "–")

Bone Density Metrics:
- T-score: Comparison to peak bone mass of healthy 30-year-old adult (most important for diagnosis)
- Z-score: Comparison to age-matched controls
- Common sites: Lumbar spine (L1-L4), Total hip, Femoral neck
- T-scores are typically negative numbers (e.g., -1.5, -2.3)

WHO Classification (based on T-score):
- Normal: T-score ≥ -1.0
- Osteopenia: T-score between -1.0 and -2.5
- Osteoporosis: T-score ≤ -2.5
- Severe Osteoporosis: T-score ≤ -2.5 with fragility fracture

Body Composition Metrics:
- Fat percentage (total body): typically 10-40% range
- Fat mass (kg)
- Lean mass (kg)
- Bone mass (kg)
- Visceral Adipose Tissue (VAT) area (cm²) or mass (g)

Common OCR Errors to Watch For:
- "T-score" might appear as "T-score", "Tscore", or "T score"
- Negative signs might be long dashes or hyphens
- Decimal points might be unclear
- "L1-L4" might appear as "L1-L4", "L1-4", or "L1-L 4"

For confidence assessment:
- High: All key metrics clearly visible and extracted
- Medium: Most metrics present but some minor uncertainties or OCR artifacts
- Low: Significant missing data, poor PDF quality, or many OCR errors`;

  const userPrompt = `I am providing you with a DEXA scan report as text extracted from a PDF (potentially using OCR, so there may be formatting issues or errors).

Your task:
1) Carefully read the report.
2) Extract all relevant bone density and body composition information into the EXACT JSON structure defined in the system message.
3) Do not guess any values. If something is not clearly legible or not present, set that field to null and add an explanation to "extraction_issues".
4) Do not interpret the result medically or give treatment advice.
5) If you encounter OCR errors or unclear text, use medical context to make best-effort corrections.

Important:
- Output must be VALID JSON.
- Do not include any text outside the JSON.
- Use decimal numbers for scores where possible (e.g. -1.2, 25.3).
- Keep date fields as raw strings exactly as written.
- Extract the WHO classification exactly as written in the report.
- For OCR text, focus on extracting numerical values and key terms despite formatting issues.

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

export async function extractDexaScanExperimental(
  pdfBuffer: Buffer,
  filename: string,
  options?: { model?: string }
): Promise<DexaScanExtractionResult> {
  try {
    const modelName = options?.model || "gpt-5";
    
    logger.debug(`[DEXA Experimental] Starting OCR + ${modelName} extraction`);
    const pdfText = await extractTextFromPdfWithOCR(pdfBuffer);
    
    if (!pdfText || pdfText.trim().length === 0) {
      return {
        success: false,
        error: "PDF appears to be empty or unreadable even after OCR",
        pdfText: "",
        modelUsed: modelName,
      };
    }

    logger.debug(`[DEXA Experimental] Extracted ${pdfText.length} chars, sending to ${modelName}`);
    const extraction = await extractDexaScanWithGPT(pdfText, modelName);
    
    extraction.source_document.filename = filename;

    logger.debug(`[DEXA Experimental] Extraction successful with ${modelName}`);
    return {
      success: true,
      data: extraction,
      pdfText,
      modelUsed: modelName,
    };
  } catch (error) {
    logger.error("[DEXA Experimental] Error", error);
    const modelName = options?.model || "gpt-5";
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown extraction error",
      modelUsed: modelName,
    };
  }
}
