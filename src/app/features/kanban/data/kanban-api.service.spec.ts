import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { KanbanApiService } from './kanban-api.service';
import type { KanbanSwimlane, KanbanUserStory } from './kanban.models';

describe('KanbanApiService', () => {
  let httpTesting: HttpTestingController;
  let service: KanbanApiService;

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
    service = TestBed.inject(KanbanApiService);
  });

  afterEach(() => httpTesting.verify());

  it('requests the unpaginated open user-story projection required by the board', async () => {
    const response = [userStory(101)];
    const result = firstValueFrom(service.listUserStories(17));
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/userstories');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    expect(request.request.params.keys().sort()).toEqual(
      ['project', 'status__is_archived', 'include_attachments', 'include_tasks'].sort(),
    );
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.params.get('status__is_archived')).toBe('false');
    expect(request.request.params.get('include_attachments')).toBe('1');
    expect(request.request.params.get('include_tasks')).toBe('1');

    request.flush(response);
    await expect(result).resolves.toEqual(response);
  });

  it('requests all project swimlanes without pagination', async () => {
    const response = [swimlane(3)];
    const result = firstValueFrom(service.listSwimlanes(17));
    const request = httpTesting.expectOne('/api/v1/swimlanes?project=17');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    expect(request.request.params.keys()).toEqual(['project']);
    expect(request.request.params.get('project')).toBe('17');

    request.flush(response);
    await expect(result).resolves.toEqual(response);
  });

  it('loads the filter metadata exposed by stable Taiga', async () => {
    const response = { tags: [{ name: 'frontend', count: 4 }] };
    const result = firstValueFrom(service.filtersData(17));
    const request = httpTesting.expectOne('/api/v1/userstories/filters_data?project=17');

    expect(request.request.method).toBe('GET');
    request.flush(response);
    await expect(result).resolves.toEqual(response);
  });

  it('keeps the board usable when optional filter metadata is unsupported', async () => {
    const result = firstValueFrom(service.load(17));
    httpTesting.expectOne('/api/v1/swimlanes?project=17').flush([swimlane(3)]);
    httpTesting
      .expectOne(
        '/api/v1/userstories?project=17&status__is_archived=false&include_attachments=1&include_tasks=1',
      )
      .flush([userStory(101)]);
    httpTesting
      .expectOne('/api/v1/userstories/filters_data?project=17')
      .flush(null, { status: 404, statusText: 'Not found' });
    httpTesting
      .expectOne('/api/v1/milestones?project=17')
      .flush(null, { status: 404, statusText: 'Not found' });

    await expect(result).resolves.toEqual({
      swimlanes: [swimlane(3)],
      userStories: [userStory(101)],
      filtersData: {},
      milestones: [],
    });
  });

  it('loads a complete story projection for the detail drawer', async () => {
    const response = { ...userStory(101), description: 'Full story' };
    const result = firstValueFrom(service.getUserStory(101));
    const request = httpTesting.expectOne(
      '/api/v1/userstories/101?include_attachments=1&include_tasks=1',
    );

    expect(request.request.method).toBe('GET');
    request.flush(response);
    await expect(result).resolves.toEqual(response);
  });

  it('updates a story with optimistic-concurrency versioning', async () => {
    const response = { ...userStory(101), subject: 'Updated story', version: 8 };
    const result = firstValueFrom(
      service.updateUserStory({
        projectId: 17,
        storyId: 101,
        version: 7,
        changes: {
          subject: 'Updated story',
          description: 'More context',
          status: 2,
          assigned_users: [3, 4],
          milestone: 9,
          due_date: '2026-10-31',
          tags: ['release'],
          is_blocked: false,
          blocked_note: '',
        },
      }),
    );
    const request = httpTesting.expectOne('/api/v1/userstories/101');

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({
      subject: 'Updated story',
      description: 'More context',
      status: 2,
      assigned_users: [3, 4],
      milestone: 9,
      due_date: '2026-10-31',
      tags: ['release'],
      is_blocked: false,
      blocked_note: '',
      version: 7,
    });
    request.flush(response);
    await expect(result).resolves.toEqual(response);
  });

  it('moves stories with the stable relative-order contract', async () => {
    const result = firstValueFrom(
      service.moveUserStories({
        projectId: 17,
        statusId: 4,
        swimlaneId: 9,
        storyIds: [101],
        afterStoryId: 88,
      }),
    );
    const request = httpTesting.expectOne('/api/v1/userstories/bulk_update_kanban_order');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      project_id: 17,
      status_id: 4,
      swimlane_id: 9,
      bulk_userstories: [101],
      after_userstory_id: 88,
    });
    request.flush([{ id: 101, status: 4, swimlane: 9, kanban_order: 12 }]);

    await expect(result).resolves.toEqual([{ id: 101, status: 4, swimlane: 9, kanban_order: 12 }]);
  });

  it('omits a null swimlane and prefers the before anchor', async () => {
    const result = firstValueFrom(
      service.moveUserStories({
        projectId: 17,
        statusId: 4,
        swimlaneId: null,
        storyIds: [101],
        beforeStoryId: 102,
      }),
    );
    const request = httpTesting.expectOne('/api/v1/userstories/bulk_update_kanban_order');

    expect(request.request.body).toEqual({
      project_id: 17,
      status_id: 4,
      bulk_userstories: [101],
      before_userstory_id: 102,
    });
    request.flush([]);
    await expect(result).resolves.toEqual([]);
  });

  it('moves into an empty root column without an invalid anchor or swimlane sentinel', async () => {
    const result = firstValueFrom(
      service.moveUserStories({
        projectId: 17,
        statusId: 6,
        swimlaneId: null,
        storyIds: [101],
      }),
    );
    const request = httpTesting.expectOne('/api/v1/userstories/bulk_update_kanban_order');

    expect(request.request.body).toEqual({
      project_id: 17,
      status_id: 6,
      bulk_userstories: [101],
    });
    request.flush([]);
    await expect(result).resolves.toEqual([]);
  });

  it('quick-creates stories in a board cell with the stable bulk endpoint', async () => {
    const response = [userStory(104)];
    const result = firstValueFrom(
      service.createUserStories({
        projectId: 17,
        statusId: 4,
        swimlaneId: null,
        subjects: 'New story',
      }),
    );
    const request = httpTesting.expectOne('/api/v1/userstories/bulk_create');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      project_id: 17,
      status_id: 4,
      bulk_stories: 'New story',
    });
    request.flush(response);
    await expect(result).resolves.toEqual(response);
  });
});

function userStory(id: number): KanbanUserStory {
  return {
    id,
    ref: id,
    subject: `Story ${id}`,
    project: 17,
    status: 1,
    swimlane: null,
    kanban_order: 1,
    is_closed: false,
    assigned_to: null,
    assigned_users: [],
    assigned_to_extra_info: null,
    tags: [],
  };
}

function swimlane(id: number): KanbanSwimlane {
  return { id, name: `Lane ${id}`, order: 1, project: 17 };
}
