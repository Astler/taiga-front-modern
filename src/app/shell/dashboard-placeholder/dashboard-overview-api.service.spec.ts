import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../core/config';
import type { KanbanUserStory } from '../../features/kanban/data';
import { DashboardOverviewApiService } from './dashboard-overview-api.service';

describe('DashboardOverviewApiService', () => {
  let httpTesting: HttpTestingController;
  let service: DashboardOverviewApiService;

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
    service = TestBed.inject(DashboardOverviewApiService);
  });

  afterEach(() => httpTesting.verify());

  it('loads the live project snapshot without pagination', async () => {
    const result = firstValueFrom(service.load(17));
    const stories = httpTesting.expectOne(
      '/api/v1/userstories?project=17&status__is_archived=false&include_attachments=1&include_tasks=1',
    );
    const milestones = httpTesting.expectOne('/api/v1/milestones?project=17&closed=false');
    expect(stories.request.headers.get('x-disable-pagination')).toBe('1');
    expect(milestones.request.headers.get('x-disable-pagination')).toBe('1');
    stories.flush([story(101)]);
    milestones.flush([{ id: 4, name: 'Release', closed: false }]);

    await expect(result).resolves.toEqual({
      stories: [story(101)],
      milestones: [{ id: 4, name: 'Release', closed: false }],
    });
  });

  it('keeps the overview usable when milestones are unavailable', async () => {
    const result = firstValueFrom(service.load(17));
    httpTesting.expectOne((request) => request.url === '/api/v1/userstories').flush([story(101)]);
    httpTesting
      .expectOne((request) => request.url === '/api/v1/milestones')
      .flush(null, { status: 403, statusText: 'Milestones disabled' });

    await expect(result).resolves.toEqual({ stories: [story(101)], milestones: [] });
  });
});

function story(id: number): KanbanUserStory {
  return {
    id,
    ref: id,
    subject: `Story ${id}`,
    project: 17,
    status: 1,
    swimlane: null,
    kanban_order: id,
    is_closed: false,
    assigned_to: null,
    assigned_users: [],
    assigned_to_extra_info: null,
    tags: [],
  };
}
