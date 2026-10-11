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

  it('loads faceted filter metadata with the active search and include/exclude filters', async () => {
    const response = filtersData();
    const query = {
      ...DEFAULT_ISSUE_QUERY,
      q: 'crash',
      filters: {
        status: { value: '4', mode: 'include' as const },
        tags: { value: 'frontend', mode: 'exclude' as const },
      },
    };
    const result = firstValueFrom(service.filters(17, query));
    const request = httpTesting.expectOne(
      (candidate) => candidate.url === '/api/v1/issues/filters_data',
    );

    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.params.get('q')).toBe('crash');
    expect(request.request.params.get('status')).toBe('4');
    expect(request.request.params.get('exclude_tags')).toBe('frontend');
    expect(request.request.params.has('page')).toBe(false);
    expect(request.request.params.has('order_by')).toBe(false);
    request.flush(response);

    await expect(result).resolves.toEqual(response);
  });

  it('uses Taiga issue detail and CRUD endpoints with versioned PATCH', async () => {
    const detail = firstValueFrom(service.get(38));
    const get = httpTesting.expectOne('/api/v1/issues/38');
    expect(get.request.method).toBe('GET');
    get.flush({ ...issue(38), description: 'Details', version: 2 });
    expect((await detail).version).toBe(2);

    const values = {
      subject: 'Refine crash',
      description: 'Steps to reproduce',
      status: 1,
      type: 2,
      severity: 3,
      priority: 4,
      assigned_to: null,
      due_date: '2026-10-30',
      tags: ['frontend'],
      is_blocked: false,
      blocked_note: '',
    };
    const creation = firstValueFrom(service.create({ project: 17, ...values }));
    const post = httpTesting.expectOne('/api/v1/issues');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ project: 17, ...values });
    post.flush({ ...issue(39), subject: values.subject });
    expect((await creation).id).toBe(39);

    const update = firstValueFrom(service.update(38, values, 2));
    const patch = httpTesting.expectOne('/api/v1/issues/38');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ ...values, version: 2 });
    patch.flush({ ...issue(38), ...values, version: 3 });
    expect((await update).version).toBe(3);

    const deletion = firstValueFrom(service.delete(38));
    const del = httpTesting.expectOne('/api/v1/issues/38');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No content' });
    await expect(deletion).resolves.toBeUndefined();
  });


  it('lists issue attachments using the stable Taiga API', async () => {
    const result = firstValueFrom(service.listAttachments(17, 38));
    const request = httpTesting.expectOne('/api/v1/issues/attachments?project=17&object_id=38');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Disable-Pagination')).toBe('1');
    const attachments = [{ id: 90, name: 'error.png', url: '/media/error.png', size: 2048 }];
    request.flush(attachments);
    await expect(result).resolves.toEqual(attachments);
  });

  it('uploads and deletes an issue attachment via multipart FormData', async () => {
    const file = new File(['log content'], 'error.log', { type: 'text/plain' });
    const uploading = firstValueFrom(service.uploadAttachment(17, 38, file));
    const post = httpTesting.expectOne('/api/v1/issues/attachments');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toBeInstanceOf(FormData);
    expect(post.request.body.get('project')).toBe('17');
    expect(post.request.body.get('object_id')).toBe('38');
    expect((post.request.body.get('attached_file') as File).name).toBe('error.log');
    expect(post.request.headers.has('Content-Type')).toBe(false);
    post.flush({ id: 90, name: 'error.log', url: '/media/error.log', size: 11 });
    await expect(uploading).resolves.toMatchObject({ id: 90 });

    const deleting = firstValueFrom(service.deleteAttachment(90));
    const del = httpTesting.expectOne('/api/v1/issues/attachments/90');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No content' });
    await expect(deleting).resolves.toBeUndefined();
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
  return {
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
