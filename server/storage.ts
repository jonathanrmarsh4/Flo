// Reference: javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  profiles,
  bloodWorkRecords,
  analysisResults,
  billingCustomers,
  subscriptions,
  payments,
  auditLogs,
  biomarkers,
  biomarkerSynonyms,
  biomarkerUnits,
  biomarkerReferenceRanges,
  biomarkerTestSessions,
  biomarkerMeasurements,
  biomarkerInsights,
  type User,
  type UpsertUser,
  type Profile,
  type InsertProfile,
  type UpdateDemographics,
  type UpdateHealthBaseline,
  type UpdateGoals,
  type UpdateAIPersonalization,
  type BloodWorkRecord,
  type InsertBloodWorkRecord,
  type AnalysisResult,
  type InsertAnalysisResult,
  type UpdateUser,
  type BillingCustomer,
  type Subscription,
  type Payment,
  type AuditLog,
  type Biomarker,
  type BiomarkerSynonym,
  type BiomarkerUnit,
  type BiomarkerReferenceRange,
  type BiomarkerTestSession,
  type BiomarkerMeasurement,
  type InsertBiomarkerTestSession,
  type InsertBiomarkerMeasurement,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, or, ilike, and, sql } from "drizzle-orm";

// Interface for storage operations
export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Profile operations
  getProfile(userId: string): Promise<Profile | undefined>;
  upsertProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile>;
  updateDemographics(userId: string, data: UpdateDemographics): Promise<Profile>;
  updateHealthBaseline(userId: string, data: UpdateHealthBaseline): Promise<Profile>;
  updateGoals(userId: string, data: UpdateGoals): Promise<Profile>;
  updateAIPersonalization(userId: string, data: UpdateAIPersonalization): Promise<Profile>;
  
  // Blood work operations
  createBloodWorkRecord(record: InsertBloodWorkRecord): Promise<BloodWorkRecord>;
  getBloodWorkRecord(id: string): Promise<BloodWorkRecord | undefined>;
  getBloodWorkRecordsByUser(userId: string): Promise<BloodWorkRecord[]>;
  getLatestBloodWorkRecord(userId: string): Promise<BloodWorkRecord | undefined>;
  updateBloodWorkRecordStatus(id: string, status: string): Promise<void>;
  
  // Analysis operations
  createAnalysisResult(analysis: InsertAnalysisResult): Promise<AnalysisResult>;
  getAnalysisResultByRecordId(recordId: string): Promise<AnalysisResult | undefined>;
  
  // Admin operations
  listUsers(params: { query?: string; role?: string; status?: string; limit?: number; offset?: number }): Promise<{ users: User[]; total: number }>;
  updateUser(userId: string, data: UpdateUser, adminId: string): Promise<User | null>;
  
  // Billing operations
  getBillingInfo(userId: string): Promise<{ customer?: BillingCustomer; subscription?: Subscription; lastPayment?: Payment }>;
  createAuditLog(log: { adminId: string; targetUserId?: string; action: string; changes?: any; actionMetadata?: any }): Promise<void>;
  
  // Biomarker operations
  getBiomarkers(): Promise<Biomarker[]>;
  getBiomarkerBySynonym(name: string): Promise<{ biomarker: Biomarker; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] } | null>;
  getUnitConversions(biomarkerId: string): Promise<BiomarkerUnit[]>;
  getReferenceRanges(biomarkerId: string): Promise<BiomarkerReferenceRange[]>;
  getAllBiomarkerData(): Promise<{ biomarkers: Biomarker[]; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] }>;
  
  // Biomarker measurements operations
  createTestSession(session: InsertBiomarkerTestSession): Promise<BiomarkerTestSession>;
  createMeasurement(measurement: InsertBiomarkerMeasurement): Promise<BiomarkerMeasurement>;
  createMeasurementWithSession(params: {
    userId: string;
    biomarkerId: string;
    value: number;
    unit: string;
    testDate: Date;
    valueCanonical: number;
    unitCanonical: string;
    valueDisplay: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    flags: string[];
    warnings: string[];
    normalizationContext: any;
  }): Promise<{ session: BiomarkerTestSession; measurement: BiomarkerMeasurement }>;
  getTestSessionsByUser(userId: string): Promise<BiomarkerTestSession[]>;
  getMeasurementsBySession(sessionId: string): Promise<BiomarkerMeasurement[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Profile operations
  async getProfile(userId: string): Promise<Profile | undefined> {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));
    return profile;
  }

  async upsertProfile(userId: string, data: Partial<InsertProfile>): Promise<Profile> {
    const [profile] = await db
      .insert(profiles)
      .values({
        userId,
        ...data,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return profile;
  }

  async updateDemographics(userId: string, data: UpdateDemographics): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  async updateHealthBaseline(userId: string, data: UpdateHealthBaseline): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  async updateGoals(userId: string, data: UpdateGoals): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  async updateAIPersonalization(userId: string, data: UpdateAIPersonalization): Promise<Profile> {
    return await this.upsertProfile(userId, data);
  }

  // Blood work operations
  async createBloodWorkRecord(record: InsertBloodWorkRecord): Promise<BloodWorkRecord> {
    const [created] = await db
      .insert(bloodWorkRecords)
      .values(record)
      .returning();
    return created;
  }

  async getBloodWorkRecord(id: string): Promise<BloodWorkRecord | undefined> {
    const [record] = await db
      .select()
      .from(bloodWorkRecords)
      .where(eq(bloodWorkRecords.id, id));
    return record;
  }

  async getBloodWorkRecordsByUser(userId: string): Promise<BloodWorkRecord[]> {
    return await db
      .select()
      .from(bloodWorkRecords)
      .where(eq(bloodWorkRecords.userId, userId))
      .orderBy(desc(bloodWorkRecords.uploadedAt));
  }

  async getLatestBloodWorkRecord(userId: string): Promise<BloodWorkRecord | undefined> {
    const [record] = await db
      .select()
      .from(bloodWorkRecords)
      .where(eq(bloodWorkRecords.userId, userId))
      .orderBy(desc(bloodWorkRecords.uploadedAt))
      .limit(1);
    return record;
  }

  async updateBloodWorkRecordStatus(id: string, status: string): Promise<void> {
    await db
      .update(bloodWorkRecords)
      .set({ status })
      .where(eq(bloodWorkRecords.id, id));
  }

  // Analysis operations
  async createAnalysisResult(analysis: InsertAnalysisResult): Promise<AnalysisResult> {
    const [created] = await db
      .insert(analysisResults)
      .values(analysis)
      .returning();
    return created;
  }

  async getAnalysisResultByRecordId(recordId: string): Promise<AnalysisResult | undefined> {
    const [result] = await db
      .select()
      .from(analysisResults)
      .where(eq(analysisResults.recordId, recordId));
    return result;
  }

  // Admin operations
  async listUsers(params: { query?: string; role?: string; status?: string; limit?: number; offset?: number }): Promise<{ users: User[]; total: number }> {
    const { query = '', role, status, limit = 50, offset = 0 } = params;
    
    const conditions = [];
    
    if (query) {
      conditions.push(
        or(
          ilike(users.email, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`)
        )
      );
    }
    
    if (role) {
      conditions.push(eq(users.role, role as any));
    }
    
    if (status) {
      conditions.push(eq(users.status, status as any));
    }
    
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const usersList = await db
      .select()
      .from(users)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(users.createdAt));
    
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(whereClause);
    
    return {
      users: usersList,
      total: Number(countResult?.count || 0),
    };
  }

  async updateUser(userId: string, data: UpdateUser, adminId: string): Promise<User | null> {
    const updateData: any = { updatedAt: new Date() };
    if (data.role !== undefined) {
      updateData.role = data.role;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();
    
    if (!user) {
      return null;
    }
    
    await this.createAuditLog({
      adminId,
      targetUserId: userId,
      action: 'update_user',
      changes: data,
      actionMetadata: { role: data.role, status: data.status },
    });
    
    return user;
  }

  // Billing operations
  async getBillingInfo(userId: string): Promise<{ customer?: BillingCustomer; subscription?: Subscription; lastPayment?: Payment }> {
    const [customer] = await db
      .select()
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId));
    
    if (!customer) {
      return {};
    }
    
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, customer.id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    
    const [lastPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.customerId, customer.id))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    
    return {
      customer,
      subscription,
      lastPayment,
    };
  }

  async createAuditLog(log: { adminId: string; targetUserId?: string; action: string; changes?: any; actionMetadata?: any }): Promise<void> {
    await db.insert(auditLogs).values({
      adminId: log.adminId,
      targetUserId: log.targetUserId,
      action: log.action,
      changes: log.changes,
      actionMetadata: log.actionMetadata,
    });
  }

  // Biomarker operations
  async getBiomarkers(): Promise<Biomarker[]> {
    return await db.select().from(biomarkers);
  }

  async getBiomarkerBySynonym(name: string): Promise<{ biomarker: Biomarker; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] } | null> {
    // Import the normalization function
    const { resolveBiomarker, BiomarkerNotFoundError } = await import("@shared/domain/biomarkers");
    
    // Get all biomarkers and synonyms
    const allBiomarkers = await this.getBiomarkers();
    const allSynonyms = await db.select().from(biomarkerSynonyms);
    
    // Resolve the biomarker (throws BiomarkerNotFoundError if not found)
    let biomarker;
    try {
      biomarker = resolveBiomarker(name, allBiomarkers, allSynonyms);
    } catch (error) {
      if (error instanceof BiomarkerNotFoundError) {
        return null;
      }
      throw error;
    }
    
    // Get all related data for this biomarker
    const [synonyms, units, ranges] = await Promise.all([
      db.select().from(biomarkerSynonyms).where(eq(biomarkerSynonyms.biomarkerId, biomarker.id)),
      db.select().from(biomarkerUnits).where(eq(biomarkerUnits.biomarkerId, biomarker.id)),
      db.select().from(biomarkerReferenceRanges).where(eq(biomarkerReferenceRanges.biomarkerId, biomarker.id)),
    ]);
    
    return {
      biomarker,
      synonyms,
      units,
      ranges,
    };
  }

  async getUnitConversions(biomarkerId: string): Promise<BiomarkerUnit[]> {
    return await db
      .select()
      .from(biomarkerUnits)
      .where(eq(biomarkerUnits.biomarkerId, biomarkerId));
  }

  async getReferenceRanges(biomarkerId: string): Promise<BiomarkerReferenceRange[]> {
    return await db
      .select()
      .from(biomarkerReferenceRanges)
      .where(eq(biomarkerReferenceRanges.biomarkerId, biomarkerId));
  }

  async getAllBiomarkerData(): Promise<{ biomarkers: Biomarker[]; synonyms: BiomarkerSynonym[]; units: BiomarkerUnit[]; ranges: BiomarkerReferenceRange[] }> {
    const [biomarkersData, synonyms, units, ranges] = await Promise.all([
      db.select().from(biomarkers),
      db.select().from(biomarkerSynonyms),
      db.select().from(biomarkerUnits),
      db.select().from(biomarkerReferenceRanges),
    ]);
    
    return {
      biomarkers: biomarkersData,
      synonyms,
      units,
      ranges,
    };
  }

  async createTestSession(session: InsertBiomarkerTestSession): Promise<BiomarkerTestSession> {
    const [newSession] = await db
      .insert(biomarkerTestSessions)
      .values(session)
      .returning();
    return newSession;
  }

  async createMeasurement(measurement: InsertBiomarkerMeasurement): Promise<BiomarkerMeasurement> {
    const [newMeasurement] = await db
      .insert(biomarkerMeasurements)
      .values(measurement)
      .returning();
    return newMeasurement;
  }

  async getTestSessionsByUser(userId: string): Promise<BiomarkerTestSession[]> {
    return await db
      .select()
      .from(biomarkerTestSessions)
      .where(eq(biomarkerTestSessions.userId, userId))
      .orderBy(desc(biomarkerTestSessions.testDate));
  }

  async getMeasurementsBySession(sessionId: string): Promise<BiomarkerMeasurement[]> {
    return await db
      .select()
      .from(biomarkerMeasurements)
      .where(eq(biomarkerMeasurements.sessionId, sessionId));
  }

  async createMeasurementWithSession(params: {
    userId: string;
    biomarkerId: string;
    value: number;
    unit: string;
    testDate: Date;
    valueCanonical: number;
    unitCanonical: string;
    valueDisplay: string;
    referenceLow: number | null;
    referenceHigh: number | null;
    flags: string[];
    warnings: string[];
    normalizationContext: any;
  }): Promise<{ session: BiomarkerTestSession; measurement: BiomarkerMeasurement }> {
    return await db.transaction(async (tx) => {
      const testDateStart = new Date(params.testDate);
      testDateStart.setHours(0, 0, 0, 0);
      const testDateEnd = new Date(params.testDate);
      testDateEnd.setHours(23, 59, 59, 999);

      const [existingSession] = await tx
        .select()
        .from(biomarkerTestSessions)
        .where(
          and(
            eq(biomarkerTestSessions.userId, params.userId),
            eq(biomarkerTestSessions.source, "manual"),
            sql`${biomarkerTestSessions.testDate} >= ${testDateStart}`,
            sql`${biomarkerTestSessions.testDate} <= ${testDateEnd}`
          )
        )
        .orderBy(desc(biomarkerTestSessions.createdAt))
        .limit(1);

      let session: BiomarkerTestSession;
      if (existingSession) {
        session = existingSession;
      } else {
        const [newSession] = await tx
          .insert(biomarkerTestSessions)
          .values({
            userId: params.userId,
            source: "manual",
            testDate: params.testDate,
          })
          .returning();
        session = newSession;
      }

      const [measurement] = await tx
        .insert(biomarkerMeasurements)
        .values({
          sessionId: session.id,
          biomarkerId: params.biomarkerId,
          valueRaw: params.value,
          unitRaw: params.unit,
          valueCanonical: params.valueCanonical,
          unitCanonical: params.unitCanonical,
          valueDisplay: params.valueDisplay,
          referenceLow: params.referenceLow,
          referenceHigh: params.referenceHigh,
          flags: params.flags,
          warnings: params.warnings,
          normalizationContext: params.normalizationContext,
        })
        .returning();

      return { session, measurement };
    });
  }

  async getLatestMeasurementForBiomarker(userId: string, biomarkerId: string, measurementId?: string): Promise<BiomarkerMeasurement | null> {
    if (measurementId) {
      const [measurement] = await db
        .select()
        .from(biomarkerMeasurements)
        .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
        .where(
          and(
            eq(biomarkerMeasurements.id, measurementId),
            eq(biomarkerTestSessions.userId, userId),
            eq(biomarkerMeasurements.biomarkerId, biomarkerId)
          )
        )
        .limit(1);
      return measurement?.biomarker_measurements || null;
    }

    const [measurement] = await db
      .select()
      .from(biomarkerMeasurements)
      .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
      .where(
        and(
          eq(biomarkerTestSessions.userId, userId),
          eq(biomarkerMeasurements.biomarkerId, biomarkerId)
        )
      )
      .orderBy(desc(biomarkerTestSessions.testDate))
      .limit(1);
    return measurement?.biomarker_measurements || null;
  }

  async getMeasurementHistory(userId: string, biomarkerId: string, limit: number = 5): Promise<BiomarkerMeasurement[]> {
    const measurements = await db
      .select()
      .from(biomarkerMeasurements)
      .innerJoin(biomarkerTestSessions, eq(biomarkerMeasurements.sessionId, biomarkerTestSessions.id))
      .where(
        and(
          eq(biomarkerTestSessions.userId, userId),
          eq(biomarkerMeasurements.biomarkerId, biomarkerId)
        )
      )
      .orderBy(desc(biomarkerTestSessions.testDate))
      .limit(limit);
    return measurements.map(m => m.biomarker_measurements);
  }

  async getCachedBiomarkerInsights(userId: string, biomarkerId: string, measurementSignature: string) {
    const [insights] = await db
      .select()
      .from(biomarkerInsights)
      .where(
        and(
          eq(biomarkerInsights.userId, userId),
          eq(biomarkerInsights.biomarkerId, biomarkerId),
          eq(biomarkerInsights.measurementSignature, measurementSignature)
        )
      )
      .limit(1);
    return insights || null;
  }

  async getLatestCachedInsights(userId: string, biomarkerId: string) {
    const [insights] = await db
      .select()
      .from(biomarkerInsights)
      .where(
        and(
          eq(biomarkerInsights.userId, userId),
          eq(biomarkerInsights.biomarkerId, biomarkerId)
        )
      )
      .orderBy(desc(biomarkerInsights.generatedAt))
      .limit(1);
    return insights || null;
  }

  async saveBiomarkerInsights(params: {
    userId: string;
    biomarkerId: string;
    measurementSignature: string;
    profileSnapshot: any;
    measurementSummary: any;
    lifestyleActions: string[];
    nutrition: string[];
    supplementation: string[];
    medicalReferral: string | null;
    medicalUrgency: string;
    model: string;
    expiresAt: Date;
  }) {
    const [insights] = await db
      .insert(biomarkerInsights)
      .values(params)
      .onConflictDoUpdate({
        target: [biomarkerInsights.userId, biomarkerInsights.biomarkerId, biomarkerInsights.measurementSignature],
        set: {
          profileSnapshot: params.profileSnapshot,
          measurementSummary: params.measurementSummary,
          lifestyleActions: params.lifestyleActions,
          nutrition: params.nutrition,
          supplementation: params.supplementation,
          medicalReferral: params.medicalReferral,
          medicalUrgency: params.medicalUrgency,
          model: params.model,
          expiresAt: params.expiresAt,
          generatedAt: sql`NOW()`,
        },
      })
      .returning();
    return insights;
  }
}

export const storage = new DatabaseStorage();
