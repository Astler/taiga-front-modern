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
    const request = httpTesting.expectOne(
      '/api/v1/userstories?project=17&status__is_archived=false',
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    expect(request.request.params.keys().sort()).toEqual(['project', 'status__is_archived'].sort());
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.params.get('status__is_archived')).toBe('false');

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
