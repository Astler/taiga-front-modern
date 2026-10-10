import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileDashboardApiService } from './profile-dashboard-api.service';
import type { ProfileDashboardPayload, ProfileWorkItem } from './profile-dashboard.models';
import { ProfileDashboardStore } from './profile-dashboard.store';

const item: ProfileWorkItem = {
  id: 1, ref: 11, type: 'userstory', projectId: 17,
  projectSlug: 'aurora', projectName: 'Aurora', title: 'Story',
  statusName: 'In progress', statusColor: '#baaaff',
  isClosed: false, isBlocked: false, dueDate: null,
  updatedAt: null, parentStoryId: null,
};

const snapshot: ProfileDashboardPayload = {
  assigned: [item],
  watching: [item],
  warnings: [],
};

describe('ProfileDashboardStore', () => {
  let load: ReturnType<typeof vi.fn<(userId: number) => Observable<ProfileDashboardPayload>>>;
  let store: ProfileDashboardStore;

  beforeEach(() => {
    load = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ProfileDashboardStore,
        { provide: ProfileDashboardApiService, useValue: { load } },
      ],
    });
    store = TestBed.inject(ProfileDashboardStore);
  });

  it('stores the full profile snapshot rather than one project', () => {
    load.mockReturnValue(of(snapshot));
    store.load(7);
    expect(load).toHaveBeenCalledWith(7);
    expect(store.status()).toBe('loaded');
    expect(store.assigned()).toEqual([item]);
    expect(store.watching()).toEqual([item]);
  });

  it('ignores responses from a previous user session', () => {
    const first = new Subject<ProfileDashboardPayload>();
    const second = new Subject<ProfileDashboardPayload>();
    load.mockImplementation((userId) => userId === 7 ? first : second);
    store.load(7);
    store.load(8);
    second.next({ assigned: [], watching: [item], warnings: [] });
    second.complete();
    first.next(snapshot);
    first.complete();

    expect(store.userId()).toBe(8);
    expect(store.assigned()).toEqual([]);
    expect(store.watching()).toEqual([item]);
  });

  it('keeps the previous snapshot if a background refresh fails', () => {
    load.mockReturnValueOnce(of(snapshot))
      .mockReturnValueOnce(throwError(() => new Error('offline')));
    store.load(7);
    store.refresh();
    expect(store.status()).toBe('loaded');
    expect(store.assigned()).toEqual([item]);
    expect(store.error()).toContain('Previous data was kept');
  });

  it('clears profile data when the session ends', () => {
    load.mockReturnValue(of(snapshot));
    store.load(7);
    store.clear();
    expect(store.userId()).toBeNull();
    expect(store.status()).toBe('idle');
    expect(store.assigned()).toEqual([]);
    expect(store.watching()).toEqual([]);
  });
});
