import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssuesApiService } from './issues-api.service';
import type { IssueFiltersData, IssueListPage, IssueListQuery } from './issues.models';
import { IssuesStore } from './issues.store';

describe('IssuesStore', () => {
  let api: {
    list: ReturnType<
      typeof vi.fn<(projectId: number, query: IssueListQuery) => Observable<IssueListPage>>
    >;
    filters: ReturnType<
      typeof vi.fn<(projectId: number, query: IssueListQuery) => Observable<IssueFiltersData>>
    >;
  };
  let store: IssuesStore;

  beforeEach(() => {
    api = { list: vi.fn(), filters: vi.fn() };
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
