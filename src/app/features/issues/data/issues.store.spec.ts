import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesApiService } from './issues-api.service';
import type {
  IssueChanges,
  IssueCreateRequest,
  IssueFiltersData,
  IssueListPage,
  IssueListQuery,
  TaigaIssue,
} from './issues.models';
import { IssuesStore } from './issues.store';

describe('IssuesStore', () => {
  let api: {
    list: ReturnType<
      typeof vi.fn<(projectId: number, query: IssueListQuery) => Observable<IssueListPage>>
    >;
    filters: ReturnType<
      typeof vi.fn<(projectId: number, query: IssueListQuery) => Observable<IssueFiltersData>>
    >;
    get: ReturnType<typeof vi.fn<(issueId: number) => Observable<TaigaIssue>>>;
    create: ReturnType<typeof vi.fn<(request: IssueCreateRequest) => Observable<TaigaIssue>>>;
    update: ReturnType<typeof vi.fn<(issueId: number, changes: IssueChanges, version?: number) => Observable<TaigaIssue>>>;
    delete: ReturnType<typeof vi.fn<(issueId: number) => Observable<void>>>;
  };
  let store: IssuesStore;

  beforeEach(() => {
    api = { list: vi.fn(), filters: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [IssuesStore, { provide: IssuesApiService, useValue: api }],
    });
    store = TestBed.inject(IssuesStore);
  });

  it('loads the first issue page and filter metadata together', () => {
    api.list.mockReturnValue(of(page(1, 23)));
    api.filters.mockReturnValue(of(filtersData()));

    store.loadProject(17);

    expect(api.list).toHaveBeenCalledWith(17, expect.objectContaining({ page: 1 }));
    expect(api.filters).toHaveBeenCalledWith(17, expect.objectContaining({ page: 1 }));
    expect(store.status()).toBe('loaded');
    expect(store.issues().map(({ id }) => id)).toEqual([1]);
    expect(store.page()?.total).toBe(23);
    expect(store.filtersData()?.tags[0]?.name).toBe('frontend');
  });

  it('refreshes faceted metadata for filters but reuses it for sorting and pagination', () => {
    api.list.mockReturnValue(of(page(1, 40)));
    api.filters.mockReturnValue(of(filtersData()));
    store.loadProject(17);

    api.list.mockClear();
    store.setFilter('status', '2', 'exclude');
    store.setSort('priority');
    store.setPage(2);

    expect(api.list).toHaveBeenNthCalledWith(
      1,
      17,
      expect.objectContaining({
        page: 1,
        filters: { status: { value: '2', mode: 'exclude' } },
      }),
    );
    expect(api.list).toHaveBeenNthCalledWith(
      3,
      17,
      expect.objectContaining({ page: 2, orderBy: 'priority' }),
    );
    expect(api.filters).toHaveBeenCalledTimes(2);
    expect(api.filters).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({ filters: { status: { value: '2', mode: 'exclude' } } }),
    );
  });

  it('ignores an older page response after a newer query wins', () => {
    const initial = new Subject<IssueListPage>();
    api.list.mockReturnValueOnce(initial);
    api.filters.mockReturnValue(of(filtersData()));
    store.loadProject(17);
    initial.next(page(1, 2));
    initial.complete();

    const older = new Subject<IssueListPage>();
    const newer = new Subject<IssueListPage>();
    const olderFilters = new Subject<IssueFiltersData>();
    const newerFilters = new Subject<IssueFiltersData>();
    api.list.mockReturnValueOnce(older).mockReturnValueOnce(newer);
    api.filters.mockReturnValueOnce(olderFilters).mockReturnValueOnce(newerFilters);
    store.setSearch('old');
    store.setSearch('new');

    newer.next(page(3, 1));
    newer.complete();
    newerFilters.next({ ...filtersData(), tags: [{ name: 'new', color: null }] });
    newerFilters.complete();
    older.next(page(2, 1));
    older.complete();
    olderFilters.next({ ...filtersData(), tags: [{ name: 'old', color: null }] });
    olderFilters.complete();

    expect(store.issues()[0]?.id).toBe(3);
    expect(store.query().q).toBe('new');
    expect(store.filtersData()?.tags[0]?.name).toBe('new');
  });

  it('loads full issue detail and ignores a response after switching projects', () => {
    const first = new Subject<TaigaIssue>();
    api.list.mockReturnValue(of(page(1, 1)));
    api.filters.mockReturnValue(of(filtersData()));
    api.get.mockReturnValue(first);
    store.loadProject(17);
    store.openIssue(store.issues()[0]!);
    expect(store.detailStatus()).toBe('loading');

    store.loadProject(18);
    first.next({ ...page(1, 1).items[0]!, description: 'Stale details' });
    first.complete();
    expect(store.projectId()).toBe(18);
    expect(store.selectedIssue()).toBeNull();
  });

  it('creates, edits, and deletes issues while reconciling the current list', async () => {
    const original = { ...page(1, 1).items[0]!, version: 2, description: 'Original' };
    api.list.mockReturnValue(of({ ...page(1, 1), items: [original] }));
    api.filters.mockReturnValue(of(filtersData()));
    api.get.mockReturnValue(of(original));
    api.create.mockReturnValue(of({ ...original, id: 4, ref: 4, subject: 'Created' }));
    api.update.mockReturnValue(of({ ...original, subject: 'Edited', version: 3 }));
    api.delete.mockReturnValue(of(undefined));
    store.loadProject(17);

    const changes: IssueChanges = {
      subject: 'Edited', description: 'Updated', status: 1,
      type: 1, severity: 1, priority: 1,
      assigned_to: null, due_date: null, tags: [],
      is_blocked: false, blocked_note: '',
    };
    expect(await store.createIssue({ ...changes, project: 17 })).toBe('created');
    expect(api.create).toHaveBeenCalledWith({ ...changes, project: 17 });
    expect(store.mutation()).toBeNull();

    store.openIssue(original);
    expect(store.selectedIssue()?.version).toBe(2);
    expect(await store.updateIssue(1, changes)).toBe('updated');
    expect(api.update).toHaveBeenCalledWith(1, changes, 2);
    expect(store.selectedIssue()?.subject).toBe('Edited');

    expect(await store.deleteIssue(1)).toBe('deleted');
    expect(api.delete).toHaveBeenCalledWith(1);
    expect(store.selectedIssue()).toBeNull();
    expect(store.mutation()).toBeNull();
    expect(api.list).toHaveBeenCalledTimes(4);
  });

  it('does not update the list when a version conflict or forbidden delete occurs', async () => {
    const original = page(1, 1).items[0]!;
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
    store.openIssue(original);
    const changes: IssueChanges = {
      subject: 'Attempted', description: '', status: 1, type: 1,
      severity: 1, priority: 1, assigned_to: null, due_date: null,
      tags: [], is_blocked: false, blocked_note: '',
    };

    expect(await store.updateIssue(1, changes)).toBe('failed');
    expect(store.mutationError()).toContain('changed elsewhere');
    expect(store.selectedIssue()?.subject).toBe('Issue 1');
    expect(await store.deleteIssue(1)).toBe('failed');
    expect(store.mutationError()).toContain('does not permit');
    expect(store.issues()).toHaveLength(1);
  });

  it('avoids repeating an unconfirmed creation and reconciles after a connection error', async () => {
    const load = new Subject<IssueListPage>();
    api.list.mockReturnValueOnce(of(page(1, 1))).mockReturnValueOnce(load);
    api.filters.mockReturnValue(of(filtersData()));
    api.create.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 0, statusText: 'Network error' }),
    ));
    store.loadProject(17);
    const draft: IssueCreateRequest = {
      project: 17, subject: 'Maybe created', description: '', status: 1,
      type: 1, severity: 1, priority: 1, assigned_to: null,
      due_date: null, tags: [], is_blocked: false, blocked_note: '',
    };
    expect(await store.createIssue(draft)).toBe('uncertain');
    expect(store.requiresReconciliation()).toBe(true);
    expect(await store.createIssue(draft)).toBe('failed');
    expect(api.create).toHaveBeenCalledTimes(1);
    load.next(page(4, 2));
    load.complete();
    expect(store.requiresReconciliation()).toBe(false);
    expect(store.issues()[0]?.id).toBe(4);
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

function page(id: number, total: number): IssueListPage {
  return {
    items: [
      {
        id,
        ref: id,
        subject: `Issue ${id}`,
        project: 17,
        status: 1,
        status_extra_info: { name: 'Open', color: '#6750a4', is_closed: false },
        type: 1,
        severity: 1,
        priority: 1,
        assigned_to: null,
        assigned_to_extra_info: null,
        tags: [],
        modified_date: '2026-10-08T10:00:00Z',
      },
    ],
    page: 1,
    pageSize: 20,
    total,
    totalPages: Math.max(1, Math.ceil(total / 20)),
  };
}

function filtersData(): IssueFiltersData {
  return {
    statuses: [{ id: 1, name: 'Open', color: '#6750a4' }],
    types: [{ id: 1, name: 'Bug', color: '#6750a4' }],
    severities: [{ id: 1, name: 'Normal', color: '#6750a4' }],
    priorities: [{ id: 1, name: 'Normal', color: '#6750a4' }],
    tags: [{ name: 'frontend', color: '#6750a4' }],
    assigned_to: [],
  };
}
