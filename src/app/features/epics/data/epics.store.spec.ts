import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpicsApiService } from './epics-api.service';
import type { EpicFiltersData, EpicListPage, EpicListQuery, TaigaEpic } from './epics.models';
import { EpicsStore } from './epics.store';

describe('EpicsStore', () => {
  let api: {
    list: ReturnType<
      typeof vi.fn<(projectId: number, query: EpicListQuery) => Observable<EpicListPage>>
    >;
    filters: ReturnType<
      typeof vi.fn<(projectId: number, query: EpicListQuery) => Observable<EpicFiltersData>>
    >;
  };
  let store: EpicsStore;

  beforeEach(() => {
    api = { list: vi.fn(), filters: vi.fn() };
    TestBed.configureTestingModule({
      providers: [EpicsStore, { provide: EpicsApiService, useValue: api }],
    });
    store = TestBed.inject(EpicsStore);
  });

  it('loads the first page and filter metadata together', () => {
    api.list.mockReturnValue(of(page(1, 23)));
    api.filters.mockReturnValue(of(filtersData()));

    store.loadProject(17);

    expect(api.list).toHaveBeenCalledWith(17, expect.objectContaining({ page: 1 }));
    expect(api.filters).toHaveBeenCalledWith(17, expect.objectContaining({ page: 1 }));
    expect(store.status()).toBe('loaded');
    expect(store.epics()[0]?.subject).toBe('Epic 1');
    expect(store.page()?.total).toBe(23);
    expect(store.filtersData()?.owners[0]?.full_name).toBe('Ada Lovelace');
  });

  it('refreshes facets for search and filters but reuses them for pagination', () => {
    api.list.mockReturnValue(of(page(1, 40)));
    api.filters.mockReturnValue(of(filtersData()));
    store.loadProject(17);

    api.list.mockClear();
    store.setSearch('release');
    store.setFilter('status', '2', 'exclude');
    store.setPage(2);

    expect(api.list).toHaveBeenNthCalledWith(
      1,
      17,
      expect.objectContaining({ q: 'release', page: 1 }),
    );
    expect(api.list).toHaveBeenNthCalledWith(
      2,
      17,
      expect.objectContaining({ filters: { status: { value: '2', mode: 'exclude' } } }),
    );
    expect(api.list).toHaveBeenNthCalledWith(3, 17, expect.objectContaining({ page: 2 }));
    expect(api.filters).toHaveBeenCalledTimes(3);
  });

  it('ignores stale responses after a newer project wins', () => {
    const oldPage = new Subject<EpicListPage>();
    const oldFilters = new Subject<EpicFiltersData>();
    api.list.mockReturnValueOnce(oldPage).mockReturnValueOnce(of(page(2, 1)));
    api.filters.mockReturnValueOnce(oldFilters).mockReturnValueOnce(of(filtersData()));

    store.loadProject(17);
    store.loadProject(18);
    oldPage.next(page(1, 1));
    oldPage.complete();
    oldFilters.next(filtersData());
    oldFilters.complete();

    expect(store.projectId()).toBe(18);
    expect(store.epics()[0]?.id).toBe(2);
  });

  it('surfaces failures and retries the current query', () => {
    api.list
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of(page(1, 1)));
    api.filters.mockReturnValue(of(filtersData()));

    store.loadProject(17);
    expect(store.status()).toBe('error');

    store.retry();
    expect(store.status()).toBe('loaded');
    expect(store.error()).toBeNull();
  });
});

function page(id: number, total: number): EpicListPage {
  return {
    items: [epic(id)],
    page: 1,
    pageSize: 20,
    total,
    totalPages: Math.max(1, Math.ceil(total / 20)),
  };
}

function epic(id: number): TaigaEpic {
  return {
    id,
    ref: id,
    project: 17,
    project_extra_info: { name: 'Alpha', slug: 'alpha', logo_small_url: null },
    created_date: '2026-10-01T09:00:00Z',
    modified_date: '2026-10-08T10:00:00Z',
    subject: `Epic ${id}`,
    color: '#6750a4',
    epics_order: id,
    client_requirement: false,
    team_requirement: true,
    version: 1,
    watchers: [],
    is_blocked: false,
    blocked_note: '',
    is_closed: false,
    user_stories_counts: { total: 10, progress: 4, opened: 6, closed: 4 },
    owner: null,
    owner_extra_info: null,
    assigned_to: null,
    assigned_to_extra_info: null,
    status: 2,
    status_extra_info: { name: 'In progress', color: '#8de7d0', is_closed: false },
    tags: [],
    total_attachments: 0,
    total_voters: 0,
    is_voter: false,
    is_watcher: false,
  };
}

function filtersData(): EpicFiltersData {
  return {
    statuses: [{ id: 2, name: 'In progress', color: '#8de7d0', count: 1 }],
    assigned_to: [{ id: null, full_name: '', count: 1 }],
    owners: [{ id: 7, full_name: 'Ada Lovelace', count: 1 }],
    tags: [{ name: 'product', color: '#6750a4', count: 1 }],
  };
}
