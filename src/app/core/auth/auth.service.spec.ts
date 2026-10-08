import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../config';
import { TAIGA_SESSION_ID } from '../http/session-id.token';
import { authSessionInterceptor } from '../http/auth-session.interceptor';
import { AuthService } from './auth.service';
import { AUTH_STORAGE, AuthTokenStorage } from './auth-token.storage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('AuthService', () => {
  let httpTesting: HttpTestingController;
  let service: AuthService;
  let storage: MemoryStorage;
  let tokenStorage: AuthTokenStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authSessionInterceptor])),
        provideHttpClientTesting(),
        { provide: AUTH_STORAGE, useValue: storage },
        { provide: TAIGA_SESSION_ID, useValue: 'test-session' },
        {
          provide: RuntimeConfigService,
          useValue: {
            snapshot: () => ({ defaultLanguage: 'en' }),
            resolveApiPath: (path: string) => `/api/v1/${path}`,
            isApiRequest: (url: string) =>
              new URL(url, 'http://localhost/').pathname.startsWith('/api/v1/'),
            isApiEndpoint: (url: string, path: string) =>
              new URL(url, 'http://localhost/').pathname.replace(/\/+$/, '') ===
              `/api/v1/${path}`.replace(/\/+$/, ''),
          },
        },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthService);
    tokenStorage = TestBed.inject(AuthTokenStorage);
  });

  afterEach(() => httpTesting.verify());

  it('logs in using the stable API contract and stores tokens separately from the user', async () => {
    const result = firstValueFrom(service.login({ username: 'ada', password: 'secret' }));
    const request = httpTesting.expectOne('/api/v1/auth');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ username: 'ada', password: 'secret', type: 'normal' });
    request.flush({
      id: 7,
      username: 'ada',
      full_name_display: 'Ada Lovelace',
      photo: null,
      auth_token: 'access-token',
      refresh: 'refresh-token',
    });

    await expect(result).resolves.toEqual({
      id: 7,
      username: 'ada',
      full_name_display: 'Ada Lovelace',
      photo: null,
    });
    expect(tokenStorage.accessToken()).toBe('access-token');
    expect(tokenStorage.refreshToken()).toBe('refresh-token');
    expect(service.status()).toBe('authenticated');
  });

  it('loads and exposes the current user', async () => {
    tokenStorage.setTokens({ accessToken: 'access', refreshToken: 'refresh' });

    const result = firstValueFrom(service.me());
    httpTesting.expectOne('/api/v1/users/me').flush({
      id: 9,
      username: 'grace',
      full_name_display: 'Grace Hopper',
      photo: null,
    });

    await expect(result).resolves.toMatchObject({ username: 'grace' });
    expect(service.user()?.username).toBe('grace');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('does not let an older login overwrite a newer session', async () => {
    const olderLogin = firstValueFrom(
      service.login({ username: 'older', password: 'secret' }),
    ).catch((error: unknown) => error);
    const newerLogin = firstValueFrom(service.login({ username: 'newer', password: 'secret' }));
    const requests = httpTesting.match('/api/v1/auth');

    requests[1]!.flush({
      id: 2,
      username: 'newer',
      full_name_display: 'New Session',
      photo: null,
      auth_token: 'new-access',
      refresh: 'new-refresh',
    });
    requests[0]!.flush({
      id: 1,
      username: 'older',
      full_name_display: 'Old Session',
      photo: null,
      auth_token: 'old-access',
      refresh: 'old-refresh',
    });

    await expect(newerLogin).resolves.toMatchObject({ username: 'newer' });
    await expect(olderLogin).resolves.toMatchObject({ name: 'StaleAuthSessionError' });
    expect(tokenStorage.tokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(service.user()?.username).toBe('newer');
  });

  it('restores the user after transparently refreshing an expired access token', async () => {
    tokenStorage.setTokens({ accessToken: 'expired-access', refreshToken: 'valid-refresh' });
    const result = firstValueFrom(service.restoreSession());

    httpTesting
      .expectOne('/api/v1/users/me')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    httpTesting
      .expectOne('/api/v1/auth/refresh')
      .flush({ auth_token: 'fresh-access', refresh: 'fresh-refresh' });
    httpTesting.expectOne('/api/v1/users/me').flush({
      id: 9,
      username: 'grace',
      full_name_display: 'Grace Hopper',
      photo: null,
    });

    await expect(result).resolves.toMatchObject({ username: 'grace' });
    expect(service.status()).toBe('authenticated');
    expect(tokenStorage.tokens()).toEqual({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
    });
  });

  it.each([401, 403])(
    'synchronously invalidates the whole session when refresh is rejected with %i',
    async (status) => {
      tokenStorage.setTokens({ accessToken: 'expired-access', refreshToken: 'expired-refresh' });
      const currentUser = firstValueFrom(service.me());
      httpTesting.expectOne('/api/v1/users/me').flush({
        id: 9,
        username: 'grace',
        full_name_display: 'Grace Hopper',
        photo: null,
      });
      await currentUser;

      const result = firstValueFrom(service.me()).catch((error: unknown) => error);
      httpTesting
        .expectOne('/api/v1/users/me')
        .flush(null, { status: 401, statusText: 'Unauthorized' });
      httpTesting
        .expectOne('/api/v1/auth/refresh')
        .flush(null, { status, statusText: status === 401 ? 'Unauthorized' : 'Forbidden' });

      expect(service.user()).toBeNull();
      expect(service.status()).toBe('anonymous');
      expect(service.isAuthenticated()).toBe(false);
      expect(tokenStorage.tokens()).toEqual({ accessToken: null, refreshToken: null });
      await expect(result).resolves.toMatchObject({ status });
    },
  );

  it('keeps tokens but does not report authentication after a transient restore error', async () => {
    tokenStorage.setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    const currentUser = firstValueFrom(service.me());
    httpTesting.expectOne('/api/v1/users/me').flush({
      id: 9,
      username: 'grace',
      full_name_display: 'Grace Hopper',
      photo: null,
    });
    await currentUser;

    const result = firstValueFrom(service.restoreSession()).catch((error: unknown) => error);
    httpTesting
      .expectOne('/api/v1/users/me')
      .flush(null, { status: 503, statusText: 'Unavailable' });

    await expect(result).resolves.toMatchObject({ status: 503 });
    expect(tokenStorage.tokens()).toEqual({ accessToken: 'access', refreshToken: 'refresh' });
    expect(service.user()).toBeNull();
    expect(service.status()).toBe('restore-error');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('restores the new identity when another browser tab replaces the session', async () => {
    tokenStorage.setTokens({ accessToken: 'user-a-access', refreshToken: 'user-a-refresh' });
    const firstUser = firstValueFrom(service.me());
    httpTesting.expectOne('/api/v1/users/me').flush({
      id: 1,
      username: 'user-a',
      full_name_display: 'User A',
      photo: null,
    });
    await firstUser;

    storage.setItem('token', JSON.stringify('user-b-access'));
    storage.setItem('refresh', JSON.stringify('user-b-refresh'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'token' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'refresh' }));
    await Promise.resolve();

    expect(service.user()).toBeNull();
    expect(service.status()).toBe('restoring');
    TestBed.tick();

    const restoredUser = httpTesting.expectOne('/api/v1/users/me');
    expect(restoredUser.request.headers.get('Authorization')).toBe('Bearer user-b-access');
    restoredUser.flush({
      id: 2,
      username: 'user-b',
      full_name_display: 'User B',
      photo: null,
    });
    TestBed.tick();

    expect(service.user()?.username).toBe('user-b');
    expect(service.status()).toBe('authenticated');
  });
});
