import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';
import { db as defaultDb, type Database } from '../../db/client';
import {
  enrollments,
  learningPrograms,
  parentChildren,
  studentProfiles,
  transactions,
} from '../../db/schema/index';
import type { PaymentProviderName, PurchasableType, TransactionStatus } from '@madrasty/shared';

export interface TransactionRecord {
  id: string;
  userId: string;
  beneficiaryId: string | null;
  purchasableType: string;
  purchasableId: string;
  amountEgp: string;
  currency: string;
  paymentProvider: string;
  providerReference: string | null;
  status: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ProgramForPurchase {
  id: string;
  teacherId: string;
  status: string;
  priceEgp: string | null;
}

export interface CreateTransactionInput {
  userId: string;
  beneficiaryId: string | null;
  purchasableType: PurchasableType;
  purchasableId: string;
  amountEgp: string;
  currency: string;
  provider: PaymentProviderName;
  metadata?: Record<string, unknown>;
}

function toRecord(row: typeof transactions.$inferSelect): TransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    beneficiaryId: row.beneficiaryId,
    purchasableType: row.purchasableType,
    purchasableId: row.purchasableId,
    amountEgp: row.amountEgp,
    currency: row.currency,
    paymentProvider: row.paymentProvider,
    providerReference: row.providerReference,
    status: row.status,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
  };
}

export interface PaymentsRepository {
  getPublishablyPurchasableProgram(programId: string): Promise<ProgramForPurchase | null>;
  isActiveStudent(studentId: string): Promise<boolean>;
  isApprovedChild(parentId: string, studentId: string): Promise<boolean>;
  hasActiveEnrollment(studentId: string, programId: string, now: Date): Promise<boolean>;
  createPending(input: CreateTransactionInput): Promise<TransactionRecord>;
  attachProviderReference(
    id: string,
    providerReference: string | null,
    metadataMerge: Record<string, unknown>,
  ): Promise<void>;
  findByProviderReference(
    provider: PaymentProviderName,
    providerReference: string,
  ): Promise<TransactionRecord | null>;
  getByIdForUser(id: string, userId: string): Promise<TransactionRecord | null>;
  // Idempotently settle a paid webhook: flips status → paid and grants the
  // enrollment, but only if the transaction isn't already paid. Returns true if
  // this call performed the settlement (false = it was already settled).
  settlePaidAndGrant(
    id: string,
    programId: string,
    studentId: string,
    webhookRaw: unknown,
  ): Promise<boolean>;
  markFailed(id: string, webhookRaw: unknown): Promise<void>;
}

export class DrizzlePaymentsRepository implements PaymentsRepository {
  constructor(private readonly db: Database = defaultDb) {}

  async getPublishablyPurchasableProgram(programId: string): Promise<ProgramForPurchase | null> {
    const rows = await this.db
      .select({
        id: learningPrograms.id,
        teacherId: learningPrograms.teacherId,
        status: learningPrograms.status,
        priceEgp: learningPrograms.priceEgp,
      })
      .from(learningPrograms)
      .where(and(eq(learningPrograms.id, programId), isNull(learningPrograms.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async isActiveStudent(studentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ status: studentProfiles.status })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, studentId))
      .limit(1);
    return rows[0]?.status === 'active';
  }

  async isApprovedChild(parentId: string, studentId: string): Promise<boolean> {
    const rows = await this.db
      .select({ approvedAt: parentChildren.approvedAt })
      .from(parentChildren)
      .where(and(eq(parentChildren.parentId, parentId), eq(parentChildren.studentId, studentId)))
      .limit(1);
    return rows[0]?.approvedAt != null;
  }

  async hasActiveEnrollment(studentId: string, programId: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentId, studentId),
          eq(enrollments.programId, programId),
          eq(enrollments.status, 'active'),
          or(isNull(enrollments.expiresAt), gt(enrollments.expiresAt, now)),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async createPending(input: CreateTransactionInput): Promise<TransactionRecord> {
    const [row] = await this.db
      .insert(transactions)
      .values({
        userId: input.userId,
        beneficiaryId: input.beneficiaryId,
        purchasableType: input.purchasableType,
        purchasableId: input.purchasableId,
        amountEgp: input.amountEgp,
        currency: input.currency,
        paymentProvider: input.provider,
        status: 'pending',
        metadata: input.metadata ?? {},
      })
      .returning();
    return toRecord(row);
  }

  async attachProviderReference(
    id: string,
    providerReference: string | null,
    metadataMerge: Record<string, unknown>,
  ): Promise<void> {
    const [current] = await this.db
      .select({ metadata: transactions.metadata })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    await this.db
      .update(transactions)
      .set({
        providerReference,
        metadata: { ...((current?.metadata ?? {}) as Record<string, unknown>), ...metadataMerge },
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));
  }

  async findByProviderReference(
    provider: PaymentProviderName,
    providerReference: string,
  ): Promise<TransactionRecord | null> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.paymentProvider, provider),
          eq(transactions.providerReference, providerReference),
        ),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async getByIdForUser(id: string, userId: string): Promise<TransactionRecord | null> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async settlePaidAndGrant(
    id: string,
    programId: string,
    studentId: string,
    webhookRaw: unknown,
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // Lock the transaction row so two concurrent webhook deliveries can't both
      // grant access (doc 04 §7 idempotency).
      const [current] = await tx
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .for('update')
        .limit(1);
      if (!current || current.status === 'paid') return false;

      const now = new Date();
      await tx
        .update(transactions)
        .set({
          status: 'paid',
          metadata: {
            ...((current.metadata ?? {}) as Record<string, unknown>),
            webhook: webhookRaw,
            paidAt: now.toISOString(),
          },
          updatedAt: now,
        })
        .where(eq(transactions.id, id));

      // Grant enrollment only if the student doesn't already hold an active one.
      const existing = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, studentId),
            eq(enrollments.programId, programId),
            eq(enrollments.status, 'active'),
            or(isNull(enrollments.expiresAt), gt(enrollments.expiresAt, now)),
          ),
        )
        .limit(1);
      if (existing.length === 0) {
        await tx.insert(enrollments).values({
          studentId,
          programId,
          source: 'purchase',
          metadata: { transactionId: id },
        });
      }
      return true;
    });
  }

  async markFailed(id: string, webhookRaw: unknown): Promise<void> {
    const [current] = await this.db
      .select({ status: transactions.status, metadata: transactions.metadata })
      .from(transactions)
      .where(eq(transactions.id, id))
      .limit(1);
    // Never overwrite a successful payment with a late 'failed' event.
    if (!current || current.status === 'paid') return;
    await this.db
      .update(transactions)
      .set({
        status: 'failed',
        metadata: {
          ...((current.metadata ?? {}) as Record<string, unknown>),
          webhook: webhookRaw,
        },
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, id));
  }
}
