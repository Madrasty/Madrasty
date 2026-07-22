import type Redis from 'ioredis';

// Tracks which refresh-token ids (jti) are currently valid. Rotation works by
// removing the old jti and adding a new one on every refresh; logout removes it.
// A refresh token whose jti is absent here is treated as revoked/reused.
export interface RefreshTokenStore {
  add(userId: string, jti: string, ttlSeconds: number): Promise<void>;
  has(userId: string, jti: string): Promise<boolean>;
  remove(userId: string, jti: string): Promise<void>;
}

const key = (userId: string, jti: string) => `refresh:${userId}:${jti}`;

// Redis-backed store used by the running app. Each valid jti is a key with a TTL
// equal to the token's remaining lifetime, so expired tokens self-evict.
export class RedisRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly redis: Redis) {}

  async add(userId: string, jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key(userId, jti), '1', 'EX', Math.max(1, ttlSeconds));
  }

  async has(userId: string, jti: string): Promise<boolean> {
    return (await this.redis.exists(key(userId, jti))) === 1;
  }

  async remove(userId: string, jti: string): Promise<void> {
    await this.redis.del(key(userId, jti));
  }
}
