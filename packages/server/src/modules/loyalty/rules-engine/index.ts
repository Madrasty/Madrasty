import type { EarnTrigger } from '@madrasty/shared';

// The loyalty rules engine (doc 05 §1). Deliberately PURE and separate from
// points.service so *how* points are earned is data, not `if` branches: a campaign
// ("2x points on Math this week") is a new `earn_rules` row, never a code change.
//
// When several rules match one trigger, the HIGHEST-priority rule wins (it does
// not stack) — that is what makes "double points" mean 2x total, not 1x + 2x. Give
// a campaign a higher `priority` than the standing rule to have it override.

// Shapes of `earn_rules.points_formula` the engine understands. Add a new variant
// here (+ the switch below) to teach the engine a new formula kind.
export type PointsFormula =
  | { type: 'per_currency'; rate: number } // floor(amountEgp * rate); rate 0.1 = 1pt/10 EGP
  | { type: 'flat'; points: number }; // a fixed award regardless of amount

// Shape of `earn_rules.conditions` — all present keys must hold for the rule to apply.
export interface EarnRuleConditions {
  min_amount?: number;
  subjects?: string[];
  programs?: string[];
}

// A rule as loaded from the DB (JSONB columns arrive untyped).
export interface EarnRuleInput {
  id: string;
  trigger: string;
  pointsFormula: unknown;
  conditions: unknown;
  priority: number;
  activeFrom: Date;
  activeUntil: Date | null;
}

// Everything a rule might gate on, for one earn event.
export interface EarnContext {
  trigger: EarnTrigger;
  amountEgp?: number;
  subjectId?: string | null;
  programId?: string | null;
  at?: Date;
}

export interface EarnResult {
  points: number;
  ruleId: string | null; // which rule awarded the points (audit trail into ledger metadata)
}

function isActive(rule: EarnRuleInput, now: Date): boolean {
  if (rule.activeFrom.getTime() > now.getTime()) return false;
  if (rule.activeUntil && rule.activeUntil.getTime() <= now.getTime()) return false;
  return true;
}

function conditionsMatch(rawConditions: unknown, ctx: EarnContext): boolean {
  const c = (rawConditions ?? {}) as EarnRuleConditions;
  if (typeof c.min_amount === 'number' && (ctx.amountEgp ?? 0) < c.min_amount) return false;
  if (Array.isArray(c.subjects) && c.subjects.length > 0) {
    if (!ctx.subjectId || !c.subjects.includes(ctx.subjectId)) return false;
  }
  if (Array.isArray(c.programs) && c.programs.length > 0) {
    if (!ctx.programId || !c.programs.includes(ctx.programId)) return false;
  }
  return true;
}

function computePoints(rawFormula: unknown, ctx: EarnContext): number {
  const f = rawFormula as PointsFormula;
  switch (f?.type) {
    case 'per_currency':
      return Math.max(0, Math.floor((ctx.amountEgp ?? 0) * (f.rate ?? 0)));
    case 'flat':
      return Math.max(0, Math.floor(f.points ?? 0));
    default:
      return 0; // unknown formula kind → award nothing rather than guess
  }
}

// Evaluate all rules for a trigger and return the single winning award.
export function evaluateEarn(rules: EarnRuleInput[], ctx: EarnContext): EarnResult {
  const now = ctx.at ?? new Date();
  const matching = rules.filter(
    (r) => r.trigger === ctx.trigger && isActive(r, now) && conditionsMatch(r.conditions, ctx),
  );
  if (matching.length === 0) return { points: 0, ruleId: null };

  // Highest priority wins; ties broken by the most recently activated rule.
  matching.sort((a, b) =>
    b.priority !== a.priority
      ? b.priority - a.priority
      : b.activeFrom.getTime() - a.activeFrom.getTime(),
  );
  const winner = matching[0];
  return { points: computePoints(winner.pointsFormula, ctx), ruleId: winner.id };
}
