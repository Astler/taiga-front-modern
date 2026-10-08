import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { AUTH_STORAGE, AuthTokenStorage } from '../../../core/auth';
import {
  PinnedProjectsApiService,
  StalePinnedProjectsSessionError,
  normalizeRemotePinnedIds,
} from './pinned-projects-api.service';

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

describe('PinnedProjectsApiService', () => {
  let httpTesting: HttpTestingController;
  let service: PinnedProjectsApiService;
  let authTokens: AuthTokenStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AUTH_STORAGE, useValue: new MemoryStorage() },
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (path: string) => `/api/v1/${path}` },
        },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    authTokens = TestBed.inject(AuthTokenStorage);
    service = TestBed.inject(PinnedProjectsApiService);
  });

  afterEach(() => httpTesting.verify());

  it('loads the pin list shared with the classic frontend', async () => {
    const result = firstValueFrom(service.load());
    httpTesting.expectOne('/api/v1/user-storage/pressf-pinned-projects').flush({
      key: 'pressf-pinned-projects',
      value: [7, '8', 7, 'invalid'],
    });

    await expect(result).resolves.toEqual([7, 8]);
  });

  it('creates storage when updating a missing record fails', async () => {
    const result = firstValueFrom(service.save([7, 8]));
    const update = httpTesting.expectOne('/api/v1/user-storage/pressf-pinned-projects');
    expect(update.request.method).toBe('PUT');
    update.flush(null, { status: 404, statusText: 'Not found' });

    const create = httpTesting.expectOne('/api/v1/user-storage');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ key: 'pressf-pinned-projects', value: [7, 8] });
    create.flush({});

    await expect(result).resolves.toBeUndefined();
  });

  it('does not run the create fallback after the authentication session changes', async () => {
    authTokens.setTokens({ accessToken: 'user-a', refreshToken: 'refresh-a' });
    const result = firstValueFrom(service.save([7])).catch((error: unknown) => error);
    const update = httpTesting.expectOne('/api/v1/user-storage/pressf-pinned-projects');

    authTokens.setTokens({ accessToken: 'user-b', refreshToken: 'refresh-b' });
    update.flush(null, { status: 404, statusText: 'Not found' });

    httpTesting.expectNone((request) => request.method === 'POST');
    await expect(result).resolves.toMatchObject({ status: 404 });
  });

  it('does not start a deferred save under a different authentication session', async () => {
    authTokens.setTokens({ accessToken: 'user-a', refreshToken: 'refresh-a' });
    const save = service.save([7]);

    authTokens.setTokens({ accessToken: 'user-b', refreshToken: 'refresh-b' });
    const result = firstValueFrom(save).catch((error: unknown) => error);

    httpTesting.expectNone((request) => request.method === 'PUT' || request.method === 'POST');
    await expect(result).resolves.toBeInstanceOf(StalePinnedProjectsSessionError);
  });

  it('does not create a duplicate record after a non-404 update failure', async () => {
    const result = firstValueFrom(service.save([7])).catch((error: unknown) => error);
    httpTesting
      .expectOne('/api/v1/user-storage/pressf-pinned-projects')
      .flush(null, { status: 503, statusText: 'Unavailable' });

    httpTesting.expectNone((request) => request.method === 'POST');
    await expect(result).resolves.toMatchObject({ status: 503 });
  });
});

describe('normalizeRemotePinnedIds', () => {
  it('accepts only unique numeric project IDs', () => {
    expect(normalizeRemotePinnedIds([1, '2', 1, -1, 'slug:three', null])).toEqual([1, 2]);
  });
});
