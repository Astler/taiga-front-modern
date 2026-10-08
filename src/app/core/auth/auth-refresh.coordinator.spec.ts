import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../config';
import { TAIGA_SESSION_ID } from '../http/session-id.token';
import { AuthRefreshCoordinator } from './auth-refresh.coordinator';
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

describe('AuthRefreshCoordinator', () => {
  let coordinator: AuthRefreshCoordinator;
  let httpTesting: HttpTestingController;
  let tokenStorage: AuthTokenStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AUTH_STORAGE, useValue: new MemoryStorage() },
        { provide: TAIGA_SESSION_ID, useValue: 'test-session' },
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (path: string) => `/api/v1/${path}` },
        },
      ],
    });
    coordinator = TestBed.inject(AuthRefreshCoordinator);
    httpTesting = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(AuthTokenStorage);
  });

  afterEach(() => httpTesting.verify());

  it('does not restore tokens when logout happens during refresh', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const result = firstValueFrom(coordinator.refresh()).catch((error: unknown) => error);
    const request = httpTesting.expectOne('/api/v1/auth/refresh');

    tokenStorage.clear();
    request.flush({ auth_token: 'late-access', refresh: 'late-refresh' });

    await expect(result).resolves.toMatchObject({ name: 'StaleAuthSessionError' });
    expect(tokenStorage.tokens()).toEqual({ accessToken: null, refreshToken: null });
  });

  it('preserves the session after a transient refresh failure', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const result = firstValueFrom(coordinator.refresh()).catch((error: unknown) => error);

    httpTesting
      .expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 503, statusText: 'Unavailable' });

    await expect(result).resolves.toMatchObject({ status: 503 });
    expect(tokenStorage.tokens()).toEqual({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    });
  });

  it('clears the session after the backend rejects the refresh token', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'expired-refresh' });
    const result = firstValueFrom(coordinator.refresh()).catch((error: unknown) => error);

    httpTesting
      .expectOne('/api/v1/auth/refresh')
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    await expect(result).resolves.toMatchObject({ status: 401 });
    expect(tokenStorage.tokens()).toEqual({ accessToken: null, refreshToken: null });
  });
});
