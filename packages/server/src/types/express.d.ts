import 'express';
import type { UserRole } from '@madrasty/shared';

// The principal attached by auth.middleware after verifying the access token.
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
      };
    }
  }
}
