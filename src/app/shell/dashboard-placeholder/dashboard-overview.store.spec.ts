import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KanbanUserStory } from '../../features/kanban/data';
import { DashboardOverviewApiService } from './dashboard-overview-api.service';
import type { DashboardOverviewPayload } from './dashboard-overview.models';
import { DashboardOverviewStore } from './dashboard-overview.store';

describe('DashboardOverviewStore', () => {
  let load: ReturnType<typeof vi.fn<(projectId: number) => Observable<DashboardOverviewPayload>>>;
  let store: DashboardOverviewStore;

  beforeEach(() => {
    load = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        DashboardOverviewStore,
        { provide: DashboardOverviewApiService, useValue: { load } },
      ],
    });
    store = TestBed.inject(DashboardOverviewStore);
  });

  it('exposes the live snapshot after a successful load', () => {
    load.mockReturnValue(of({ stories: [story(1, 10)], milestones: [{ id: 4, name: 'Release' }] }));
    store.load(17);

    expect(store.status()).toBe('loaded');
    expect(store.stories().map(({ id }) => id)).toEqual([1]);
    expect(store.milestones().map(({ id }) => id)).toEqual([4]);
  });

  it('ignores a stale project response', () => {
    const first = new Subject<DashboardOverviewPayload>();
    const second = new Subject<DashboardOverviewPayload>();
    load.mockImplementation((projectId) => (projectId === 1 ? first : second));
    store.load(1);
    store.load(2);
    second.next({ stories: [story(2, 20)], milestones: [] });
    second.complete();
    first.next({ stories: [story(1, 10)], milestones: [] });
    first.complete();

    expect(store.projectId()).toBe(2);
    expect(store.stories().map(({ id }) => id)).toEqual([2]);
  });

  it('keeps the previous snapshot when a refresh fails', () => {
    load
      .mockReturnValueOnce(of({ stories: [story(1, 10)], milestones: [] }))
      .mockReturnValueOnce(throwError(() => new Error('offline')));
    store.load(17);
    store.refresh();

    expect(store.status()).toBe('loaded');
    expect(store.stories().map(({ id }) => id)).toEqual([1]);
    expect(store.error()).toContain('latest project snapshot');
  });
});

function story(id: number, order: number): KanbanUserStory {
  return {
    id,
    ref: id,
    subject: `Story ${id}`,
    project: 17,
    status: 1,
    swimlane: null,
    kanban_order: order,
    is_closed: false,
    assigned_to: null,
    assigned_users: [],
    assigned_to_extra_info: null,
    tags: [],
  };
}
