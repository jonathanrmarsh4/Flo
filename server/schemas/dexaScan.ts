import { z } from "zod";

// Zod schema for DEXA scan extraction - single source of truth
// Using .strict() on all objects to ensure additionalProperties: false in generated JSON schema
export const dexaScanExtractionSchema = z.object({
  type: z.literal("dexa_scan"),
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
    scan_mode: z.string().nullable(),
  }).strict(),
  bone_density: z.object({
    spine_t_score: z.number().nullable(),
    spine_z_score: z.number().nullable(),
    total_hip_t_score: z.number().nullable(),
    total_hip_z_score: z.number().nullable(),
    femoral_neck_t_score: z.number().nullable(),
    femoral_neck_z_score: z.number().nullable(),
    who_classification: z.string().nullable(),
    fracture_risk_10yr: z.number().nullable(),
  }).strict(),
  body_composition: z.object({
    fat_percent_total: z.number().nullable(),
    fat_mass_kg: z.number().nullable(),
    lean_mass_kg: z.number().nullable(),
    bone_mass_kg: z.number().nullable(),
    vat_area_cm2: z.number().nullable(),
    vat_mass_g: z.number().nullable(),
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

export type DexaScanExtraction = z.infer<typeof dexaScanExtractionSchema>;

export interface DexaScanExtractionResult {
  success: boolean;
  data?: DexaScanExtraction;
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
      name: "dexa_scan_extraction",
      strict: true,
      schema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["dexa_scan"] },
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
              scan_mode: { anyOf: [{ type: "string" }, { type: "null" }] },
            },
            required: ["study_date", "scanner_type", "scan_mode"],
            additionalProperties: false,
          },
          bone_density: {
            type: "object",
            properties: {
              spine_t_score: { anyOf: [{ type: "number" }, { type: "null" }] },
              spine_z_score: { anyOf: [{ type: "number" }, { type: "null" }] },
              total_hip_t_score: { anyOf: [{ type: "number" }, { type: "null" }] },
              total_hip_z_score: { anyOf: [{ type: "number" }, { type: "null" }] },
              femoral_neck_t_score: { anyOf: [{ type: "number" }, { type: "null" }] },
              femoral_neck_z_score: { anyOf: [{ type: "number" }, { type: "null" }] },
              who_classification: { anyOf: [{ type: "string" }, { type: "null" }] },
              fracture_risk_10yr: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
            required: [
              "spine_t_score",
              "spine_z_score",
              "total_hip_t_score",
              "total_hip_z_score",
              "femoral_neck_t_score",
              "femoral_neck_z_score",
              "who_classification",
              "fracture_risk_10yr",
            ],
            additionalProperties: false,
          },
          body_composition: {
            type: "object",
            properties: {
              fat_percent_total: { anyOf: [{ type: "number" }, { type: "null" }] },
              fat_mass_kg: { anyOf: [{ type: "number" }, { type: "null" }] },
              lean_mass_kg: { anyOf: [{ type: "number" }, { type: "null" }] },
              bone_mass_kg: { anyOf: [{ type: "number" }, { type: "null" }] },
              vat_area_cm2: { anyOf: [{ type: "number" }, { type: "null" }] },
              vat_mass_g: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
            required: [
              "fat_percent_total",
              "fat_mass_kg",
              "lean_mass_kg",
              "bone_mass_kg",
              "vat_area_cm2",
              "vat_mass_g",
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
          "bone_density",
          "body_composition",
          "interpretation",
          "quality",
        ],
        additionalProperties: false,
      },
    },
  };
}
