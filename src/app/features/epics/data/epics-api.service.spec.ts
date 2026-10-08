import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { EpicsApiService } from './epics-api.service';
import { DEFAULT_EPIC_QUERY, type EpicFiltersData, type TaigaEpic } from './epics.models';

describe('EpicsApiService', () => {
  let httpTesting: HttpTestingController;
  let service: EpicsApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (path: string) => `/api/v1/${path}` },
        },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EpicsApiService);
  });

  afterEach(() => httpTesting.verify());

  it('maps search, pagination, and stable include/exclude filters to the epics endpoint', async () => {
    const result = firstValueFrom(
      service.list(17, {
        q: 'launch',
        page: 2,
        filters: {
          status: { value: '4', mode: 'include' },
          assigned_to: { value: 'null', mode: 'include' },
          tags: { value: 'product', mode: 'exclude' },
        },
      }),
    );
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/epics');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.params.get('q')).toBe('launch');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('status')).toBe('4');
    expect(request.request.params.get('assigned_to')).toBe('null');
    expect(request.request.params.get('exclude_tags')).toBe('product');
    expect(request.request.params.has('order_by')).toBe(false);

    request.flush([epic(31)], {
      headers: {
        'X-Pagination-Count': '41',
        'X-Pagination-Current': '2',
        'X-Paginated-By': '20',
      },
    });

    await expect(result).resolves.toMatchObject({
      total: 41,
      page: 2,
      pageSize: 20,
      totalPages: 3,
      items: [epic(31)],
    });
  });

  it('loads faceted filter metadata without pagination controls', async () => {
    const response = filtersData();
    const query = {
      ...DEFAULT_EPIC_QUERY,
      q: 'launch',
      filters: { owner: { value: '7', mode: 'exclude' as const } },
    };
    const result = firstValueFrom(service.filters(17, query));
    const request = httpTesting.expectOne(
      (candidate) => candidate.url === '/api/v1/epics/filters_data',
    );

    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.params.get('q')).toBe('launch');
    expect(request.request.params.get('exclude_owner')).toBe('7');
    expect(request.request.params.has('page')).toBe(false);
    request.flush(response);

    await expect(result).resolves.toEqual(response);
  });

  it('uses a zero total header for an empty filtered page', async () => {
    const result = firstValueFrom(service.list(17, DEFAULT_EPIC_QUERY));
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/epics');
    request.flush([], {
      headers: {
        'X-Pagination-Count': '0',
        'X-Pagination-Current': '1',
        'X-Paginated-By': '20',
      },
    });
    await expect(result).resolves.toMatchObject({ total: 0, page: 1, pageSize: 20 });
  });

  it('falls back to the response length when pagination headers are absent', async () => {
    const result = firstValueFrom(service.list(17, DEFAULT_EPIC_QUERY));
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/epics');
    request.flush([epic(31), epic(32)]);

    await expect(result).resolves.toMatchObject({
      total: 2,
      page: 1,
      pageSize: 2,
      totalPages: 1,
    });
  });
});

export function epic(id: number): TaigaEpic {
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
    owner: 7,
    owner_extra_info: {
      id: 7,
      username: 'ada',
      full_name_display: 'Ada Lovelace',
      photo: null,
    },
    assigned_to: null,
    assigned_to_extra_info: null,
    status: 2,
    status_extra_info: { name: 'In progress', color: '#8de7d0', is_closed: false },
    tags: [['product', '#6750a4']],
    total_attachments: 0,
    total_voters: 0,
    is_voter: false,
    is_watcher: false,
  };
}

export function filtersData(): EpicFiltersData {
  return {
    statuses: [{ id: 2, name: 'In progress', color: '#8de7d0', order: 1, count: 2 }],
    assigned_to: [{ id: null, full_name: '', count: 1 }],
    owners: [{ id: 7, full_name: 'Ada Lovelace', count: 2 }],
    tags: [{ name: 'product', color: '#6750a4', count: 2 }],
  };
}
