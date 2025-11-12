import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Admin & Billing enums
export const userRoleEnum = pgEnum("user_role", ["free", "premium", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const billingProviderEnum = pgEnum("billing_provider", ["stripe"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid"
]);

// Profile enums
export const sexEnum = pgEnum("sex", ["Male", "Female", "Other"]);
export const weightUnitEnum = pgEnum("weight_unit", ["kg", "lbs"]);
export const heightUnitEnum = pgEnum("height_unit", ["cm", "inches"]);
export const activityLevelEnum = pgEnum("activity_level", ["Sedentary", "Light", "Moderate", "Active", "Very Active"]);
export const dietTypeEnum = pgEnum("diet_type", ["Balanced", "Low Carb", "Mediterranean", "Vegetarian", "Vegan", "Keto", "Paleo"]);
export const smokingStatusEnum = pgEnum("smoking_status", ["Never", "Former", "Current"]);
export const alcoholIntakeEnum = pgEnum("alcohol_intake", ["None", "Occasional", "Moderate", "Heavy"]);
export const communicationToneEnum = pgEnum("communication_tone", ["Casual", "Professional", "Scientific"]);
export const insightsFrequencyEnum = pgEnum("insights_frequency", ["Daily", "Weekly", "Bi-weekly", "Monthly"]);

// Zod enums for validation and UI options
export const UserRoleEnum = z.enum(["free", "premium", "admin"]);
export const UserStatusEnum = z.enum(["active", "suspended"]);
export const SubscriptionStatusEnum = z.enum([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid"
]);

export const SexEnum = z.enum(["Male", "Female", "Other"]);
export const WeightUnitEnum = z.enum(["kg", "lbs"]);
export const HeightUnitEnum = z.enum(["cm", "inches"]);
export const ActivityLevelEnum = z.enum(["Sedentary", "Light", "Moderate", "Active", "Very Active"]);
export const DietTypeEnum = z.enum(["Balanced", "Low Carb", "Mediterranean", "Vegetarian", "Vegan", "Keto", "Paleo"]);
export const SmokingStatusEnum = z.enum(["Never", "Former", "Current"]);
export const AlcoholIntakeEnum = z.enum(["None", "Occasional", "Moderate", "Heavy"]);
export const CommunicationToneEnum = z.enum(["Casual", "Professional", "Scientific"]);
export const InsightsFrequencyEnum = z.enum(["Daily", "Weekly", "Bi-weekly", "Monthly"]);

export const HealthGoalEnum = z.enum([
  "Longevity",
  "Performance",
  "Prevention",
  "Weight Management",
  "Cardiovascular Health",
  "Metabolic Optimization",
  "Cognitive Health"
]);

export const FocusAreaEnum = z.enum([
  "Heart Health",
  "Inflammation",
  "Metabolic Health",
  "Liver Function",
  "Kidney Function",
  "Hormones",
  "Nutrition",
  "Immunity"
]);

// Health baseline schema (for JSONB validation)
export const healthBaselineSchema = z.object({
  activityLevel: ActivityLevelEnum.optional(),
  sleepHours: z.number().min(0).max(24).optional(),
  dietType: DietTypeEnum.optional(),
  smokingStatus: SmokingStatusEnum.optional(),
  alcoholIntake: AlcoholIntakeEnum.optional(),
});

// AI personalization schema (for JSONB validation)
export const aiPersonalizationSchema = z.object({
  tone: CommunicationToneEnum.optional(),
  insightsFrequency: InsightsFrequencyEnum.optional(),
  focusAreas: z.array(FocusAreaEnum).optional(),
});

// Session storage table (required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (required for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: userRoleEnum("role").default("free").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User health profiles table (1:1 with users)
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  
  // Demographics (queryable columns)
  dateOfBirth: timestamp("date_of_birth", { mode: "date" }),
  sex: sexEnum("sex"),
  weight: real("weight"),
  weightUnit: weightUnitEnum("weight_unit").default("kg"),
  height: real("height"),
  heightUnit: heightUnitEnum("height_unit").default("cm"),
  
  // Health goals (array column)
  goals: text("goals").array(),
  
  // Health & Lifestyle Baseline (JSONB for flexibility)
  healthBaseline: jsonb("health_baseline").$type<z.infer<typeof healthBaselineSchema>>(),
  
  // AI Personalization (JSONB for flexibility)
  aiPersonalization: jsonb("ai_personalization").$type<z.infer<typeof aiPersonalizationSchema>>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Blood work records table
export const bloodWorkRecords = pgTable("blood_work_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

// AI analysis results table - Enhanced with Guardrails v1 and Upload Design v1.0
export const analysisResults = pgTable("analysis_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordId: varchar("record_id").notNull().references(() => bloodWorkRecords.id, { onDelete: "cascade" }),
  
  // Basic age fields (backward compatible)
  biologicalAge: text("biological_age"),
  chronologicalAge: text("chronological_age"),
  
  // Legacy fields (kept for backward compatibility)
  insights: jsonb("insights"),
  metrics: jsonb("metrics"),
  recommendations: jsonb("recommendations"),
  
  // New structured Report schema fields
  source: jsonb("source"), // { vendor_name, file_sha256, pages, extraction_method, ocr_mean_confidence }
  specimen: jsonb("specimen"), // { type: "BLOOD", fasting_status: "FASTING|NON_FASTING|UNKNOWN" }
  collectionDate: timestamp("collection_date"),
  reportedDate: timestamp("reported_date"),
  panels: jsonb("panels"), // Array of panel objects with observations
  derived: jsonb("derived"), // { calculations, trends }
  summary: jsonb("summary"), // { title, key_findings, top_priorities, limitations }
  validation: jsonb("validation"), // { errors, warnings, suggested_actions }
  confidence: jsonb("confidence"), // { overall, components: { ocr_quality, parser_confidence, etc } }
  schemaVersion: text("schema_version").default("1.0"),
  
  createdAt: timestamp("created_at").defaultNow(),
});

// Billing customers table (links users to Stripe)
export const billingCustomers = pgTable("billing_customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  provider: billingProviderEnum("provider").default("stripe").notNull(),
  stripeCustomerId: varchar("stripe_customer_id").unique(),
  countryCode: varchar("country_code", { length: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "cascade" }),
  stripeSubscriptionId: varchar("stripe_subscription_id").unique(),
  stripePriceId: varchar("stripe_price_id"),
  status: subscriptionStatusEnum("status").notNull(),
  currentPeriodStart: timestamp("current_period_start"),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: text("cancel_at_period_end").default("false"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table (for Apple Pay metadata)
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => billingCustomers.id, { onDelete: "cascade" }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id").unique(),
  amount: integer("amount").notNull(),
  currency: varchar("currency", { length: 3 }).default("usd"),
  status: text("status").notNull(),
  paymentMethod: text("payment_method"),
  last4: varchar("last4", { length: 4 }),
  brand: varchar("brand"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Audit log table for admin actions
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  targetUserId: varchar("target_user_id").references(() => users.id),
  action: text("action").notNull(),
  changes: jsonb("changes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  bloodWorkRecords: many(bloodWorkRecords),
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));

export const bloodWorkRecordsRelations = relations(bloodWorkRecords, ({ one }) => ({
  user: one(users, {
    fields: [bloodWorkRecords.userId],
    references: [users.id],
  }),
  analysis: one(analysisResults, {
    fields: [bloodWorkRecords.id],
    references: [analysisResults.recordId],
  }),
}));

export const analysisResultsRelations = relations(analysisResults, ({ one }) => ({
  record: one(bloodWorkRecords, {
    fields: [analysisResults.recordId],
    references: [bloodWorkRecords.id],
  }),
}));

// Types and schemas
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Profile schemas
export const insertProfileSchema = createInsertSchema(profiles, {
  dateOfBirth: z.date().optional(),
  sex: SexEnum.optional(),
  weight: z.number().min(0).optional(),
  weightUnit: WeightUnitEnum.optional(),
  height: z.number().min(0).optional(),
  heightUnit: HeightUnitEnum.optional(),
  goals: z.array(HealthGoalEnum).optional(),
  healthBaseline: healthBaselineSchema.optional(),
  aiPersonalization: aiPersonalizationSchema.optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Section-specific update schemas
export const updateDemographicsSchema = z.object({
  dateOfBirth: z.date().optional(),
  sex: SexEnum.optional(),
  weight: z.number().min(0).optional(),
  weightUnit: WeightUnitEnum.optional(),
  height: z.number().min(0).optional(),
  heightUnit: HeightUnitEnum.optional(),
});

export const updateHealthBaselineSchema = z.object({
  healthBaseline: healthBaselineSchema,
});

export const updateGoalsSchema = z.object({
  goals: z.array(HealthGoalEnum),
});

export const updateAIPersonalizationSchema = z.object({
  aiPersonalization: aiPersonalizationSchema,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type UpdateDemographics = z.infer<typeof updateDemographicsSchema>;
export type UpdateHealthBaseline = z.infer<typeof updateHealthBaselineSchema>;
export type UpdateGoals = z.infer<typeof updateGoalsSchema>;
export type UpdateAIPersonalization = z.infer<typeof updateAIPersonalizationSchema>;

export const insertBloodWorkRecordSchema = createInsertSchema(bloodWorkRecords).omit({
  id: true,
  createdAt: true,
  uploadedAt: true,
});
export type InsertBloodWorkRecord = z.infer<typeof insertBloodWorkRecordSchema>;
export type BloodWorkRecord = typeof bloodWorkRecords.$inferSelect;

export const insertAnalysisResultSchema = createInsertSchema(analysisResults).omit({
  id: true,
  createdAt: true,
});
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AnalysisResult = typeof analysisResults.$inferSelect;

// Admin schemas
export const updateUserRoleSchema = z.object({
  role: UserRoleEnum,
});

export const updateUserStatusSchema = z.object({
  status: UserStatusEnum,
});

export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;
export type UpdateUserStatus = z.infer<typeof updateUserStatusSchema>;
export type BillingCustomer = typeof billingCustomers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
