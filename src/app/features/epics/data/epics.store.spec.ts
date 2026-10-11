import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EpicsApiService } from './epics-api.service';
import type {
  EpicChanges,
  EpicCreateRequest,
  EpicFiltersData,
  EpicListPage,
  EpicListQuery,
  TaigaEpic,
} from './epics.models';
import { EpicsStore } from './epics.store';

describe('EpicsStore', () => {
  let api: {
    list: ReturnType<
      typeof vi.fn<(projectId: number, query: EpicListQuery) => Observable<EpicListPage>>
    >;
    filters: ReturnType<
      typeof vi.fn<(projectId: number, query: EpicListQuery) => Observable<EpicFiltersData>>
    >;
    get: ReturnType<typeof vi.fn<(epicId: number) => Observable<TaigaEpic>>>;
    create: ReturnType<typeof vi.fn<(request: EpicCreateRequest) => Observable<TaigaEpic>>>;
    update: ReturnType<typeof vi.fn<(epicId: number, changes: EpicChanges, version?: number) => Observable<TaigaEpic>>>;
    delete: ReturnType<typeof vi.fn<(epicId: number) => Observable<void>>>;
  };
  let store: EpicsStore;

  beforeEach(() => {
    api = { list: vi.fn(), filters: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
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

  it('hydrates a full epic and discards a stale detail response after switching projects', () => {
    const late = new Subject<TaigaEpic>();
    api.list.mockReturnValue(of(page(1, 1)));
    api.filters.mockReturnValue(of(filtersData()));
    api.get.mockReturnValue(late);
    store.loadProject(17);
    store.openEpic(store.epics()[0]!);
    expect(store.detailStatus()).toBe('loading');

    store.loadProject(18);
    late.next({ ...epic(1), description: 'Stale' });
    late.complete();
    expect(store.selectedEpic()).toBeNull();
    expect(store.projectId()).toBe(18);
  });

  it('creates, edits and deletes epics with versioned PATCH and list reconciliation', async () => {
    const original = epic(1);
    const changes: EpicChanges = {
      subject: 'New subject', description: 'Roadmap', color: '#6750a4',
      status: 2, assigned_to: null, tags: ['release'],
      is_blocked: false, blocked_note: '',
    };
    api.list.mockReturnValue(of(page(1, 1)));
    api.filters.mockReturnValue(of(filtersData()));
    api.get.mockReturnValue(of(original));
    api.create.mockReturnValue(of({ ...epic(4), subject: changes.subject }));
    api.update.mockReturnValue(of({ ...original, subject: changes.subject, version: 2 }));
    api.delete.mockReturnValue(of(undefined));
    store.loadProject(17);

    const create = {
      project: 17, subject: changes.subject, description: changes.description,
      color: changes.color, assigned_to: changes.assigned_to, tags: changes.tags,
      is_blocked: changes.is_blocked, blocked_note: changes.blocked_note,
    };
    expect(await store.createEpic(create)).toBe('created');
    expect(api.create).toHaveBeenCalledWith(create);
    store.openEpic(original);
    expect(await store.updateEpic(1, changes)).toBe('updated');
    expect(api.update).toHaveBeenCalledWith(1, changes, 1);
    expect(store.selectedEpic()?.version).toBe(2);
    expect(await store.deleteEpic(1)).toBe('deleted');
    expect(store.selectedEpic()).toBeNull();
    expect(store.mutation()).toBeNull();
  });

  it('preserves an epic after a forbidden deletion or version conflict', async () => {
    const original = epic(1);
    const changes: EpicChanges = {
      subject: 'Attempted', description: '', color: '#6750a4',
      status: 2, assigned_to: null, tags: [], is_blocked: false,
      blocked_note: '',
    };
    api.list.mockReturnValue(of(page(1, 1)));
    api.filters.mockReturnValue(of(filtersData()));
    api.get.mockReturnValue(of(original));
    api.update.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 409, statusText: 'Conflict' }),
    ));
    api.delete.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    ));
    store.loadProject(17);
    store.openEpic(original);
    expect(await store.updateEpic(1, changes)).toBe('failed');
    expect(store.mutationError()).toContain('changed elsewhere');
    expect(await store.deleteEpic(1)).toBe('failed');
    expect(store.mutationError()).toContain('does not permit');
    expect(store.epics()).toHaveLength(1);
  });

  it('avoids repeating an unconfirmed creation during reconciliation', async () => {
    const nextPage = new Subject<EpicListPage>();
    api.list.mockReturnValueOnce(of(page(1, 1))).mockReturnValueOnce(nextPage);
    api.filters.mockReturnValue(of(filtersData()));
    api.create.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 0, statusText: 'Network error' }),
    ));
    store.loadProject(17);
    const draft: EpicCreateRequest = {
      project: 17, subject: 'Maybe created', description: '', color: '#6750a4',
      assigned_to: null, tags: [], is_blocked: false, blocked_note: '',
    };
    expect(await store.createEpic(draft)).toBe('uncertain');
    expect(store.requiresReconciliation()).toBe(true);
    expect(await store.createEpic(draft)).toBe('failed');
    expect(api.create).toHaveBeenCalledOnce();
    nextPage.next(page(4, 2));
    nextPage.complete();
    expect(store.requiresReconciliation()).toBe(false);
    expect(store.epics()[0]?.id).toBe(4);
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
