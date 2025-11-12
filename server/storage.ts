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
}

export const storage = new DatabaseStorage();
