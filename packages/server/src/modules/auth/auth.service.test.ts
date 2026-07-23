import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { verifyAccessToken, verifyRefreshToken } from './tokens';
import { HttpError } from '../../lib/http-error';
import {
  InMemoryRefreshTokenStore,
  InMemoryUserRepository,
} from '../../../test/fakes';

const validRegistration = {
  fullName: 'Amina Hassan',
  email: 'amina@example.com',
  phone: '01000000001',
  password: 'sup3rsecret',
  localePreference: 'ar',
};

describe('AuthService', () => {
  let users: InMemoryUserRepository;
  let store: InMemoryRefreshTokenStore;
  let service: AuthService;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    store = new InMemoryRefreshTokenStore();
    service = new AuthService(users, store);
  });

  describe('registerParent', () => {
    it('creates a parent account and never returns the password hash', async () => {
      const user = await service.registerParent(validRegistration);

      expect(user.id).toBeTruthy();
      expect(user.role).toBe('parent');
      expect(user.fullName).toBe('Amina Hassan');
      expect(user.email).toBe('amina@example.com');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('stores a hash, not the plaintext password', async () => {
      const user = await service.registerParent(validRegistration);
      const record = await users.findById(user.id);
      expect(record?.passwordHash).toBeTruthy();
      expect(record?.passwordHash).not.toBe(validRegistration.password);
    });

    it('rejects a duplicate email or phone', async () => {
      await service.registerParent(validRegistration);
      await expect(service.registerParent(validRegistration)).rejects.toMatchObject({
        statusCode: 409,
        code: 'account_exists',
      });
    });
  });

  describe('registerTeacher', () => {
    it('creates a teacher account with role teacher', async () => {
      const user = await service.registerTeacher({
        ...validRegistration,
        email: 'teacher@example.com',
        phone: '01000000002',
      });
      expect(user.role).toBe('teacher');
      expect(user).not.toHaveProperty('passwordHash');
    });

    it('a registered teacher can log in and gets a teacher-role token', async () => {
      await service.registerTeacher({
        ...validRegistration,
        email: 'teacher@example.com',
        phone: '01000000002',
      });
      const result = await service.login({
        identifier: 'teacher@example.com',
        password: validRegistration.password,
      });
      expect(verifyAccessToken(result.accessToken).role).toBe('teacher');
    });

    it('rejects a duplicate email or phone', async () => {
      await service.registerParent(validRegistration);
      await expect(service.registerTeacher(validRegistration)).rejects.toMatchObject({
        statusCode: 409,
        code: 'account_exists',
      });
    });
  });

  describe('changePassword', () => {
    it('changes the password when the current one is correct, and old password stops working', async () => {
      const user = await service.registerParent(validRegistration);
      await service.changePassword(user.id, {
        currentPassword: validRegistration.password,
        newPassword: 'brandNewPass1',
      });

      // Old password no longer works…
      await expect(
        service.login({ identifier: validRegistration.email, password: validRegistration.password }),
      ).rejects.toMatchObject({ code: 'invalid_credentials' });
      // …the new one does.
      const ok = await service.login({
        identifier: validRegistration.email,
        password: 'brandNewPass1',
      });
      expect(ok.user.id).toBe(user.id);
    });

    it('rejects a wrong current password', async () => {
      const user = await service.registerParent(validRegistration);
      await expect(
        service.changePassword(user.id, { currentPassword: 'wrong', newPassword: 'brandNewPass1' }),
      ).rejects.toMatchObject({ statusCode: 401, code: 'invalid_current_password' });
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.registerParent(validRegistration);
    });

    it('issues a valid access token and a distinct refresh token', async () => {
      const result = await service.login({
        identifier: validRegistration.email,
        password: validRegistration.password,
      });

      expect(result.user.email).toBe(validRegistration.email);
      const access = verifyAccessToken(result.accessToken);
      expect(access.sub).toBe(result.user.id);
      expect(access.role).toBe('parent');

      const refresh = verifyRefreshToken(result.refreshToken);
      expect(refresh.sub).toBe(result.user.id);
      // The refresh jti is registered as valid in the store.
      expect(await store.has(refresh.sub, refresh.jti)).toBe(true);
    });

    it('allows login by phone as well as email', async () => {
      const result = await service.login({
        identifier: validRegistration.phone,
        password: validRegistration.password,
      });
      expect(result.user.phone).toBe(validRegistration.phone);
    });

    it('rejects a wrong password with 401 invalid_credentials', async () => {
      await expect(
        service.login({ identifier: validRegistration.email, password: 'wrong' }),
      ).rejects.toMatchObject({ statusCode: 401, code: 'invalid_credentials' });
    });

    it('rejects an unknown user with the same generic error', async () => {
      await expect(
        service.login({ identifier: 'nobody@example.com', password: 'whatever' }),
      ).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('refresh', () => {
    it('rotates the refresh token and invalidates the old one', async () => {
      const login = await service.login(
        await register(service, validRegistration),
      );
      const first = login.refreshToken;
      const firstJti = verifyRefreshToken(first).jti;

      const rotated = await service.refresh(first);

      // New tokens issued.
      expect(rotated.refreshToken).not.toBe(first);
      const newJti = verifyRefreshToken(rotated.refreshToken).jti;
      expect(newJti).not.toBe(firstJti);

      // Old jti no longer valid; new jti is.
      expect(await store.has(login.user.id, firstJti)).toBe(false);
      expect(await store.has(login.user.id, newJti)).toBe(true);

      // Reusing the old (already-rotated) token is rejected.
      await expect(service.refresh(first)).rejects.toMatchObject({
        statusCode: 401,
        code: 'invalid_refresh_token',
      });
    });

    it('rejects a garbage refresh token', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toMatchObject({
        statusCode: 401,
        code: 'invalid_refresh_token',
      });
    });
  });

  describe('logout', () => {
    it('revokes the refresh token so it can no longer be used', async () => {
      const login = await service.login(
        await register(service, validRegistration),
      );
      const jti = verifyRefreshToken(login.refreshToken).jti;
      expect(await store.has(login.user.id, jti)).toBe(true);

      await service.logout(login.refreshToken);

      expect(await store.has(login.user.id, jti)).toBe(false);
      await expect(service.refresh(login.refreshToken)).rejects.toMatchObject({
        code: 'invalid_refresh_token',
      });
    });

    it('is a no-op (does not throw) when given no token', async () => {
      await expect(service.logout(undefined)).resolves.toBeUndefined();
    });
  });
});

// Registers, then returns login credentials for that account.
async function register(
  service: AuthService,
  reg: typeof validRegistration,
): Promise<{ identifier: string; password: string }> {
  await service.registerParent(reg);
  return { identifier: reg.email, password: reg.password };
}
