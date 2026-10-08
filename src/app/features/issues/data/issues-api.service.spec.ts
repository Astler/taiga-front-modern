import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { IssuesApiService } from './issues-api.service';
import { DEFAULT_ISSUE_QUERY, type IssueFiltersData, type TaigaIssue } from './issues.models';

describe('IssuesApiService', () => {
  let httpTesting: HttpTestingController;
  let service: IssuesApiService;

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
    service = TestBed.inject(IssuesApiService);
  });

  afterEach(() => httpTesting.verify());

  it('maps search, sorting, pagination, and include/exclude filters to the stable endpoint', async () => {
    const result = firstValueFrom(
      service.list(17, {
        q: 'crash',
        orderBy: '-modified_date',
        page: 3,
        filters: {
          status: { value: '4', mode: 'include' },
          tags: { value: 'frontend', mode: 'exclude' },
          assigned_to: { value: 'null', mode: 'include' },
        },
      }),
    );
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/issues');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.params.get('q')).toBe('crash');
    expect(request.request.params.get('order_by')).toBe('-modified_date');
    expect(request.request.params.get('page')).toBe('3');
    expect(request.request.params.get('status')).toBe('4');
    expect(request.request.params.get('exclude_tags')).toBe('frontend');
    expect(request.request.params.get('assigned_to')).toBe('null');

    request.flush([issue(31)], {
      headers: {
        'X-Pagination-Count': '52',
        'X-Pagination-Current': '3',
        'X-Paginated-By': '20',
      },
    });

    await expect(result).resolves.toMatchObject({
      total: 52,
      page: 3,
      pageSize: 20,
      totalPages: 3,
      items: [issue(31)],
    });
  });

  it('loads filter metadata without pagination', async () => {
    const response = filtersData();
    const result = firstValueFrom(service.filters(17));
    const request = httpTesting.expectOne('/api/v1/issues/filters_data?project=17');

    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    request.flush(response);

    await expect(result).resolves.toEqual(response);
  });

  it('omits blank optional query parameters', async () => {
    const result = firstValueFrom(service.list(17, DEFAULT_ISSUE_QUERY));
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/issues');
    expect(request.request.params.has('q')).toBe(false);
    expect(request.request.params.has('status')).toBe(false);
    request.flush([]);
    await expect(result).resolves.toMatchObject({ total: 0, page: 1, pageSize: 1 });
  });
});

function issue(id: number): TaigaIssue {
  const attribute = { id: 1, name: 'Normal', color: '#6750a4' };
  return {
    id,
    ref: id,
    subject: `Issue ${id}`,
    project: 17,
    status: 1,
    status_extra_info: { ...attribute, name: 'Open' },
    type: 1,
    type_extra_info: { ...attribute, name: 'Bug' },
    severity: 1,
    severity_extra_info: attribute,
    priority: 1,
    priority_extra_info: attribute,
    assigned_to: null,
    assigned_to_extra_info: null,
    tags: [],
    modified_date: '2026-10-08T10:00:00Z',
  };
}

function filtersData(): IssueFiltersData {
  return {
    statuses: [{ id: 1, name: 'Open', color: '#6750a4', count: 2 }],
    types: [{ id: 1, name: 'Bug', color: '#6750a4' }],
    severities: [{ id: 1, name: 'Normal', color: '#6750a4' }],
    priorities: [{ id: 1, name: 'Normal', color: '#6750a4' }],
    tags: [{ name: 'frontend', color: '#6750a4', count: 1 }],
    assigned_to: [{ id: null, full_name: 'Unassigned' }],
  };
}
