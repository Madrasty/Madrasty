import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateEarn, type EarnRuleInput } from './rules-engine/index';
import { computeBreakdown } from './pricing';
import { deriveTier } from './points.service';
import { CouponService } from './coupon.service';
import { LoyaltyService } from './loyalty.service';
import type { PointsService } from './points.service';
import type {
  AuditEntry,
  CouponRecord,
  CouponWithCount,
  CreateCouponInput,
  LedgerEntry,
  LoyaltyRepository,
  PointsConfigRecord,
  ProgramPurchaseInfo,
  TierRecord,
} from './loyalty.repository';

const DEFAULT_CONFIG: PointsConfigRecord = {
  redeemPointsPerEgp: 10,
  minRedeemPoints: 200,
  maxRedeemPercent: 100,
};

const TIERS: TierRecord[] = [
  { id: 'b', name: { en: 'Bronze' }, minPoints: 0, perks: {} },
  { id: 's', name: { en: 'Silver' }, minPoints: 1000, perks: {} },
  { id: 'g', name: { en: 'Gold' }, minPoints: 5000, perks: {} },
  { id: 'p', name: { en: 'Platinum' }, minPoints: 15000, perks: {} },
];

function rule(overrides: Partial<EarnRuleInput> = {}): EarnRuleInput {
  return {
    id: 'r1',
    trigger: 'purchase',
    pointsFormula: { type: 'per_currency', rate: 0.1 },
    conditions: {},
    priority: 0,
    activeFrom: new Date('2020-01-01'),
    activeUntil: null,
    ...overrides,
  };
}

describe('rules-engine — evaluateEarn', () => {
  it('awards floor(amount * rate) for per_currency (1 pt / 10 EGP)', () => {
    expect(evaluateEarn([rule()], { trigger: 'purchase', amountEgp: 155 }).points).toBe(15);
  });

  it('awards a flat amount regardless of price', () => {
    const r = rule({ pointsFormula: { type: 'flat', points: 100 } });
    expect(evaluateEarn([r], { trigger: 'purchase', amountEgp: 5 }).points).toBe(100);
  });

  it('a higher-priority campaign overrides (2x total, not stacked)', () => {
    const standard = rule({ id: 'std', priority: 0, pointsFormula: { type: 'per_currency', rate: 0.1 } });
    const campaign = rule({ id: 'camp', priority: 10, pointsFormula: { type: 'per_currency', rate: 0.2 } });
    const result = evaluateEarn([standard, campaign], { trigger: 'purchase', amountEgp: 100 });
    expect(result.points).toBe(20); // 0.2 wins, not 0.1 + 0.2 = 30
    expect(result.ruleId).toBe('camp');
  });

  it('skips a rule whose min_amount is not met', () => {
    const r = rule({ conditions: { min_amount: 200 } });
    expect(evaluateEarn([r], { trigger: 'purchase', amountEgp: 150 }).points).toBe(0);
  });

  it('honours a subject condition', () => {
    const r = rule({ conditions: { subjects: ['math'] }, pointsFormula: { type: 'flat', points: 50 } });
    expect(evaluateEarn([r], { trigger: 'purchase', amountEgp: 1, subjectId: 'math' }).points).toBe(50);
    expect(evaluateEarn([r], { trigger: 'purchase', amountEgp: 1, subjectId: 'sci' }).points).toBe(0);
  });

  it('ignores an expired campaign window', () => {
    const r = rule({ activeUntil: new Date('2021-01-01') });
    const at = new Date('2022-01-01');
    expect(evaluateEarn([r], { trigger: 'purchase', amountEgp: 100, at }).points).toBe(0);
  });
});

describe('points.service — deriveTier (from lifetime points)', () => {
  it('places a new user in Bronze with Silver next', () => {
    const t = deriveTier(0, TIERS);
    expect(t.current?.id).toBe('b');
    expect(t.next?.id).toBe('s');
    expect(t.pointsToNext).toBe(1000);
  });

  it('places 6000 lifetime in Gold with Platinum next', () => {
    const t = deriveTier(6000, TIERS);
    expect(t.current?.id).toBe('g');
    expect(t.next?.id).toBe('p');
    expect(t.pointsToNext).toBe(9000);
  });

  it('tops out at Platinum with no next tier', () => {
    const t = deriveTier(20000, TIERS);
    expect(t.current?.id).toBe('p');
    expect(t.next).toBeNull();
    expect(t.pointsToNext).toBeNull();
  });
});

describe('pricing — computeBreakdown (original → coupon → points → final)', () => {
  const base = {
    amountEgp: 150,
    coupon: null,
    requestedRedeemPoints: 0,
    balance: 0,
    config: DEFAULT_CONFIG,
    earnRules: [rule()],
    subjectId: null,
    programId: 'p1',
  };

  it('charges list price and previews earned points when no discounts apply', () => {
    const b = computeBreakdown(base);
    expect(b.finalEgp).toBe('150.00');
    expect(b.pointsToEarn).toBe(15);
    expect(b.pointsRedeemed).toBe(0);
  });

  it('applies a percentage coupon before points', () => {
    const b = computeBreakdown({
      ...base,
      coupon: { code: 'X', discountType: 'percentage', discountEgp: 30, bonusPoints: 0 },
    });
    expect(b.couponDiscountEgp).toBe('30.00');
    expect(b.finalEgp).toBe('120.00');
    expect(b.pointsToEarn).toBe(12); // earned on the 120 actually paid
  });

  it('redeems points to EGP at the configured ratio', () => {
    const b = computeBreakdown({ ...base, requestedRedeemPoints: 300, balance: 500 });
    expect(b.pointsRedeemed).toBe(300);
    expect(b.pointsDiscountEgp).toBe('30.00'); // 300 / 10
    expect(b.finalEgp).toBe('120.00');
  });

  it('ignores a redemption below the minimum threshold', () => {
    const b = computeBreakdown({ ...base, requestedRedeemPoints: 100, balance: 500 });
    expect(b.pointsRedeemed).toBe(0);
    expect(b.finalEgp).toBe('150.00');
  });

  it('clamps redemption to the available balance', () => {
    const b = computeBreakdown({ ...base, requestedRedeemPoints: 1000, balance: 250 });
    expect(b.pointsRedeemed).toBe(250);
    expect(b.pointsDiscountEgp).toBe('25.00');
  });

  it('caps points discount to max-percent of the order', () => {
    const b = computeBreakdown({
      ...base,
      amountEgp: 100,
      requestedRedeemPoints: 100000,
      balance: 100000,
      config: { ...DEFAULT_CONFIG, maxRedeemPercent: 50 },
    });
    expect(b.pointsDiscountEgp).toBe('50.00'); // 50% of 100
    expect(b.pointsRedeemed).toBe(500); // 50 EGP * 10 pts/EGP
    expect(b.finalEgp).toBe('50.00');
  });

  it('lets a full coupon zero the total', () => {
    const b = computeBreakdown({
      ...base,
      coupon: { code: 'FULL', discountType: 'fixed_amount', discountEgp: 150, bonusPoints: 0 },
    });
    expect(b.finalEgp).toBe('0.00');
    expect(b.pointsToEarn).toBe(0);
  });

  it('surfaces a free_points coupon bonus without changing price', () => {
    const b = computeBreakdown({
      ...base,
      coupon: { code: 'LAUNCH', discountType: 'free_points', discountEgp: 0, bonusPoints: 100 },
    });
    expect(b.finalEgp).toBe('150.00');
    expect(b.couponBonusPoints).toBe(100);
  });
});

// --- Fake repository for coupon + service tests ---
class FakeLoyaltyRepo implements LoyaltyRepository {
  coupons = new Map<string, CouponRecord>();
  redemptions: Array<{ couponId: string; userId: string; transactionId: string }> = [];
  ledger: LedgerEntry[] = [];
  audits: AuditEntry[] = [];
  balances = new Map<string, number>();
  programs = new Map<string, ProgramPurchaseInfo & { subjectId: string | null }>();
  rules: EarnRuleInput[] = [rule()];

  withDb() {
    return this;
  }
  async getActiveEarnRules() {
    return this.rules;
  }
  async getBalance(userId: string) {
    return this.balances.get(userId) ?? 0;
  }
  async getLifetimePoints(userId: string) {
    return this.balances.get(userId) ?? 0;
  }
  async insertLedger(entry: LedgerEntry) {
    this.ledger.push(entry);
  }
  async getPointsConfig() {
    return DEFAULT_CONFIG;
  }
  async getTiers() {
    return TIERS;
  }
  async getProgramSubjectId(programId: string) {
    return this.programs.get(programId)?.subjectId ?? null;
  }
  async findCouponByCode(code: string) {
    return [...this.coupons.values()].find((c) => c.code === code && !c.deletedAt) ?? null;
  }
  async getCouponById(id: string) {
    return this.coupons.get(id) ?? null;
  }
  async countCouponRedemptions(couponId: string) {
    return this.redemptions.filter((r) => r.couponId === couponId).length;
  }
  async countCouponRedemptionsForUser(couponId: string, userId: string) {
    return this.redemptions.filter((r) => r.couponId === couponId && r.userId === userId).length;
  }
  async insertCouponRedemption(input: { couponId: string; userId: string; transactionId: string }) {
    this.redemptions.push(input);
  }
  async createCoupon(input: CreateCouponInput): Promise<CouponRecord> {
    const coupon: CouponRecord = {
      id: `c-${this.coupons.size + 1}`,
      code: input.code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      usageLimit: input.usageLimit,
      usageLimitPerUser: input.usageLimitPerUser,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      applicableTo: input.applicableTo,
      metadata: {},
      createdAt: new Date(),
      deletedAt: null,
    };
    this.coupons.set(coupon.id, coupon);
    return coupon;
  }
  async listCouponsWithCounts(): Promise<CouponWithCount[]> {
    return [...this.coupons.values()]
      .filter((c) => !c.deletedAt)
      .map((c) => ({ ...c, timesRedeemed: this.redemptions.filter((r) => r.couponId === c.id).length }));
  }
  async softDeleteCoupon(id: string) {
    const c = this.coupons.get(id);
    if (!c || c.deletedAt) return false;
    c.deletedAt = new Date();
    return true;
  }
  async getProgramPurchaseInfo(programId: string) {
    const p = this.programs.get(programId);
    return p ? { status: p.status, priceEgp: p.priceEgp } : null;
  }
  async writeAudit(entry: AuditEntry) {
    this.audits.push(entry);
  }

  // test helper
  seedCoupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
    const c: CouponRecord = {
      id: overrides.id ?? `c-${this.coupons.size + 1}`,
      code: overrides.code ?? 'SAVE20',
      discountType: overrides.discountType ?? 'percentage',
      discountValue: overrides.discountValue ?? '20',
      usageLimit: overrides.usageLimit ?? null,
      usageLimitPerUser: overrides.usageLimitPerUser ?? 1,
      validFrom: overrides.validFrom ?? new Date('2020-01-01'),
      validUntil: overrides.validUntil ?? null,
      applicableTo: overrides.applicableTo ?? {},
      metadata: {},
      createdAt: new Date(),
      deletedAt: overrides.deletedAt ?? null,
    };
    this.coupons.set(c.id, c);
    return c;
  }
}

describe('coupon.service — validation + discount (doc 05 §2)', () => {
  let repo: FakeLoyaltyRepo;
  let coupons: CouponService;
  const ctx = { userId: 'u1', programId: 'p1', subjectId: null, amountEgp: 150 };

  beforeEach(() => {
    repo = new FakeLoyaltyRepo();
    coupons = new CouponService(repo);
  });

  it('rejects an unknown code', async () => {
    expect(await coupons.evaluate('NOPE', ctx)).toMatchObject({ valid: false, error: 'coupon_not_found' });
  });

  it('normalizes case when matching', async () => {
    repo.seedCoupon({ code: 'SAVE20' });
    const r = await coupons.evaluate('save20', ctx);
    expect(r.valid).toBe(true);
  });

  it('rejects an expired coupon', async () => {
    repo.seedCoupon({ validUntil: new Date('2021-01-01') });
    expect(await coupons.evaluate('SAVE20', ctx)).toMatchObject({ error: 'coupon_expired' });
  });

  it('enforces the global usage limit', async () => {
    const c = repo.seedCoupon({ usageLimit: 1 });
    repo.redemptions.push({ couponId: c.id, userId: 'other', transactionId: 't' });
    expect(await coupons.evaluate('SAVE20', ctx)).toMatchObject({ error: 'coupon_usage_exceeded' });
  });

  it('enforces the per-user usage limit', async () => {
    const c = repo.seedCoupon({ usageLimitPerUser: 1 });
    repo.redemptions.push({ couponId: c.id, userId: 'u1', transactionId: 't' });
    expect(await coupons.evaluate('SAVE20', ctx)).toMatchObject({ error: 'coupon_user_limit' });
  });

  it('rejects when the program is not in applicable_to', async () => {
    repo.seedCoupon({ applicableTo: { programs: ['other-prog'] } });
    expect(await coupons.evaluate('SAVE20', ctx)).toMatchObject({ error: 'coupon_not_applicable' });
  });

  it('rejects below a minimum spend', async () => {
    repo.seedCoupon({ applicableTo: { min_amount: 500 } });
    expect(await coupons.evaluate('SAVE20', ctx)).toMatchObject({ error: 'coupon_min_amount' });
  });

  it('computes a percentage discount', async () => {
    repo.seedCoupon({ discountType: 'percentage', discountValue: '20' });
    const r = await coupons.evaluate('SAVE20', ctx);
    expect(r).toMatchObject({ valid: true, discountEgp: 30, bonusPoints: 0 });
  });

  it('caps a fixed discount at the price', async () => {
    repo.seedCoupon({ code: 'BIG', discountType: 'fixed_amount', discountValue: '999' });
    const r = await coupons.evaluate('BIG', ctx);
    expect(r).toMatchObject({ valid: true, discountEgp: 150 });
  });

  it('grants bonus points for a free_points coupon', async () => {
    repo.seedCoupon({ code: 'LAUNCH', discountType: 'free_points', discountValue: '100' });
    const r = await coupons.evaluate('LAUNCH', ctx);
    expect(r).toMatchObject({ valid: true, discountEgp: 0, bonusPoints: 100 });
  });
});

describe('LoyaltyService — quote + admin', () => {
  let repo: FakeLoyaltyRepo;
  let service: LoyaltyService;

  beforeEach(() => {
    repo = new FakeLoyaltyRepo();
    repo.programs.set('p1', { status: 'published', priceEgp: '150.00', subjectId: 'math' });
    service = new LoyaltyService(repo, new CouponService(repo), {
      // Only adjustPoints is exercised through the service in these tests; the
      // summary path is covered by deriveTier above.
      adjustPoints: async ({ userId, delta }: { userId: string; delta: number }) =>
        (repo.balances.set(userId, (repo.balances.get(userId) ?? 0) + delta),
        repo.balances.get(userId)!),
    } as unknown as PointsService);
  });

  const quoteReq = { purchasableType: 'learning_program' as const, purchasableId: 'p1' };

  it('quotes list price with earned points for a plain purchase', async () => {
    const q = await service.quoteForProgram({ id: 'u1' }, quoteReq);
    expect(q.finalEgp).toBe('150.00');
    expect(q.pointsToEarn).toBe(15);
    expect(q.couponValid).toBe(false);
  });

  it('applies a valid coupon in the quote', async () => {
    repo.seedCoupon({ code: 'SAVE20', discountType: 'percentage', discountValue: '20' });
    const q = await service.quoteForProgram({ id: 'u1' }, { ...quoteReq, couponCode: 'SAVE20' });
    expect(q.couponValid).toBe(true);
    expect(q.finalEgp).toBe('120.00');
  });

  it('reports an invalid coupon without failing the quote', async () => {
    const q = await service.quoteForProgram({ id: 'u1' }, { ...quoteReq, couponCode: 'GHOST' });
    expect(q.couponValid).toBe(false);
    expect(q.couponError).toBe('coupon_not_found');
    expect(q.finalEgp).toBe('150.00');
  });

  it('rejects a quote for a non-published program', async () => {
    repo.programs.set('p1', { status: 'draft', priceEgp: '150.00', subjectId: null });
    await expect(service.quoteForProgram({ id: 'u1' }, quoteReq)).rejects.toMatchObject({
      code: 'program_not_purchasable',
    });
  });

  it('creates a coupon and writes an audit entry', async () => {
    const view = await service.createCoupon('admin-1', {
      code: 'welcome50',
      discountType: 'fixed_amount',
      discountValue: 50,
    });
    expect(view.code).toBe('WELCOME50');
    expect(repo.audits).toContainEqual(expect.objectContaining({ action: 'coupon.create' }));
  });

  it('rejects a percentage coupon above 100', async () => {
    await expect(
      service.createCoupon('admin-1', { code: 'X', discountType: 'percentage', discountValue: 150 }),
    ).rejects.toMatchObject({ code: 'invalid_discount_value' });
  });

  it('rejects a duplicate coupon code', async () => {
    repo.seedCoupon({ code: 'DUP' });
    await expect(
      service.createCoupon('admin-1', { code: 'dup', discountType: 'fixed_amount', discountValue: 10 }),
    ).rejects.toMatchObject({ code: 'coupon_code_taken' });
  });

  it('adjusts points with a mandatory reason + audit', async () => {
    const r = await service.adjustPoints('admin-1', { userId: 'u1', delta: 500, reason: 'goodwill' });
    expect(r.balance).toBe(500);
    expect(repo.audits).toContainEqual(expect.objectContaining({ action: 'points.adjust' }));
  });

  it('rejects a points adjustment with no reason', async () => {
    await expect(
      service.adjustPoints('admin-1', { userId: 'u1', delta: 500, reason: '  ' }),
    ).rejects.toMatchObject({ code: 'reason_required' });
  });
});
