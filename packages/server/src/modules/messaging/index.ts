import { DrizzleMessagingRepository } from './messaging.repository';
import { MessagingService } from './messaging.service';

// Composition helper: assembles the messaging service from its repository.
export function buildMessagingService(): MessagingService {
  return new MessagingService(new DrizzleMessagingRepository());
}
