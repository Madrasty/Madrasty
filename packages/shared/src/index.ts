// Shared type contract imported by BOTH client and server (see CLAUDE.md).
// Never duplicate these definitions on either side.

// --- Roles (mirrors the `user_role` DB enum, doc 03 / doc 11) ---
export const USER_ROLES = ['student', 'parent', 'teacher', 'admin', 'center_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'pending_verification'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// --- Public user shape (never carries password_hash) ---
export interface AuthUser {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  localePreference: string;
  status: UserStatus;
  verificationLevel: number;
}

// --- Auth request/response DTOs ---
export interface RegisterParentRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  localePreference?: string;
}

export interface RegisterParentResponse {
  user: AuthUser;
}

// Teacher self-registration — same fields as a parent; role is set server-side.
export interface RegisterTeacherRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  localePreference?: string;
}

export interface RegisterTeacherResponse {
  user: AuthUser;
}

// Authenticated password change (e.g. the seeded admin rotating the 0000 default).
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface LoginRequest {
  // A parent may sign in with either their email or their phone number.
  identifier: string;
  password: string;
}

// The refresh token is delivered ONLY via an httpOnly cookie, never in a body.
export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

// --- Registration DTOs (doc 11 features 5-7) ---
export type GuardianRelationship = 'father' | 'mother' | 'guardian' | 'other';

// Feature 5 — parent adds a student sub-profile.
export interface AddStudentRequest {
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  grade: string;
  school?: string;
  city?: string;
  relationship?: GuardianRelationship;
}

// Flow A: the student is created active under the already-verified guardian.
export interface AddStudentResponse {
  studentId: string;
  name: string;
  grade: string;
  status: 'active';
}

// Feature 6 — student-first self-registration.
export interface StudentSelfRegisterRequest {
  name: string;
  grade: string;
  parentMobile: string;
}

// Flow B: the student profile is created pending until a guardian approves.
export interface StudentSelfRegisterResponse {
  studentId: string;
  status: 'pending_approval';
}

// Feature 7 — what a parent sees when opening the approval link (no PII/token).
export interface GuardianApprovalView {
  student: { name: string | null; grade: string | null };
  status: 'awaiting_parent' | 'approved' | 'rejected' | 'expired';
  expiresAt: string | null;
}

// Feature 7 — the guardian supplies the OTP delivered to their phone to approve.
export interface GuardianApproveRequest {
  otp: string;
}

// Feature 7 — result of approving/rejecting an approval request.
export interface GuardianApprovalActionResponse {
  studentId?: string;
  status: 'approved' | 'rejected';
}

// Session — logout acknowledgement.
export interface LogoutResponse {
  success: boolean;
}

// --- Learning programs: content authoring & browsing (doc 12) ---
export const LESSON_TYPES = [
  'recorded',
  'live',
  'pdf',
  'audio',
  'quiz',
  'homework',
  'exam',
  'private_session',
] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const LESSON_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_VISIBILITIES = [
  'free',
  'paid',
  'locked',
  'prerequisite',
  'invite_only',
] as const;
export type LessonVisibility = (typeof LESSON_VISIBILITIES)[number];

export const PROGRAM_STATUSES = ['draft', 'pending_review', 'published', 'archived'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

// Localized text on the way in (only the provided locales are written).
export interface LocalizedInput {
  ar?: string;
  en?: string;
}

// A program with title/description resolved for the request locale.
export interface ProgramSummary {
  id: string;
  teacherId: string;
  subjectId: string | null;
  gradeLevel: string | null;
  semester: string | null;
  priceEgp: string | null;
  status: string;
  title: string | null;
  description: string | null;
}

// Authoring view (create/update/listMine) — summary plus owner-only metadata.
export interface AuthoredProgram extends ProgramSummary {
  metadata: Record<string, unknown>;
}

export interface ListMyProgramsResponse {
  programs: AuthoredProgram[];
}

export interface CreateProgramRequest {
  title?: LocalizedInput;
  description?: LocalizedInput;
  subjectId?: string;
  gradeLevel?: string;
  semester?: string;
  price?: number;
}

export interface CreateChapterRequest {
  title?: LocalizedInput;
  description?: LocalizedInput;
  orderIndex?: number;
}

export interface CreateLessonRequest {
  lessonType: LessonType;
  title?: LocalizedInput;
  description?: LocalizedInput;
  status?: LessonStatus;
  visibility?: LessonVisibility;
  orderIndex?: number;
  prerequisiteLessonId?: string;
  details?: Record<string, unknown>;
}

// A chapter in the program tree, title/description resolved for the locale.
export interface ChapterView {
  id: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  lessons: LessonView[];
}

// A lesson in the program tree; `locked`/`details` reflect the viewer's access.
export interface LessonView {
  id: string;
  lessonType: LessonType | string;
  status: string;
  visibility: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  locked: boolean;
  details: Record<string, unknown> | null;
}

export interface ProgramContentView extends ProgramSummary {
  chapters: ChapterView[];
}

// A newly created/updated chapter (authoring response).
export interface AuthoredChapter {
  id: string;
  programId: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
}

// A newly created/updated lesson (authoring response).
export interface AuthoredLesson {
  lesson: {
    id: string;
    chapterId: string;
    orderIndex: number;
    lessonType: LessonType | string;
    status: string;
    visibility: string;
    prerequisiteLessonId: string | null;
  };
  title: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Payments (doc 04). Adding a gateway = a new value here + a new provider class
// server-side — no other type change (doc 04 §1).
// ---------------------------------------------------------------------------
export const PAYMENT_PROVIDERS = [
  'paymob',
  'fawry',
  'vodafone_cash',
  'instapay',
  'stripe',
  'mock',
] as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDERS)[number];

export const PURCHASABLE_TYPES = [
  'learning_program',
  'subscription',
  'booking',
  'center_plan',
] as const;
export type PurchasableType = (typeof PURCHASABLE_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

// Start a checkout. The client sends WHAT to buy and for WHOM — never a price.
// The server recalculates the amount from its own records (doc 04 §3). A parent
// paying for a child sets `studentId` to the child; a student self-purchasing
// may omit it (defaults to self).
export interface CheckoutRequest {
  purchasableType: PurchasableType;
  purchasableId: string;
  studentId?: string;
  provider: PaymentProviderName;
  couponCode?: string;
  // Points to redeem for a discount (doc 05 §1). Validated + priced server-side;
  // the client never sends the discount amount, only how many points to spend.
  redeemPoints?: number;
}

// What the client needs to complete payment on the provider's hosted page. The
// shape is provider-agnostic: `redirectUrl` for a hosted page/iframe, plus the
// transaction id the client polls for the final (webhook-driven) status.
export interface CheckoutResult {
  transactionId: string;
  status: TransactionStatus;
  amountEgp: string;
  provider: PaymentProviderName;
  redirectUrl: string | null;
  providerReference: string | null;
}

// Read model for polling a transaction's status after redirect (doc 04 §3 — the
// UI shows success only once the server-verified status says `paid`).
export interface TransactionView {
  id: string;
  purchasableType: PurchasableType;
  purchasableId: string;
  amountEgp: string;
  currency: string;
  provider: PaymentProviderName;
  status: TransactionStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Admin governance (doc 09 — verify teachers, approve/reject programs). Every
// action is logged to admin_audit_log; admins govern, they don't silently edit.
// ---------------------------------------------------------------------------
export const TEACHER_VERIFICATION_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type TeacherVerificationStatus = (typeof TEACHER_VERIFICATION_STATUSES)[number];

// A teacher in the verification queue (admin view).
export interface PendingTeacher {
  userId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  verificationStatus: TeacherVerificationStatus;
  createdAt: string;
}

// A program in the approval queue (admin view), title resolved for the locale.
export interface PendingProgram {
  id: string;
  teacherId: string;
  teacherName: string | null;
  gradeLevel: string | null;
  priceEgp: string | null;
  status: ProgramStatus;
  title: string | null;
  description: string | null;
  submittedAt: string | null;
}

// A rejection carries a reason (persisted to the audit log + shown to the owner).
export interface RejectRequest {
  reason?: string;
}

export interface ListPendingTeachersResponse {
  teachers: PendingTeacher[];
}
export interface ListPendingProgramsResponse {
  programs: PendingProgram[];
}

// ---------------------------------------------------------------------------
// Loyalty: points, coupons, tiers (doc 05). Points live in an append-only ledger
// (balance = SUM(delta)); earn rules are data-driven; coupons + points discounts
// are ALWAYS applied server-side — a client-computed total is never trusted.
// ---------------------------------------------------------------------------

// points_ledger.reason values (doc 03). TEXT in the DB so campaigns/adjustments
// don't need a migration; zod validates writes against this set.
export const POINTS_REASONS = [
  'purchase', // earned on a completed purchase (positive)
  'redeem_reward', // spent at checkout (negative)
  'redeem_reversal', // spent points returned when a payment fails (positive)
  'coupon_bonus', // a free_points coupon award (positive)
  'referral', // referral reward (positive)
  'expiry', // scheduled expiry of old points (negative)
  'admin_adjustment', // manual admin correction (either sign)
] as const;
export type PointsReason = (typeof POINTS_REASONS)[number];

// earn_rules.trigger values (doc 05 §1).
export const EARN_TRIGGERS = [
  'purchase',
  'referral_signup',
  'program_completion',
  'quiz_streak',
] as const;
export type EarnTrigger = (typeof EARN_TRIGGERS)[number];

export const COUPON_DISCOUNT_TYPES = ['percentage', 'fixed_amount', 'free_points'] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

// A tier, its name resolved for the request locale (doc 05 §3).
export interface LoyaltyTierView {
  name: string | null;
  minPoints: number;
  perks: Record<string, unknown>;
}

// The student/parent loyalty snapshot (dashboard widget).
export interface LoyaltySummary {
  balance: number;
  lifetimePoints: number;
  currentTier: LoyaltyTierView | null;
  nextTier: LoyaltyTierView | null;
  pointsToNextTier: number | null;
  // Redemption config surfaced so the UI can show "100 pts = 10 EGP" transparently.
  redeemPointsPerEgp: number;
  minRedeemPoints: number;
}

// A transparent order summary: original → coupon → points → final (doc 05 §4).
// All monetary values are EGP strings (server is the source of truth).
export interface PriceBreakdown {
  originalEgp: string;
  couponDiscountEgp: string;
  pointsDiscountEgp: string;
  finalEgp: string;
  pointsRedeemed: number; // points actually applied to this order
  pointsToEarn: number; // points that WILL be credited once payment succeeds
  couponBonusPoints: number; // free_points coupon award, if any
  coupon: { code: string; discountType: CouponDiscountType } | null;
}

// Preview discounts without charging (checkout coupon field + "use my points").
export interface CheckoutQuoteRequest {
  purchasableType: PurchasableType;
  purchasableId: string;
  studentId?: string;
  couponCode?: string;
  redeemPoints?: number;
}

export interface CheckoutQuoteResult extends PriceBreakdown {
  couponValid: boolean;
  // i18n code when a coupon was supplied but rejected (e.g. 'coupon_expired').
  couponError: string | null;
}

// --- Admin coupon management (doc 05 §4) ---
export interface CreateCouponRequest {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  usageLimit?: number | null;
  usageLimitPerUser?: number;
  validFrom?: string;
  validUntil?: string | null;
  applicableTo?: { programs?: string[]; subjects?: string[]; minAmount?: number };
}

export interface CouponView {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: string;
  usageLimit: number | null;
  usageLimitPerUser: number;
  validFrom: string;
  validUntil: string | null;
  applicableTo: Record<string, unknown>;
  timesRedeemed: number;
  active: boolean;
  createdAt: string;
}

export interface ListCouponsResponse {
  coupons: CouponView[];
}

// Manual points correction — writes points_ledger reason='admin_adjustment' plus
// an admin_audit_log entry (doc 05 §4 — reason is mandatory).
export interface AdjustPointsRequest {
  userId: string;
  delta: number;
  reason: string;
}
