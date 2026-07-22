import Redis from 'ioredis';
import { config } from '../config/index';

// Single shared Redis connection for the app (refresh-token store, rate limits,
// future BullMQ). Connection string comes from the validated config — never a
// hardcoded host/port (see CLAUDE.md).
export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
});
