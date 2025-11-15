import { z } from "zod";

// Zod schema for calcium score extraction - single source of truth
// Using .strict() on all objects to ensure additionalProperties: false in generated JSON schema
export const calciumScoreExtractionSchema = z.object({
  type: z.literal("coronary_calcium_score"),
  version: z.literal("1.0"),
  source_document: z.object({
    filename: z.string().nullable(),
    page_numbers: z.array(z.number()),
    lab_name: z.string().nullable(),
    report_id: z.string().nullable(),
  }).strict(),
  patient_context: z.object({
    reported_age: z.number().nullable(),
    reported_sex: z.string().nullable(),
  }).strict(),
  study: z.object({
    study_date: z.string().nullable(),
    scanner_type: z.string().nullable(),
    calcium_score_method: z.string().nullable(),
  }).strict(),
  results: z.object({
    total_agatston: z.number().nullable(),
    per_vessel: z.object({
      lad: z.number().nullable(),
      rca: z.number().nullable(),
      lcx: z.number().nullable(),
      lm: z.number().nullable(),
    }).strict(),
    age_matched_percentile: z.number().nullable(),
    risk_category: z.string().nullable(),
    risk_category_human: z.string().nullable(),
    reference_ranges: z.object({
      zero: z.string().nullable(),
      minimal: z.string().nullable(),
      mild: z.string().nullable(),
      moderate: z.string().nullable(),
      severe: z.string().nullable(),
    }).strict(),
  }).strict(),
  interpretation: z.object({
    one_liner: z.string().nullable(),
    detail: z.string().nullable(),
    clinical_flags: z.array(z.string()),
  }).strict(),
  quality: z.object({
    confidence: z.enum(["high", "medium", "low"]).nullable(),
    extraction_issues: z.array(z.string()),
  }).strict(),
}).strict();

export type CalciumScoreExtraction = z.infer<typeof calciumScoreExtractionSchema>;

export interface CalciumScoreExtractionResult {
  success: boolean;
  data?: CalciumScoreExtraction;
  error?: string;
  pdfText?: string;
  modelUsed?: string;
}

// Manually defined OpenAI JSON schema that exactly matches the Zod schema
// This is more reliable than auto-generation which can create $ref issues
export function getOpenAIJsonSchema() {
  return {
    type: "json_schema" as const,
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
                },
                required: ["lad", "rca", "lcx", "lm"],
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
  };
}
