import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { ProjectApiService } from './project-api.service';

describe('ProjectApiService', () => {
  let httpTesting: HttpTestingController;
  let service: ProjectApiService;

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
    service = TestBed.inject(ProjectApiService);
  });

  afterEach(() => httpTesting.verify());

  it('loads every member project using the legacy stable user-order alias', async () => {
    const result = firstValueFrom(service.listByMember(17));
    const request = httpTesting.expectOne(
      (candidate) =>
        candidate.url === '/api/v1/projects' && candidate.params.get('member') === '17',
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('order_by')).toBe('user_order');
    expect(request.request.params.get('slight')).toBe('true');
    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    request.flush([projectListItem(1, 'pressf')]);

    await expect(result).resolves.toEqual([projectListItem(1, 'pressf')]);
  });

  it('loads a full project by slug and fills its tag palette when needed', async () => {
    const result = firstValueFrom(service.getBySlug('pressf'));
    const projectRequest = httpTesting.expectOne(
      (candidate) =>
        candidate.url === '/api/v1/projects/by_slug' && candidate.params.get('slug') === 'pressf',
    );
    projectRequest.flush({
      ...projectListItem(1, 'pressf'),
      members: [],
      us_statuses: [],
      tags: ['frontend'],
    });

    httpTesting.expectOne('/api/v1/projects/1/tags_colors').flush({ frontend: '#6750a4' });

    await expect(result).resolves.toMatchObject({
      id: 1,
      slug: 'pressf',
      tags: ['frontend'],
      tags_colors: { frontend: '#6750a4' },
    });
  });

  it('rejects an incomplete detail response instead of rendering an empty project', async () => {
    const result = firstValueFrom(service.getById(1));
    httpTesting.expectOne('/api/v1/projects/1').flush(projectListItem(1, 'pressf'));
    httpTesting.expectOne('/api/v1/projects/1/tags_colors').flush({});

    await expect(result).rejects.toThrow(/detail response.*incomplete/i);
  });
});

function projectListItem(id: number, slug: string) {
  return {
    id,
    slug,
    name: slug,
    description: '',
    is_private: true,
    i_am_member: true,
    i_am_admin: false,
    i_am_owner: false,
    is_backlog_activated: true,
    is_kanban_activated: true,
    is_issues_activated: true,
    is_epics_activated: true,
    is_wiki_activated: true,
    my_permissions: [],
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
  };
}
