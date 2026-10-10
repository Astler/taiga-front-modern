import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { ProfileDashboardApiService } from './profile-dashboard-api.service';

describe('ProfileDashboardApiService', () => {
  let http: HttpTestingController;
  let api: ProfileDashboardApiService;

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
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(ProfileDashboardApiService);
  });

  afterEach(() => http.verify());

  it('fetches account-wide assigned and watched items and deduplicates multiple assignees', async () => {
    const promise = firstValueFrom(api.load(7));
    const legacy = http.expectOne((request) =>
      request.url === '/api/v1/userstories' && request.params.get('assigned_to') === '7');
    const multiple = http.expectOne((request) =>
      request.url === '/api/v1/userstories' && request.params.get('assigned_users') === '7');
    const tasks = http.expectOne('/api/v1/tasks?assigned_to=7&status__is_closed=false');
    const issues = http.expectOne('/api/v1/issues?assigned_to=7&status__is_closed=false');
    const epics = http.expectOne('/api/v1/epics?assigned_to=7&status__is_closed=false');
    const watching = http.expectOne('/api/v1/users/7/watched');

    for (const request of [legacy, multiple, tasks, issues, epics, watching]) {
      expect(request.request.headers.get('X-Disable-Pagination')).toBe('1');
      expect(request.request.params.has('project')).toBe(false);
    }
    expect(legacy.request.params.get('status__is_closed')).toBe('false');

    const story = {
      id: 101,
      ref: 31,
      project: 17,
      project_extra_info: { name: 'Aurora', slug: 'aurora' },
      subject: 'Ship new home',
      assigned_to: 7,
      assigned_users: [7, 8],
      is_closed: false,
      modified_date: '2026-10-10T10:00:00Z',
    };
    legacy.flush([story]);
    multiple.flush([story, {
      id: 102, ref: 32, project: 17, subject: 'Multiple assignee story',
      assigned_to: null, assigned_users: [7, 8],
    }]);
    tasks.flush([{ id: 200, ref: 23, project: 24, subject: 'Test task',
      assigned_to: 7, user_story: 101, is_closed: false }]);
    issues.flush([{ id: 300, ref: 12, project: 24, subject: 'Crash',
      assigned_to: 7, status_extra_info: { name: 'Open', is_closed: false } }]);
    epics.flush([{ id: 400, ref: 11, project: 24, subject: 'Closed epic',
      assigned_to: 7, is_closed: true }]);
    watching.flush([
      { type: 'issue', id: 301, ref: 13, project: 24,
        project_slug: 'orbit', project_name: 'Orbit', subject: 'Watch bug' },
      { type: 'project', id: 17, slug: 'aurora', name: 'Aurora' },
    ]);

    const payload = await promise;
    expect(payload.assigned.map((item) => item.id).sort()).toEqual([101, 102, 200, 300]);
    expect(payload.assigned.find((item) => item.id === 200)?.parentStoryId).toBe(101);
    expect(payload.watching).toHaveLength(2);
    expect(payload.watching.find((item) => item.id === 301)?.projectSlug).toBe('orbit');
    expect(payload.warnings).toEqual([]);
  });

  it('keeps other groups usable when one endpoint is restricted', async () => {
    const promise = firstValueFrom(api.load(7));
    const calls = http.match(() => true);
    expect(calls).toHaveLength(6);
    for (const call of calls) {
      if (call.request.url === '/api/v1/tasks') {
        call.flush(null, { status: 403, statusText: 'Forbidden' });
      } else {
        call.flush([]);
      }
    }
    const payload = await promise;
    expect(payload.assigned).toEqual([]);
    expect(payload.warnings).toContain('Tasks could not be loaded.');
  });

  it('rejects an empty result when every source has failed', async () => {
    const promise = firstValueFrom(api.load(7));
    for (const call of http.match(() => true)) {
      call.flush(null, { status: 503, statusText: 'Offline' });
    }
    await expect(promise).rejects.toThrow('All dashboard requests failed.');
  });
});
