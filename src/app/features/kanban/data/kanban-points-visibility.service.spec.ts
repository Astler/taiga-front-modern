import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { AuthService, AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import {
  KANBAN_POINTS_STORAGE,
  KanbanPointsVisibilityService,
  pointsVisibilityStorageKey,
} from './kanban-points-visibility.service';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('KanbanPointsVisibilityService', () => {
  const user = signal<{ id: number } | null>({ id: 7 });
  const session = signal(1);
  let storage: MemoryStorage;
  let service: KanbanPointsVisibilityService;
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
        { provide: RuntimeConfigService, useValue: {
          resolveApiPath: (path: string) => `/api/v1/${path}`,
        } },
        { provide: KANBAN_POINTS_STORAGE, useValue: storage },
      ],
    });
    service = TestBed.inject(KanbanPointsVisibilityService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('defaults to hidden and keeps the key scoped to the current project', () => {
    expect(pointsVisibilityStorageKey(17)).toBe('pressf-kanban-points-visible-17');
    expect(service.visibleFor(17)).toBe(false);
    expect(service.visibleFor(18)).toBe(false);
  });

  it('restores true from Taiga and caches it separately for each user and project', () => {
    service.load(17);
    expect(service.syncFor(17)).toBe('loading');
    expect(service.visibleFor(17)).toBe(false);

    http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17').flush({
      key: 'pressf-kanban-points-visible-17',
      value: true,
    });
    expect(service.syncFor(17)).toBe('synced');
    expect(service.visibleFor(17)).toBe(true);
    expect(service.visibleFor(18)).toBe(false);
    expect(storage.getItem('taiga-modern:kanban-points-visible:7:17')).toBe('true');

    user.set({ id: 8 });
    session.set(2);
    expect(service.visibleFor(17)).toBe(false);
  });

  it('retains a local preference when the Taiga record is missing', () => {
    storage.setItem('taiga-modern:kanban-points-visible:7:17', 'true');
    service.load(17);
    expect(service.visibleFor(17)).toBe(true);
    http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17').flush(null, {
      status: 404, statusText: 'Not found',
    });
    expect(service.visibleFor(17)).toBe(true);
    expect(service.syncFor(17)).toBe('local');
  });

  it('persists a toggle with PUT or POST for first-time users', async () => {
    service.setVisible(17, true);
    expect(service.visibleFor(17)).toBe(true);
    expect(service.syncFor(17)).toBe('saving');
    expect(storage.getItem('taiga-modern:kanban-points-visible:7:17')).toBe('true');

    await Promise.resolve();
    const put = http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({
      key: 'pressf-kanban-points-visible-17', value: true,
    });
    put.flush(null, { status: 404, statusText: 'Not found' });

    const post = http.expectOne('/api/v1/user-storage');
    expect(post.request.method).toBe('POST');
    post.flush({});
    await Promise.resolve();
    expect(service.syncFor(17)).toBe('synced');
  });

  it('ignores delayed remote reads after a more recent local switch', async () => {
    service.load(17);
    const reading = http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17');
    service.setVisible(17, true);
    reading.flush({ key: 'pressf-kanban-points-visible-17', value: false });
    expect(service.visibleFor(17)).toBe(true);

    await Promise.resolve();
    http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17').flush({});
    await Promise.resolve();
    expect(service.visibleFor(17)).toBe(true);
    expect(service.syncFor(17)).toBe('synced');
  });

  it('serializes rapid toggles and persists only for the active session', async () => {
    service.setVisible(17, true);
    service.setVisible(17, false);
    expect(service.visibleFor(17)).toBe(false);
    await Promise.resolve();

    const first = http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17');
    expect(first.request.body.value).toBe(true);
    first.flush({});
    await Promise.resolve();
    await Promise.resolve();

    const second = http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17');
    expect(second.request.body.value).toBe(false);
    second.flush({});
    await Promise.resolve();
    expect(service.visibleFor(17)).toBe(false);
  });

  it('does not overwrite another account with a stale Taiga response', () => {
    service.load(17);
    const old = http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17');

    user.set({ id: 8 });
    session.set(2);
    service.load(17);
    const current = http.expectOne('/api/v1/user-storage/pressf-kanban-points-visible-17');

    old.flush({ key: 'pressf-kanban-points-visible-17', value: true });
    expect(service.visibleFor(17)).toBe(false);
    current.flush({ key: 'pressf-kanban-points-visible-17', value: false });
    expect(service.visibleFor(17)).toBe(false);
  });
});
