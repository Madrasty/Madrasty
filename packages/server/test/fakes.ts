import { randomUUID } from 'node:crypto';
import type {
  CreateParentInput,
  UserRecord,
  UserRepository,
} from '../src/modules/auth/auth.repository';
import type { RefreshTokenStore } from '../src/modules/auth/refresh-store';

// In-memory UserRepository — same contract as the Drizzle one, no Postgres.
export class InMemoryUserRepository implements UserRepository {
  private byId = new Map<string, UserRecord>();

  async findById(id: string): Promise<UserRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdentifier(identifier: string): Promise<UserRecord | null> {
    for (const rec of this.byId.values()) {
      if (rec.email === identifier || rec.phone === identifier) return rec;
    }
    return null;
  }

  async existsByEmailOrPhone(email: string, phone: string): Promise<boolean> {
    for (const rec of this.byId.values()) {
      if (rec.email === email || rec.phone === phone) return true;
    }
    return false;
  }

  async createParent(input: CreateParentInput): Promise<UserRecord> {
    const record: UserRecord = {
      id: randomUUID(),
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      role: 'parent',
      localePreference: input.localePreference,
      status: 'active',
      verificationLevel: 1,
    };
    this.byId.set(record.id, record);
    return record;
  }

  // Test helper.
  setStatus(id: string, status: UserRecord['status']): void {
    const rec = this.byId.get(id);
    if (rec) rec.status = status;
  }
}

// In-memory RefreshTokenStore mirroring the Redis key-per-jti model.
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private valid = new Set<string>();
  private key = (userId: string, jti: string) => `${userId}:${jti}`;

  async add(userId: string, jti: string): Promise<void> {
    this.valid.add(this.key(userId, jti));
  }

  async has(userId: string, jti: string): Promise<boolean> {
    return this.valid.has(this.key(userId, jti));
  }

  async remove(userId: string, jti: string): Promise<void> {
    this.valid.delete(this.key(userId, jti));
  }

  get size(): number {
    return this.valid.size;
  }
}
