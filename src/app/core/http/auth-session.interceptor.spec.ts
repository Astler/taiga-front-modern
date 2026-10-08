import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE, AuthTokenStorage } from '../auth/auth-token.storage';
import { RuntimeConfigService } from '../config';
import { authSessionInterceptor } from './auth-session.interceptor';
import { TAIGA_SESSION_ID } from './session-id.token';

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

function absoluteUrl(value: string): URL {
  return new URL(value, 'http://localhost/');
}

describe('authSessionInterceptor', () => {
  let httpTesting: HttpTestingController;
  let tokenStorage: AuthTokenStorage;

  beforeEach(() => {
    const config = {
      snapshot: () => ({ defaultLanguage: 'en' }),
      resolveApiPath: (path: string) => `/api/v1/${path.replace(/^\/+/, '')}`,
      isApiRequest: (url: string) => absoluteUrl(url).pathname.startsWith('/api/v1/'),
      isApiEndpoint: (url: string, path: string) =>
        absoluteUrl(url).pathname.replace(/\/+$/, '') ===
        `/api/v1/${path.replace(/^\/+/, '')}`.replace(/\/+$/, ''),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authSessionInterceptor])),
        provideHttpClientTesting(),
        { provide: AUTH_STORAGE, useValue: new MemoryStorage() },
        { provide: TAIGA_SESSION_ID, useValue: 'session-123' },
        { provide: RuntimeConfigService, useValue: config },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    tokenStorage = TestBed.inject(AuthTokenStorage);
  });

  afterEach(() => httpTesting.verify());

  it('adds auth and session headers only to configured API requests', async () => {
    tokenStorage.setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    const http = TestBed.inject(HttpClient);

    const apiResult = firstValueFrom(http.get('/api/v1/projects'));
    const apiRequest = httpTesting.expectOne('/api/v1/projects');
    expect(apiRequest.request.headers.get('Authorization')).toBe('Bearer access');
    expect(apiRequest.request.headers.get('X-Session-Id')).toBe('session-123');
    expect(apiRequest.request.headers.get('Accept-Language')).toBe('en');
    apiRequest.flush({ ok: true });
    await apiResult;

    const externalResult = firstValueFrom(http.get('https://cdn.example/assets.json'));
    const externalRequest = httpTesting.expectOne('https://cdn.example/assets.json');
    expect(externalRequest.request.headers.has('Authorization')).toBe(false);
    expect(externalRequest.request.headers.has('X-Session-Id')).toBe(false);
    externalRequest.flush({ ok: true });
    await externalResult;
  });

  it('refreshes once after a 401 and retries with the new access token', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const http = TestBed.inject(HttpClient);

    const result = firstValueFrom(http.get('/api/v1/projects'));
    const failedRequest = httpTesting.expectOne('/api/v1/projects');
    expect(failedRequest.request.headers.get('Authorization')).toBe('Bearer old-access');
    failedRequest.flush(null, { status: 401, statusText: 'Unauthorized' });

    const refreshRequest = httpTesting.expectOne('/api/v1/auth/refresh');
    expect(refreshRequest.request.method).toBe('POST');
    expect(refreshRequest.request.body).toEqual({ refresh: 'old-refresh' });
    expect(refreshRequest.request.headers.get('X-Session-Id')).toBe('session-123');
    refreshRequest.flush({ auth_token: 'new-access', refresh: 'new-refresh' });

    const retryRequest = httpTesting.expectOne('/api/v1/projects');
    expect(retryRequest.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryRequest.flush({ id: 1 });

    await expect(result).resolves.toEqual({ id: 1 });
    expect(tokenStorage.tokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
  });

  it('shares one refresh request across concurrent 401 responses', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const http = TestBed.inject(HttpClient);

    const firstResult = firstValueFrom(http.get('/api/v1/projects/1'));
    const secondResult = firstValueFrom(http.get('/api/v1/projects/2'));
    const failedRequests = httpTesting.match((request) =>
      request.url.startsWith('/api/v1/projects/'),
    );
    expect(failedRequests).toHaveLength(2);
    failedRequests.forEach((request) =>
      request.flush(null, { status: 401, statusText: 'Unauthorized' }),
    );

    const refreshRequests = httpTesting.match('/api/v1/auth/refresh');
    expect(refreshRequests).toHaveLength(1);
    refreshRequests[0]!.flush({ auth_token: 'new-access', refresh: 'new-refresh' });

    const retries = httpTesting.match((request) => request.url.startsWith('/api/v1/projects/'));
    expect(retries).toHaveLength(2);
    retries.forEach((request) => request.flush({ id: request.request.url.endsWith('/1') ? 1 : 2 }));

    await expect(Promise.all([firstResult, secondResult])).resolves.toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('propagates a retry failure instead of masking it with the initial 401', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const http = TestBed.inject(HttpClient);

    const result = firstValueFrom(http.get('/api/v1/projects')).catch((error: unknown) => error);
    httpTesting
      .expectOne('/api/v1/projects')
      .flush(null, { status: 401, statusText: 'Unauthorized' });
    httpTesting
      .expectOne('/api/v1/auth/refresh')
      .flush({ auth_token: 'new-access', refresh: 'new-refresh' });
    httpTesting
      .expectOne('/api/v1/projects')
      .flush(null, { status: 503, statusText: 'Unavailable' });

    await expect(result).resolves.toMatchObject({ status: 503 });
  });

  it('never retries an old request under a newly logged-in session', async () => {
    tokenStorage.setTokens({ accessToken: 'user-a-access', refreshToken: 'user-a-refresh' });
    const http = TestBed.inject(HttpClient);
    const result = firstValueFrom(http.post('/api/v1/tasks', { subject: 'A task' })).catch(
      (error: unknown) => error,
    );
    const request = httpTesting.expectOne('/api/v1/tasks');

    tokenStorage.setTokens({ accessToken: 'user-b-access', refreshToken: 'user-b-refresh' });
    request.flush(null, { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectNone('/api/v1/auth/refresh');
    await expect(result).resolves.toMatchObject({ status: 401 });
  });

  it('retries with an already-rotated token without refreshing again', async () => {
    tokenStorage.setTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
    const http = TestBed.inject(HttpClient);
    const result = firstValueFrom(http.get('/api/v1/projects'));
    const request = httpTesting.expectOne('/api/v1/projects');

    tokenStorage.rotateTokens({ auth_token: 'current-access', refresh: 'current-refresh' });
    request.flush(null, { status: 401, statusText: 'Unauthorized' });

    httpTesting.expectNone('/api/v1/auth/refresh');
    const retry = httpTesting.expectOne('/api/v1/projects');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer current-access');
    retry.flush({ id: 1 });
    await expect(result).resolves.toEqual({ id: 1 });
  });
});
