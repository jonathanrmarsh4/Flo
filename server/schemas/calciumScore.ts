import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

// Memoized function to generate OpenAI JSON schema from Zod schema
let _cachedJsonSchema: any = null;

export function getOpenAIJsonSchema() {
  if (_cachedJsonSchema) {
    return _cachedJsonSchema;
  }

  const jsonSchema = zodToJsonSchema(calciumScoreExtractionSchema, {
    name: "coronary_calcium_extraction",
    // Remove $schema property as OpenAI doesn't need it
    $refStrategy: "none",
  });

  // Remove the $schema property that zod-to-json-schema adds
  const { $schema, ...schemaWithoutMeta } = jsonSchema as any;

  _cachedJsonSchema = {
    type: "json_schema",
    json_schema: {
      name: "coronary_calcium_extraction",
      strict: true,
      schema: schemaWithoutMeta,
    },
  };

  return _cachedJsonSchema;
}
