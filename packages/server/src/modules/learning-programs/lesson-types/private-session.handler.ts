import { StubLessonHandler } from './stub.handler';

// Private-session lessons reuse `tutoring_slots`/`bookings` (doc 03).
export class PrivateSessionLessonHandler extends StubLessonHandler {
  constructor() {
    super('private_session', 'tutoring-booking module');
  }
}
