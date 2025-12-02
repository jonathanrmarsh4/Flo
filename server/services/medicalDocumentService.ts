import { getSupabaseClient } from "./supabaseClient";
import { getHealthId as getHealthIdFromStorage } from "./supabaseHealthStorage";
import { writeInsightToBrain } from "./brainService";
import { generateEmbedding } from "./embeddingService";
import { ObjectStorageService } from "../objectStorage";
import { logger } from "../logger";
import OpenAI from "openai";
import crypto from "crypto";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";
import { fromBuffer } from "pdf2pic";
import fs from "fs/promises";
import path from "path";
import os from "os";

const openai = new OpenAI();
const objectStorage = new ObjectStorageService();

export type MedicalDocumentType = 
  | 'cardiology_report'
  | 'radiology_report'
  | 'pathology_report'
  | 'dermatology_report'
  | 'endocrinology_report'
  | 'gastroenterology_report'
  | 'neurology_report'
  | 'oncology_report'
  | 'orthopedic_report'
  | 'pulmonology_report'
  | 'rheumatology_report'
  | 'urology_report'
  | 'ophthalmology_report'
  | 'ent_report'
  | 'allergy_report'
  | 'sleep_study'
  | 'genetic_test'
  | 'imaging_report'
  | 'lab_narrative'
  | 'specialist_consult'
  | 'discharge_summary'
  | 'operative_report'
  | 'physical_therapy'
  | 'mental_health'
  | 'other';

export interface MedicalDocument {
  id: string;
  healthId: string;
  documentType: MedicalDocumentType;
  title: string | null;
  providerName: string | null;
  documentDate: string | null;
  filePath: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  processingStatus: 'pending' | 'extracting' | 'embedding' | 'completed' | 'failed';
  processingError: string | null;
  aiSummary: string | null;
  aiKeyFindings: KeyFinding[];
  extractedText: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KeyFinding {
  type: 'diagnosis' | 'recommendation' | 'finding' | 'medication' | 'follow_up' | 'concern';
  text: string;
  importance?: number;
}

export interface DocumentUploadResult {
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
}

export interface ExtractionResult {
  title: string;
  summary: string;
  keyFindings: KeyFinding[];
  fullText: string;
  providerName?: string;
  documentDate?: string;
}

const DOCUMENT_TYPE_LABELS: Record<MedicalDocumentType, string> = {
  cardiology_report: 'Cardiology Report',
  radiology_report: 'Radiology Report',
  pathology_report: 'Pathology Report',
  dermatology_report: 'Dermatology Report',
  endocrinology_report: 'Endocrinology Report',
  gastroenterology_report: 'Gastroenterology Report',
  neurology_report: 'Neurology Report',
  oncology_report: 'Oncology Report',
  orthopedic_report: 'Orthopedic Report',
  pulmonology_report: 'Pulmonology Report',
  rheumatology_report: 'Rheumatology Report',
  urology_report: 'Urology Report',
  ophthalmology_report: 'Ophthalmology Report',
  ent_report: 'ENT Report',
  allergy_report: 'Allergy Report',
  sleep_study: 'Sleep Study',
  genetic_test: 'Genetic Test',
  imaging_report: 'Imaging Report',
  lab_narrative: 'Lab Narrative',
  specialist_consult: 'Specialist Consultation',
  discharge_summary: 'Discharge Summary',
  operative_report: 'Operative Report',
  physical_therapy: 'Physical Therapy Report',
  mental_health: 'Mental Health Report',
  other: 'Other Medical Document'
};

export function getDocumentTypeLabel(type: MedicalDocumentType): string {
  return DOCUMENT_TYPE_LABELS[type] || 'Medical Document';
}

export function getDocumentTypes(): { value: MedicalDocumentType; label: string }[] {
  return Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
    value: value as MedicalDocumentType,
    label
  }));
}

async function getHealthId(userId: string): Promise<string> {
  // Use the centralized getHealthId from supabaseHealthStorage
  // which reads from Neon users table and caches the result
  return getHealthIdFromStorage(userId);
}

export async function createMedicalDocument(
  userId: string,
  documentType: MedicalDocumentType,
  filePath: string,
  fileName: string,
  fileSizeBytes: number,
  mimeType: string,
  metadata?: {
    title?: string;
    providerName?: string;
    documentDate?: string;
  }
): Promise<DocumentUploadResult> {
  try {
    const healthId = await getHealthId(userId);
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('medical_documents')
      .insert({
        health_id: healthId,
        document_type: documentType,
        title: metadata?.title || null,
        provider_name: metadata?.providerName || null,
        document_date: metadata?.documentDate || null,
        file_path: filePath,
        file_name: fileName,
        file_size_bytes: fileSizeBytes,
        mime_type: mimeType,
        processing_status: 'pending'
      })
      .select('id')
      .single();

    if (error) {
      logger.error('[MedicalDocService] Failed to create document record:', error);
      throw error;
    }

    logger.info(`[MedicalDocService] Created document ${data.id} for user ${userId}`);

    processDocumentAsync(userId, data.id, filePath).catch(err => {
      logger.error(`[MedicalDocService] Async processing failed for ${data.id}:`, err);
    });

    return {
      documentId: data.id,
      status: 'processing',
      message: 'Document uploaded and processing started'
    };
  } catch (error: any) {
    logger.error('[MedicalDocService] Error creating document:', error);
    throw error;
  }
}

async function processDocumentAsync(
  userId: string,
  documentId: string,
  filePath: string
): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    await supabase
      .from('medical_documents')
      .update({ processing_status: 'extracting' })
      .eq('id', documentId);

    const pdfBuffer = await objectStorage.getObjectEntityBuffer(filePath);

    const extractedText = await extractTextFromPDF(pdfBuffer);
    if (!extractedText || extractedText.trim().length < 50) {
      throw new Error('Could not extract meaningful text from document');
    }

    const contentHash = crypto.createHash('sha256').update(extractedText).digest('hex');

    const extraction = await extractDocumentInsights(extractedText);

    await supabase
      .from('medical_documents')
      .update({
        processing_status: 'embedding',
        extracted_text: extractedText,
        ai_summary: extraction.summary,
        ai_key_findings: extraction.keyFindings,
        title: extraction.title || null,
        provider_name: extraction.providerName || null,
        document_date: extraction.documentDate || null,
        content_hash: contentHash
      })
      .eq('id', documentId);

    const chunks = chunkText(extractedText, 600, 100);
    let chunkCount = 0;

    const { data: docData } = await supabase
      .from('medical_documents')
      .select('document_type, title')
      .eq('id', documentId)
      .single();

    const docType = docData?.document_type || 'specialist_consult';
    const docTitle = docData?.title || extraction.title || 'Medical Document';

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkTags = [
        docType,
        'medical-document',
        `doc-${documentId}`,
        `chunk-${i + 1}-of-${chunks.length}`
      ];

      if (extraction.providerName) {
        chunkTags.push(`provider:${extraction.providerName.toLowerCase().replace(/\s+/g, '-')}`);
      }

      const chunkText = `[${getDocumentTypeLabel(docType as MedicalDocumentType)}: ${docTitle}]\n\n${chunk}`;

      const insightId = await writeInsightToBrain(userId, chunkText, {
        source: 'medical_document',
        tags: chunkTags,
        importance: 4
      });

      try {
        const embedding = await generateEmbedding(chunk, userId);
        await supabase
          .from('user_insights_embeddings')
          .update({ document_id: documentId })
          .eq('insight_id', insightId);
      } catch (embError: any) {
        logger.warn(`[MedicalDocService] Failed to update embedding with document_id for chunk ${i}:`, { error: embError?.message });
      }

      chunkCount++;
    }

    const summaryTags = [
      docType,
      'medical-document',
      'summary',
      `doc-${documentId}`
    ];

    const summaryText = `[${getDocumentTypeLabel(docType as MedicalDocumentType)} Summary: ${docTitle}]\n\n${extraction.summary}\n\nKey Findings:\n${extraction.keyFindings.map(f => `- [${f.type}] ${f.text}`).join('\n')}`;

    await writeInsightToBrain(userId, summaryText, {
      source: 'medical_document',
      tags: summaryTags,
      importance: 5
    });

    await supabase
      .from('medical_documents')
      .update({
        processing_status: 'completed',
        chunk_count: chunkCount
      })
      .eq('id', documentId);

    logger.info(`[MedicalDocService] Successfully processed document ${documentId}: ${chunkCount} chunks created`);

  } catch (error: any) {
    logger.error(`[MedicalDocService] Processing failed for document ${documentId}:`, error);

    await supabase
      .from('medical_documents')
      .update({
        processing_status: 'failed',
        processing_error: error.message || 'Unknown error'
      })
      .eq('id', documentId);
  }
}

async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  logger.info('[MedicalDocService] Starting PDF text extraction with OCR fallback');
  
  try {
    const parser = new PDFParse({ data: pdfBuffer });
    const result = await parser.getInfo() as any;
    await parser.destroy();
    const initialText = result.text || "";
    
    // Check if we have meaningful text content
    const meaningfulLines = initialText.trim().split('\n').filter((line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^Page \d+ of \d+$/i.test(trimmed)) return false;
      if (/^[-=_]{3,}$/.test(trimmed)) return false;
      return trimmed.length > 3;
    });
    
    const totalChars = meaningfulLines.join('').length;
    const hasMinimalText = totalChars < 100;
    
    if (!hasMinimalText) {
      logger.info(`[MedicalDocService] PDF has extractable text (${totalChars} chars), using direct extraction`);
      return initialText;
    }
    
    // Fall back to OCR for scanned/image-based PDFs
    logger.info(`[MedicalDocService] PDF appears to be image-based (only ${totalChars} chars), using OCR`);
    return await extractTextWithOCR(pdfBuffer, result);
    
  } catch (error) {
    logger.error('[MedicalDocService] PDF parsing failed:', error);
    throw new Error('Failed to extract text from PDF. The document may be corrupted.');
  }
}

async function extractTextWithOCR(pdfBuffer: Buffer, pdfInfo: any): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'medical-doc-ocr-'));
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
    const numPages = pdfInfo.numpages || 1;
    
    logger.info(`[MedicalDocService] OCR processing ${numPages} page(s)`);
    
    for (let pageNum = 1; pageNum <= Math.min(numPages, 20); pageNum++) {
      logger.debug(`[MedicalDocService] OCR processing page ${pageNum}/${numPages}`);
      
      try {
        const pageResult = await converter(pageNum, { responseType: 'image' });
        
        if (!pageResult.path) {
          logger.error(`[MedicalDocService] No path returned for page ${pageNum}`);
          continue;
        }
        
        const { data: { text } } = await worker.recognize(pageResult.path);
        ocrText += text + '\n\n';
        
        await fs.unlink(pageResult.path);
      } catch (pageError) {
        logger.error(`[MedicalDocService] Error processing page ${pageNum}`, pageError);
      }
    }
    
    logger.info(`[MedicalDocService] OCR complete. Extracted ${ocrText.length} characters from ${numPages} pages`);
    
    if (ocrText.trim().length === 0) {
      logger.warn('[MedicalDocService] OCR produced no text output');
      throw new Error('Could not extract text from PDF. The document may be too low quality.');
    }
    
    return ocrText;
    
  } finally {
    if (worker) {
      await worker.terminate();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function extractDocumentInsights(text: string): Promise<ExtractionResult> {
  const truncatedText = text.slice(0, 15000);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a medical document analyzer. Extract key information from medical reports.
Return a JSON object with:
- title: A concise title for this document (e.g., "Cardiology Consultation - Dr. Smith")
- summary: A 2-3 sentence summary of the key findings and conclusions
- providerName: The doctor or facility name if mentioned
- documentDate: The date of the report in YYYY-MM-DD format if mentioned
- keyFindings: An array of findings, each with:
  - type: one of "diagnosis", "recommendation", "finding", "medication", "follow_up", "concern"
  - text: The finding text
  - importance: 1-5 scale (5 = critical)

Focus on clinically significant information. Be concise but accurate.`
      },
      {
        role: 'user',
        content: `Extract insights from this medical document:\n\n${truncatedText}`
      }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2000
  });

  try {
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI');
    }

    const parsed = JSON.parse(content);
    return {
      title: parsed.title || 'Medical Document',
      summary: parsed.summary || 'No summary available',
      keyFindings: Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      fullText: text,
      providerName: parsed.providerName,
      documentDate: parsed.documentDate
    };
  } catch (error) {
    logger.error('[MedicalDocService] Failed to parse AI response:', error);
    return {
      title: 'Medical Document',
      summary: 'Document uploaded but summary extraction failed',
      keyFindings: [],
      fullText: text
    };
  }
}

function chunkText(text: string, chunkSize: number = 600, overlap: number = 100): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  
  let currentChunk = '';
  let currentTokens = 0;

  for (const sentence of sentences) {
    const sentenceTokens = Math.ceil(sentence.length / 4);

    if (currentTokens + sentenceTokens > chunkSize && currentChunk) {
      chunks.push(currentChunk.trim());

      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.ceil(overlap / 4));
      currentChunk = overlapWords.join(' ') + ' ' + sentence;
      currentTokens = Math.ceil(currentChunk.length / 4);
    } else {
      currentChunk += (currentChunk ? ' ' : '') + sentence;
      currentTokens += sentenceTokens;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function getMedicalDocuments(
  userId: string,
  options?: {
    documentType?: MedicalDocumentType;
    limit?: number;
    includeText?: boolean;
  }
): Promise<MedicalDocument[]> {
  try {
    const healthId = await getHealthId(userId);
    const supabase = getSupabaseClient();

    let query = supabase
      .from('medical_documents')
      .select('*')
      .eq('health_id', healthId)
      .order('created_at', { ascending: false });

    if (options?.documentType) {
      query = query.eq('document_type', options.documentType);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('[MedicalDocService] Failed to fetch documents:', error);
      throw error;
    }

    return (data || []).map((doc: any) => ({
      id: doc.id,
      healthId: doc.health_id,
      documentType: doc.document_type,
      title: doc.title,
      providerName: doc.provider_name,
      documentDate: doc.document_date,
      filePath: doc.file_path || null,
      fileName: doc.file_name,
      fileSizeBytes: doc.file_size_bytes || null,
      mimeType: doc.mime_type || null,
      processingStatus: doc.processing_status,
      processingError: doc.processing_error || null,
      aiSummary: doc.ai_summary,
      aiKeyFindings: doc.ai_key_findings || [],
      extractedText: options?.includeText ? doc.extracted_text : null,
      chunkCount: doc.chunk_count || 0,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    }));
  } catch (error) {
    logger.error('[MedicalDocService] Error fetching documents:', error);
    throw error;
  }
}

export async function getMedicalDocument(
  userId: string,
  documentId: string
): Promise<MedicalDocument | null> {
  try {
    const healthId = await getHealthId(userId);
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('medical_documents')
      .select('*')
      .eq('id', documentId)
      .eq('health_id', healthId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return {
      id: data.id,
      healthId: data.health_id,
      documentType: data.document_type,
      title: data.title,
      providerName: data.provider_name,
      documentDate: data.document_date,
      filePath: data.file_path,
      fileName: data.file_name,
      fileSizeBytes: data.file_size_bytes,
      mimeType: data.mime_type,
      processingStatus: data.processing_status,
      processingError: data.processing_error,
      aiSummary: data.ai_summary,
      aiKeyFindings: data.ai_key_findings || [],
      extractedText: data.extracted_text,
      chunkCount: data.chunk_count || 0,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  } catch (error) {
    logger.error('[MedicalDocService] Error fetching document:', error);
    throw error;
  }
}

export async function deleteMedicalDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  try {
    const healthId = await getHealthId(userId);
    const supabase = getSupabaseClient();

    const { data: doc } = await supabase
      .from('medical_documents')
      .select('file_path')
      .eq('id', documentId)
      .eq('health_id', healthId)
      .single();

    if (doc?.file_path) {
      await objectStorage.deleteObjectEntity(doc.file_path).catch(err => {
        logger.warn(`[MedicalDocService] Failed to delete file ${doc.file_path}:`, err);
      });
    }

    const { error } = await supabase
      .from('medical_documents')
      .delete()
      .eq('id', documentId)
      .eq('health_id', healthId);

    if (error) {
      throw error;
    }

    logger.info(`[MedicalDocService] Deleted document ${documentId}`);
    return true;
  } catch (error) {
    logger.error('[MedicalDocService] Error deleting document:', error);
    return false;
  }
}

export async function searchMedicalDocuments(
  userId: string,
  query: string,
  limit: number = 5
): Promise<{ text: string; similarity: number; documentId?: string; documentType?: string }[]> {
  try {
    const supabase = getSupabaseClient();
    const queryEmbedding = await generateEmbedding(query, userId);

    const { data, error } = await supabase.rpc('match_user_insights', {
      query_embedding: queryEmbedding,
      match_user_id: userId,
      match_count: limit * 2,
      min_importance: 3
    });

    if (error) {
      throw error;
    }

    const medicalResults = (data || [])
      .filter((item: any) => item.source === 'medical_document')
      .slice(0, limit)
      .map((item: any) => {
        const docIdTag = item.tags?.find((t: string) => t.startsWith('doc-'));
        const docTypeTag = item.tags?.find((t: string) => 
          Object.keys(DOCUMENT_TYPE_LABELS).includes(t)
        );
        
        return {
          text: item.text,
          similarity: item.similarity,
          documentId: docIdTag?.replace('doc-', ''),
          documentType: docTypeTag
        };
      });

    return medicalResults;
  } catch (error) {
    logger.error('[MedicalDocService] Search failed:', error);
    return [];
  }
}
