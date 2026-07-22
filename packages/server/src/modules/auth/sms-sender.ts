// Abstraction over the SMS gateway so the registration flow never talks to a
// provider SDK directly (same instinct as the payment provider interface).
export interface SmsSender {
  send(to: string, message: string): Promise<void>;
}

// MVP stub: no real SMS is sent yet — the message (which carries the OTP code and
// the approval link) is logged so it can be read from the server logs in dev.
export class LoggingSmsSender implements SmsSender {
  async send(to: string, message: string): Promise<void> {
    console.log(`[SMS stub] → ${to}: ${message}`);
  }
}
