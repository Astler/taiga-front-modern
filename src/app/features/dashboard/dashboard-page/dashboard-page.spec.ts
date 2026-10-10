import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import type { ProfileWorkItem } from '../data/profile-dashboard.models';
import { ProfileDashboardApiService } from '../data/profile-dashboard-api.service';
import { ShellProjectContext } from '../../../shell/project-context/shell-project-context';
import { DashboardPage } from './dashboard-page';

const myStory: ProfileWorkItem = {
  id: 101, ref: 42, type: 'userstory', projectId: 17, projectSlug: 'aurora',
  projectName: 'Aurora', title: 'Finish dashboard', statusName: 'In progress',
  statusColor: '#8de7d0', isClosed: false, isBlocked: true,
  dueDate: '2000-01-01', updatedAt: '2026-10-08T10:00:00Z', parentStoryId: null,
};
const task: ProfileWorkItem = {
  ...myStory,
  id: 202, type: 'task', projectId: 24, projectSlug: 'orbit',
  projectName: 'Orbit', title: 'QA smoke test', parentStoryId: 201, isBlocked: false,
  dueDate: null, updatedAt: '2026-10-09T10:00:00Z',
};
const watching: ProfileWorkItem = {
  ...myStory,
  id: 303, type: 'issue', projectId: 24, projectSlug: 'orbit',
  projectName: 'Orbit', title: 'Tracked issue', isBlocked: false, dueDate: null,
};

describe('DashboardPage', () => {
  const user = signal({ id: 7, username: 'vlady', full_name_display: 'Vlady PressF' });
  const load = vi.fn();

  beforeEach(async () => {
    load.mockReset();
    load.mockReturnValue(of({ assigned: [myStory, task], watching: [watching], warnings: [] }));

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: ProfileDashboardApiService, useValue: { load } },
        {
          provide: ShellProjectContext,
          useValue: {
            projects: signal([
              { id: 17, slug: 'aurora', name: 'Aurora' },
              { id: 24, slug: 'orbit', name: 'Orbit' },
            ]),
            store: {
              projects: signal([
                { id: 17, slug: 'aurora', is_kanban_activated: true },
                { id: 24, slug: 'orbit', is_issues_activated: true },
              ]),
            },
          },
        },
      ],
    }).compileComponents();
  });

  it('loads by authenticated user rather than the selected project', async () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(load).toHaveBeenCalledWith(7);
    expect(host.querySelector('h1')?.textContent).toContain('Vlady');
    expect(host.textContent).toContain('Aurora');
    expect(host.textContent).toContain('Orbit');
    expect(host.querySelector('#assigned-title')?.textContent).toBe('Working on');
    expect(host.querySelector('#watching-title')?.textContent).toBe('Watching');
    expect(host.querySelector('.metric-card[data-tone="error"]')?.textContent).toContain('1');
    expect(host.querySelector('.metric-card[data-tone="warning"]')?.textContent).toContain('1');
  });

  it('links a story to the native editor and tasks to their parent board story', async () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const story = [...host.querySelectorAll<HTMLAnchorElement>('.work-title')]
      .find((link) => link.textContent?.includes('Finish dashboard'));
    const taskLink = [...host.querySelectorAll<HTMLAnchorElement>('.work-title')]
      .find((link) => link.textContent?.includes('QA smoke test'));

    expect(story?.getAttribute('href')).toContain('/project/aurora/kanban?story=101');
    expect(taskLink?.getAttribute('href')).toContain('/project/orbit/kanban?story=201');
  });
});
