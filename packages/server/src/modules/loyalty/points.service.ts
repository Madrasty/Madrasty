import type { LoyaltySummary, LoyaltyTierView } from '@madrasty/shared';
import { config } from '../../config/index';
import type { LoyaltyRepository, TierRecord } from './loyalty.repository';

// Resolve a JSONB {ar,en} name for a locale, falling back to the default locale
// then any present value (mirrors resolveLocalizedText for translation-table text).
function resolveName(name: Record<string, unknown>, locale: string): string | null {
  const pick = (l: string) => (typeof name[l] === 'string' ? (name[l] as string) : null);
  return pick(locale) ?? pick(config.DEFAULT_LOCALE) ?? pick('en') ?? pick('ar') ?? null;
}

export interface TierProgress {
  current: TierRecord | null;
  next: TierRecord | null;
  pointsToNext: number | null;
}

// Pure tier derivation (doc 05 §3): tier is a function of LIFETIME points, so
// spending points never demotes. `tiers` must be sorted by minPoints ascending.
export function deriveTier(lifetimePoints: number, tiers: TierRecord[]): TierProgress {
  let current: TierRecord | null = null;
  let next: TierRecord | null = null;
  for (const tier of tiers) {
    if (lifetimePoints >= tier.minPoints) {
      current = tier;
    } else {
      next = tier;
      break;
    }
  }
  const pointsToNext = next ? Math.max(0, next.minPoints - lifetimePoints) : null;
  return { current, next, pointsToNext };
}

function toTierView(tier: TierRecord | null, locale: string): LoyaltyTierView | null {
  if (!tier) return null;
  return { name: resolveName(tier.name, locale), minPoints: tier.minPoints, perks: tier.perks };
}

// Points ledger reads + admin adjustment. The ledger is append-only: a balance is
// always SUM(delta), never a stored/mutated column (doc 03 ledger pattern).
export class PointsService {
  constructor(private readonly repo: LoyaltyRepository) {}

  getBalance(userId: string): Promise<number> {
    return this.repo.getBalance(userId);
  }

  async getSummary(userId: string, locale: string): Promise<LoyaltySummary> {
    const [balance, lifetimePoints, tiers, cfg] = await Promise.all([
      this.repo.getBalance(userId),
      this.repo.getLifetimePoints(userId),
      this.repo.getTiers(),
      this.repo.getPointsConfig(),
    ]);
    const { current, next, pointsToNext } = deriveTier(lifetimePoints, tiers);
    return {
      balance,
      lifetimePoints,
      currentTier: toTierView(current, locale),
      nextTier: toTierView(next, locale),
      pointsToNextTier: pointsToNext,
      redeemPointsPerEgp: cfg.redeemPointsPerEgp,
      minRedeemPoints: cfg.minRedeemPoints,
    };
  }

  // Manual admin correction (doc 05 §4). Writes an append-only ledger row; the
  // caller (admin service) is responsible for the admin_audit_log entry. Returns
  // the new balance. `note` is a mandatory human reason kept in ledger metadata.
  async adjustPoints(input: {
    userId: string;
    delta: number;
    note: string;
    actorId: string;
  }): Promise<number> {
    await this.repo.insertLedger({
      userId: input.userId,
      delta: input.delta,
      reason: 'admin_adjustment',
      metadata: { note: input.note, adjustedBy: input.actorId },
    });
    return this.repo.getBalance(input.userId);
  }
}
