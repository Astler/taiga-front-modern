import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE, AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import {
  KanbanFilterPresetsService,
  StaleKanbanPresetSessionError,
  normalizeKanbanFilterPresets,
} from './kanban-filter-presets.service';

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

describe('KanbanFilterPresetsService', () => {
  let httpTesting: HttpTestingController;
  let service: KanbanFilterPresetsService;
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
    service = TestBed.inject(KanbanFilterPresetsService);
  });

  afterEach(() => httpTesting.verify());

  it('loads and sanitizes project-specific views', async () => {
    const result = firstValueFrom(service.load(17));
    httpTesting.expectOne('/api/v1/user-storage/pressf-kanban-filter-presets-17').flush({
      key: 'pressf-kanban-filter-presets-17',
      value: [
        {
          id: 'release',
          name: ' Release ',
          query: ' ship ',
          sort: 'due',
          filters: [
            {
              category: 'tags',
              mode: 'include',
              value: 'release',
              label: 'Release',
            },
            { category: 'invalid', mode: 'include', value: 'x', label: 'Bad' },
          ],
        },
        { id: '', name: 'Invalid', sort: 'manual', filters: [] },
      ],
    });

    await expect(result).resolves.toEqual([
      {
        id: 'release',
        name: 'Release',
        query: 'ship',
        sort: 'due',
        filters: [
          {
            category: 'tags',
            mode: 'include',
            value: 'release',
            label: 'Release',
          },
        ],
      },
    ]);
  });

  it('creates storage after an update reports a missing record', async () => {
    const presets = [
      {
        id: '3d',
        name: '3D',
        query: '',
        sort: 'manual' as const,
        filters: [
          {
            category: 'tags' as const,
            mode: 'include' as const,
            value: '3d',
            label: '3d',
          },
        ],
      },
    ];
    const result = firstValueFrom(service.save(17, presets));
    const update = httpTesting.expectOne('/api/v1/user-storage/pressf-kanban-filter-presets-17');
    expect(update.request.method).toBe('PUT');
    update.flush(null, { status: 404, statusText: 'Not found' });

    const create = httpTesting.expectOne('/api/v1/user-storage');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      key: 'pressf-kanban-filter-presets-17',
      value: presets,
    });
    create.flush({});

    await expect(result).resolves.toBeUndefined();
  });

  it('does not start a deferred save under another authentication session', async () => {
    authTokens.setTokens({ accessToken: 'user-a', refreshToken: 'refresh-a' });
    const save = service.save(17, []);
    authTokens.setTokens({ accessToken: 'user-b', refreshToken: 'refresh-b' });

    const result = firstValueFrom(save).catch((error: unknown) => error);
    httpTesting.expectNone((request) => request.method === 'PUT' || request.method === 'POST');
    await expect(result).resolves.toBeInstanceOf(StaleKanbanPresetSessionError);
  });
});

describe('normalizeKanbanFilterPresets', () => {
  it('removes duplicate preset ids and duplicate clauses', () => {
    expect(
      normalizeKanbanFilterPresets([
        {
          id: 'dev',
          name: 'Dev',
          query: '',
          sort: 'manual',
          filters: [
            { category: 'tags', mode: 'include', value: 'dev', label: 'Dev' },
            { category: 'tags', mode: 'include', value: 'dev', label: 'Dev duplicate' },
          ],
        },
        { id: 'dev', name: 'Duplicate', query: '', sort: 'manual', filters: [] },
      ]),
    ).toEqual([
      {
        id: 'dev',
        name: 'Dev',
        query: '',
        sort: 'manual',
        filters: [{ category: 'tags', mode: 'include', value: 'dev', label: 'Dev' }],
      },
    ]);
  });
});
