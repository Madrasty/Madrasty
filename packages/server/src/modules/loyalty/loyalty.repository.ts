import { and, desc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  adminAuditLog,
  coupons,
  couponRedemptions,
  earnRules,
  learningPrograms,
  loyaltyTiers,
  pointsConfig,
  pointsLedger,
} from '../../db/schema/index';
import type { EarnRuleInput } from './rules-engine/index';

export interface LedgerEntry {
  userId: string;
  delta: number;
  reason: string;
  relatedTransactionId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PointsConfigRecord {
  redeemPointsPerEgp: number;
  minRedeemPoints: number;
  maxRedeemPercent: number;
}

export interface TierRecord {
  id: string;
  name: Record<string, unknown>;
  minPoints: number;
  perks: Record<string, unknown>;
}

export interface CouponRecord {
  id: string;
  code: string;
  discountType: string;
  discountValue: string;
  usageLimit: number | null;
  usageLimitPerUser: number;
  validFrom: Date;
  validUntil: Date | null;
  applicableTo: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface CouponWithCount extends CouponRecord {
  timesRedeemed: number;
}

export interface CreateCouponInput {
  code: string;
  discountType: string;
  discountValue: string;
  usageLimit: number | null;
  usageLimitPerUser: number;
  validFrom: Date;
  validUntil: Date | null;
  applicableTo: Record<string, unknown>;
}

export interface ProgramPurchaseInfo {
  status: string;
  priceEgp: string | null;
}

export interface AuditEntry {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

// Config-with-sane-defaults if the singleton row is somehow missing (fresh DB
// before seed). Keeps reads total so the pricing engine never throws.
const DEFAULT_POINTS_CONFIG: PointsConfigRecord = {
  redeemPointsPerEgp: 10,
  minRedeemPoints: 200,
  maxRedeemPercent: 100,
};

export interface LoyaltyRepository {
  withDb(db: Database): LoyaltyRepository;
  getActiveEarnRules(trigger: string, now: Date): Promise<EarnRuleInput[]>;
  getBalance(userId: string): Promise<number>;
  getLifetimePoints(userId: string): Promise<number>;
  insertLedger(entry: LedgerEntry): Promise<void>;
  getPointsConfig(): Promise<PointsConfigRecord>;
  getTiers(): Promise<TierRecord[]>;
  getProgramSubjectId(programId: string): Promise<string | null>;
  // Coupons
  findCouponByCode(code: string): Promise<CouponRecord | null>;
  getCouponById(id: string): Promise<CouponRecord | null>;
  countCouponRedemptions(couponId: string): Promise<number>;
  countCouponRedemptionsForUser(couponId: string, userId: string): Promise<number>;
  insertCouponRedemption(input: {
    couponId: string;
    userId: string;
    transactionId: string;
  }): Promise<void>;
  createCoupon(input: CreateCouponInput): Promise<CouponRecord>;
  listCouponsWithCounts(): Promise<CouponWithCount[]>;
  softDeleteCoupon(id: string): Promise<boolean>;
  getProgramPurchaseInfo(programId: string): Promise<ProgramPurchaseInfo | null>;
  writeAudit(entry: AuditEntry): Promise<void>;
}

export class DrizzleLoyaltyRepository implements LoyaltyRepository {
  constructor(private readonly db: Database = defaultDb) {}

  // Bind the repository to a transaction handle so loyalty writes commit
  // atomically with the payment settlement that triggers them.
  withDb(db: Database): LoyaltyRepository {
    return new DrizzleLoyaltyRepository(db);
  }

  async getActiveEarnRules(trigger: string, now: Date): Promise<EarnRuleInput[]> {
    const rows = await this.db
      .select()
      .from(earnRules)
      .where(
        and(
          eq(earnRules.trigger, trigger),
          lte(earnRules.activeFrom, now),
          or(isNull(earnRules.activeUntil), gt(earnRules.activeUntil, now)),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      trigger: r.trigger,
      pointsFormula: r.pointsFormula,
      conditions: r.conditions,
      priority: r.priority,
      activeFrom: r.activeFrom,
      activeUntil: r.activeUntil,
    }));
  }

  async getBalance(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${pointsLedger.delta}), 0)` })
      .from(pointsLedger)
      .where(eq(pointsLedger.userId, userId));
    return Number(row?.total ?? 0);
  }

  async getLifetimePoints(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${pointsLedger.delta}), 0)` })
      .from(pointsLedger)
      .where(and(eq(pointsLedger.userId, userId), gt(pointsLedger.delta, 0)));
    return Number(row?.total ?? 0);
  }

  async insertLedger(entry: LedgerEntry): Promise<void> {
    await this.db.insert(pointsLedger).values({
      userId: entry.userId,
      delta: entry.delta,
      reason: entry.reason,
      relatedTransactionId: entry.relatedTransactionId ?? null,
      metadata: entry.metadata ?? {},
    });
  }

  async getPointsConfig(): Promise<PointsConfigRecord> {
    const rows = await this.db.select().from(pointsConfig).limit(1);
    const row = rows[0];
    if (!row) return DEFAULT_POINTS_CONFIG;
    return {
      redeemPointsPerEgp: row.redeemPointsPerEgp,
      minRedeemPoints: row.minRedeemPoints,
      maxRedeemPercent: row.maxRedeemPercent,
    };
  }

  async getTiers(): Promise<TierRecord[]> {
    const rows = await this.db.select().from(loyaltyTiers).orderBy(loyaltyTiers.minPoints);
    return rows.map((r) => ({
      id: r.id,
      name: (r.name ?? {}) as Record<string, unknown>,
      minPoints: r.minPoints,
      perks: (r.perks ?? {}) as Record<string, unknown>,
    }));
  }

  async getProgramSubjectId(programId: string): Promise<string | null> {
    const rows = await this.db
      .select({ subjectId: learningPrograms.subjectId })
      .from(learningPrograms)
      .where(eq(learningPrograms.id, programId))
      .limit(1);
    return rows[0]?.subjectId ?? null;
  }

  async findCouponByCode(code: string): Promise<CouponRecord | null> {
    const rows = await this.db
      .select()
      .from(coupons)
      .where(and(eq(coupons.code, code), isNull(coupons.deletedAt)))
      .limit(1);
    return rows[0] ? toCoupon(rows[0]) : null;
  }

  async getCouponById(id: string): Promise<CouponRecord | null> {
    const rows = await this.db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    return rows[0] ? toCoupon(rows[0]) : null;
  }

  async countCouponRedemptions(couponId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<string>`COUNT(*)` })
      .from(couponRedemptions)
      .where(eq(couponRedemptions.couponId, couponId));
    return Number(row?.count ?? 0);
  }

  async countCouponRedemptionsForUser(couponId: string, userId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<string>`COUNT(*)` })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, couponId), eq(couponRedemptions.userId, userId)));
    return Number(row?.count ?? 0);
  }

  async insertCouponRedemption(input: {
    couponId: string;
    userId: string;
    transactionId: string;
  }): Promise<void> {
    await this.db
      .insert(couponRedemptions)
      .values(input)
      .onConflictDoNothing({ target: [couponRedemptions.couponId, couponRedemptions.transactionId] });
  }

  async createCoupon(input: CreateCouponInput): Promise<CouponRecord> {
    const [row] = await this.db
      .insert(coupons)
      .values({
        code: input.code,
        discountType: input.discountType,
        discountValue: input.discountValue,
        usageLimit: input.usageLimit,
        usageLimitPerUser: input.usageLimitPerUser,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        applicableTo: input.applicableTo,
      })
      .returning();
    return toCoupon(row);
  }

  async listCouponsWithCounts(): Promise<CouponWithCount[]> {
    const rows = await this.db
      .select({
        coupon: coupons,
        timesRedeemed: sql<string>`COUNT(${couponRedemptions.id})`,
      })
      .from(coupons)
      .leftJoin(couponRedemptions, eq(couponRedemptions.couponId, coupons.id))
      .where(isNull(coupons.deletedAt))
      .groupBy(coupons.id)
      .orderBy(desc(coupons.createdAt));
    return rows.map((r) => ({ ...toCoupon(r.coupon), timesRedeemed: Number(r.timesRedeemed ?? 0) }));
  }

  async softDeleteCoupon(id: string): Promise<boolean> {
    const rows = await this.db
      .update(coupons)
      .set({ deletedAt: new Date() })
      .where(and(eq(coupons.id, id), isNull(coupons.deletedAt)))
      .returning({ id: coupons.id });
    return rows.length > 0;
  }

  async getProgramPurchaseInfo(programId: string): Promise<ProgramPurchaseInfo | null> {
    const rows = await this.db
      .select({ status: learningPrograms.status, priceEgp: learningPrograms.priceEgp })
      .from(learningPrograms)
      .where(and(eq(learningPrograms.id, programId), isNull(learningPrograms.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async writeAudit(entry: AuditEntry): Promise<void> {
    await this.db.insert(adminAuditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
    });
  }
}

function toCoupon(row: typeof coupons.$inferSelect): CouponRecord {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    usageLimit: row.usageLimit,
    usageLimitPerUser: row.usageLimitPerUser,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
    applicableTo: (row.applicableTo ?? {}) as Record<string, unknown>,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}
