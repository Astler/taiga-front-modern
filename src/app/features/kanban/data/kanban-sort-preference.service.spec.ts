import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthService, AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import {
  KANBAN_SORT_STORAGE,
  KanbanSortPreferenceService,
  kanbanSortStorageKey,
  parseKanbanSortMode,
} from './kanban-sort-preference.service';

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

describe('KanbanSortPreferenceService', () => {
  const user = signal<{ id: number } | null>({ id: 7 });
  const session = signal(1);
  let storage: MemoryStorage;
  let service: KanbanSortPreferenceService;
  let http: HttpTestingController;

  beforeEach(() => {
    user.set({ id: 7 });
    session.set(1);
    storage = new MemoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: user.asReadonly() } },
        { provide: AuthTokenStorage, useValue: { revision: session.asReadonly() } },
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (path: string) => `/api/v1/${path}` },
        },
        { provide: KANBAN_SORT_STORAGE, useValue: storage },
      ],
    });
    service = TestBed.inject(KanbanSortPreferenceService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('validates stored sort names and isolates each project and user', () => {
    expect(kanbanSortStorageKey(17)).toBe('pressf-kanban-sort-17');
    expect(parseKanbanSortMode('newest')).toBe('newest');
    expect(parseKanbanSortMode('points')).toBe('points');
    expect(parseKanbanSortMode('unsupported')).toBeNull();
    expect(parseKanbanSortMode({ mode: 'due' })).toBeNull();

    service.cacheLocal(7, 17, 'newest');
    service.cacheLocal(7, 18, 'updated');
    expect(service.readLocal(7, 17)).toBe('newest');
    expect(service.readLocal(7, 18)).toBe('updated');
    expect(service.readLocal(8, 17)).toBe('manual');
    expect(service.readLocal(7, 19)).toBe('manual');
  });

  it('loads a Taiga account preference without prematurely overwriting the device cache', async () => {
    service.cacheLocal(7, 17, 'due');
    const reading = firstValueFrom(service.loadRemote(7, 17));
    const request = http.expectOne('/api/v1/user-storage/pressf-kanban-sort-17');
    expect(request.request.method).toBe('GET');
    request.flush({ key: 'pressf-kanban-sort-17', value: 'title' });

    await expect(reading).resolves.toBe('title');
    // The owning board applies remote data only if the user has not selected a newer mode.
    expect(service.readLocal(7, 17)).toBe('due');
  });

  it('keeps the device choice when Taiga has no saved preference', async () => {
    service.cacheLocal(7, 17, 'points');
    const reading = firstValueFrom(service.loadRemote(7, 17));
    http.expectOne('/api/v1/user-storage/pressf-kanban-sort-17').flush(null, {
      status: 404,
      statusText: 'Not found',
    });
    await expect(reading).resolves.toBeNull();
    expect(service.readLocal(7, 17)).toBe('points');
  });

  it('writes immediately to local storage and creates the missing Taiga storage entry', async () => {
    service.save(7, 17, 'newest');
    expect(service.readLocal(7, 17)).toBe('newest');

    await Promise.resolve();
    const put = http.expectOne('/api/v1/user-storage/pressf-kanban-sort-17');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      key: 'pressf-kanban-sort-17',
      value: 'newest',
    });
    put.flush(null, { status: 404, statusText: 'Not found' });

    const post = http.expectOne('/api/v1/user-storage');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      key: 'pressf-kanban-sort-17',
      value: 'newest',
    });
    post.flush({});
    await Promise.resolve();
  });

  it('serializes overlapping changes so the last selected sort wins', async () => {
    service.save(7, 17, 'newest');
    service.save(7, 17, 'title');
    expect(service.readLocal(7, 17)).toBe('title');

    await Promise.resolve();
    const first = http.expectOne('/api/v1/user-storage/pressf-kanban-sort-17');
    expect(first.request.body.value).toBe('newest');
    first.flush({});
    await Promise.resolve();
    await Promise.resolve();

    const second = http.expectOne('/api/v1/user-storage/pressf-kanban-sort-17');
    expect(second.request.body.value).toBe('title');
    second.flush({});
    await Promise.resolve();
    expect(service.readLocal(7, 17)).toBe('title');
  });

  it('does not start a queued save after switching accounts', async () => {
    service.save(7, 17, 'newest');
    service.save(7, 17, 'due');
    await Promise.resolve();
    const first = http.expectOne('/api/v1/user-storage/pressf-kanban-sort-17');
    user.set({ id: 8 });
    session.set(2);
    first.flush({});
    await Promise.resolve();
    await Promise.resolve();

    http.expectNone('/api/v1/user-storage/pressf-kanban-sort-17');
    expect(service.readLocal(7, 17)).toBe('due');
    expect(service.readLocal(8, 17)).toBe('manual');
  });
});
