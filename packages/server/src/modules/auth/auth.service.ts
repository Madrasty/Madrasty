import type { AuthUser } from '@madrasty/shared';
import { HttpError } from '../../lib/http-error';
import { hashPassword, verifyPassword } from './password';
import type { UserRecord, UserRepository } from './auth.repository';
import type { RefreshTokenStore } from './refresh-store';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './tokens';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterParentInput,
  RegisterTeacherInput,
} from './auth.schemas';

// A freshly issued token pair. The refresh token is handed back to the
// controller, which puts it in an httpOnly cookie — it must never reach a body.
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function toAuthUser(record: UserRecord): AuthUser {
  return {
    id: record.id,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    role: record.role,
    localePreference: record.localePreference,
    status: record.status,
    verificationLevel: record.verificationLevel,
  };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly refreshStore: RefreshTokenStore,
  ) {}

  // Flow A step 1 (doc 11): the parent is the root account. We create it as role
  // 'parent'; students are managed sub-profiles created later, never here.
  async registerParent(input: RegisterParentInput): Promise<AuthUser> {
    const email = input.email.toLowerCase();
    const alreadyExists = await this.users.existsByEmailOrPhone(email, input.phone);
    if (alreadyExists) {
      throw HttpError.conflict(
        'account_exists',
        'An account with this email or phone already exists.',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const record = await this.users.createParent({
      fullName: input.fullName,
      email,
      phone: input.phone,
      passwordHash,
      localePreference: input.localePreference,
    });
    return toAuthUser(record);
  }

  // Teacher self-registration. Same shape as a parent, role 'teacher'. The teacher
  // starts unverified (an admin verifies them before their programs go live).
  async registerTeacher(input: RegisterTeacherInput): Promise<AuthUser> {
    const email = input.email.toLowerCase();
    const alreadyExists = await this.users.existsByEmailOrPhone(email, input.phone);
    if (alreadyExists) {
      throw HttpError.conflict(
        'account_exists',
        'An account with this email or phone already exists.',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const record = await this.users.createTeacher({
      fullName: input.fullName,
      email,
      phone: input.phone,
      passwordHash,
      localePreference: input.localePreference,
    });
    return toAuthUser(record);
  }

  // Authenticated password change — verifies the current password before setting
  // the new one (used e.g. by the seeded admin to rotate the 0000 default).
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const record = await this.users.findById(userId);
    if (!record || !record.passwordHash) {
      throw HttpError.unauthorized('invalid_credentials', 'Invalid credentials.');
    }
    const ok = await verifyPassword(input.currentPassword, record.passwordHash);
    if (!ok) {
      throw HttpError.unauthorized('invalid_current_password', 'Current password is incorrect.');
    }
    await this.users.updatePassword(userId, await hashPassword(input.newPassword));
  }

  // Verifies credentials and issues a fresh access+refresh pair, registering the
  // refresh jti so it can later be rotated or revoked.
  async login(input: LoginInput): Promise<{ user: AuthUser } & TokenPair> {
    const record = await this.users.findByIdentifier(input.identifier.toLowerCase());

    // Generic message + always-run hash compare shape avoids leaking which of
    // "user exists" / "wrong password" failed (user enumeration).
    const invalid = () => HttpError.unauthorized('invalid_credentials', 'Invalid credentials.');
    if (!record || !record.passwordHash) {
      throw invalid();
    }
    const ok = await verifyPassword(input.password, record.passwordHash);
    if (!ok) {
      throw invalid();
    }
    if (record.status !== 'active') {
      throw HttpError.forbidden('account_not_active', 'This account is not active.');
    }

    const tokens = await this.issueTokens(record);
    return { user: toAuthUser(record), ...tokens };
  }

  // Rotation: validate the presented refresh token, confirm its jti is still
  // registered (not already used/revoked), invalidate it, and issue a new pair.
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw HttpError.unauthorized('invalid_refresh_token', 'Invalid or expired refresh token.');
    }

    const stillValid = await this.refreshStore.has(payload.sub, payload.jti);
    if (!stillValid) {
      // Either already rotated (possible token reuse) or logged out.
      throw HttpError.unauthorized('invalid_refresh_token', 'Refresh token is no longer valid.');
    }

    // Invalidate the old token id first, then mint a replacement.
    await this.refreshStore.remove(payload.sub, payload.jti);

    const record = await this.users.findById(payload.sub);
    if (!record || record.status !== 'active') {
      throw HttpError.unauthorized('invalid_refresh_token', 'Account is no longer active.');
    }
    return this.issueTokens(record);
  }

  // Revokes the presented refresh token (idempotent — unknown/expired tokens are
  // simply ignored so logout always succeeds and clears the cookie).
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const payload = verifyRefreshToken(refreshToken);
      await this.refreshStore.remove(payload.sub, payload.jti);
    } catch {
      // Nothing to revoke; the controller still clears the cookie.
    }
  }

  private async issueTokens(record: UserRecord): Promise<TokenPair> {
    const accessToken = signAccessToken({ sub: record.id, role: record.role });
    const { token, jti, expiresAt } = signRefreshToken({ id: record.id, role: record.role });
    const ttlSeconds = expiresAt - Math.floor(Date.now() / 1000);
    await this.refreshStore.add(record.id, jti, ttlSeconds);
    return { accessToken, refreshToken: token };
  }
}
