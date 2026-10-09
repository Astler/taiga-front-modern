import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth';
import type { KanbanUserStory } from '../../features/kanban/data';
import type { TaigaProjectDetail } from '../../features/projects/data';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { DashboardOverviewApiService } from './dashboard-overview-api.service';
import { DashboardPlaceholder } from './dashboard-placeholder';

describe('DashboardPlaceholder', () => {
  const load = vi.fn();
  const selectedProject = signal<TaigaProjectDetail | null>(project());

  beforeEach(async () => {
    load.mockReset();
    selectedProject.set(project());
    load.mockReturnValue(
      of({
        milestones: [
          {
            id: 4,
            name: 'October release',
            estimated_start: '2026-10-01',
            estimated_finish: '2026-10-31',
            closed: false,
          },
        ],
        stories: stories(),
      }),
    );

    await TestBed.configureTestingModule({
      imports: [DashboardPlaceholder],
      providers: [
        provideRouter([]),
        {
          provide: DashboardOverviewApiService,
          useValue: { load },
        },
        {
          provide: AuthService,
          useValue: {
            user: signal({
              id: 7,
              username: 'vlady',
              full_name_display: 'Vlady Pressf',
              photo: null,
            }),
          },
        },
        {
          provide: ShellProjectContext,
          useValue: {
            store: { selectedProject },
            selectedProject: () => ({
              accent: '#c9b6ff',
              code: 'PT',
              description: 'Puzzle production',
              id: 17,
              isPinned: true,
              logoUrl: null,
              name: 'Puzzles Together',
              slug: 'puzzles-together',
            }),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders a live project summary instead of preview content', async () => {
    const fixture = TestBed.createComponent(DashboardPlaceholder);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(load).toHaveBeenCalledWith(17);
    expect(host.querySelector('h1')?.textContent).toContain('Vlady');
    expect(host.textContent).toContain('Live data');
    expect(host.textContent).not.toContain('Preview data');
    expect(metric(host, 'Open stories')).toContain('2');
    expect(metric(host, 'In progress')).toContain('1');
    expect(metric(host, 'Blocked')).toContain('1');
    expect(metric(host, 'Overdue')).toContain('1');
    expect(host.querySelector('.focus-card h2')?.textContent).toContain('October release');
    expect(host.querySelector('.progress-copy')?.textContent).toContain('1 of 3 stories');
    expect(host.querySelector('.progress-copy')?.textContent).toContain('33%');
    expect(host.querySelector('.activity-list')?.textContent).toContain('Fix release blocker');
    expect(host.querySelector<HTMLAnchorElement>('.activity-title')?.href).toContain(
      '/project/puzzles-together/kanban?story=',
    );
  });

  it('falls back to a priority queue when the project has no active milestone', async () => {
    load.mockReturnValue(of({ milestones: [], stories: stories() }));
    const fixture = TestBed.createComponent(DashboardPlaceholder);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.focus-card h2')?.textContent).toContain('What needs attention');
    expect(host.textContent).toContain('No active milestone');
    expect(host.querySelector('.focus-list')?.textContent).toContain('Fix release blocker');
  });
});

function metric(host: HTMLElement, label: string): string {
  const card = [...host.querySelectorAll<HTMLElement>('.metric-card')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(card).toBeTruthy();
  return card!.textContent ?? '';
}

function project(): TaigaProjectDetail {
  return {
    id: 17,
    slug: 'puzzles-together',
    name: 'Puzzles Together',
    description: 'Puzzle production',
    is_private: true,
    i_am_member: true,
    i_am_admin: true,
    i_am_owner: true,
    is_backlog_activated: true,
    is_kanban_activated: true,
    is_issues_activated: true,
    is_epics_activated: true,
    is_wiki_activated: true,
    my_permissions: [],
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
    members: [
      {
        id: 7,
        username: 'vlady',
        full_name_display: 'Vlady Pressf',
        photo: null,
      },
      {
        id: 8,
        username: 'milka',
        full_name_display: 'Milka',
        photo: null,
      },
    ],
    us_statuses: [
      {
        id: 1,
        name: 'New',
        color: '#7f7a8c',
        order: 1,
        is_closed: false,
        is_archived: false,
        wip_limit: null,
      },
      {
        id: 2,
        name: 'In progress',
        color: '#ff9b55',
        order: 2,
        is_closed: false,
        is_archived: false,
        wip_limit: null,
      },
      {
        id: 3,
        name: 'Done',
        color: '#38cf8f',
        order: 3,
        is_closed: true,
        is_archived: false,
        wip_limit: null,
      },
    ],
    tags: [],
    tags_colors: {},
  };
}

function stories(): readonly KanbanUserStory[] {
  return [
    story(101, 'Prepare release notes', 1, false, 7, '2099-10-15', '2026-10-07T10:00:00Z'),
    story(102, 'Fix release blocker', 2, true, 8, '2000-01-01', '2026-10-09T08:00:00Z'),
    story(103, 'Ship release', 3, false, 7, null, '2026-10-08T12:00:00Z'),
  ];
}

function story(
  id: number,
  subject: string,
  status: number,
  blocked: boolean,
  assignee: number,
  dueDate: string | null,
  modifiedDate: string,
): KanbanUserStory {
  return {
    id,
    ref: id,
    subject,
    project: 17,
    status,
    swimlane: null,
    kanban_order: id,
    is_closed: status === 3,
    is_blocked: blocked,
    assigned_to: assignee,
    assigned_users: [assignee],
    assigned_to_extra_info: null,
    tags: [],
    milestone: 4,
    due_date: dueDate,
    modified_date: modifiedDate,
  };
}
