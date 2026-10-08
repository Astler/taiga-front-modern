import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { ProjectStore, type TaigaProjectDetail } from '../../projects/data';
import { IssuesPage } from './issues-page';

describe('IssuesPage', () => {
  it('selects the project named by a deep link before rendering its workspace', async () => {
    const selected = signal<TaigaProjectDetail | null>(null);
    const alpha = project(17, 'alpha');
    const selectBySlug = vi.fn().mockImplementation(async () => {
      selected.set(alpha);
      return alpha;
    });

    await TestBed.configureTestingModule({
      imports: [IssuesPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ projectSlug: 'alpha' })) },
        },
        { provide: AuthService, useValue: { user: signal({ id: 7 }) } },
        {
          provide: ProjectStore,
          useValue: {
            error: signal(null),
            loadMemberProjects: vi.fn(),
            projects: signal([alpha]),
            projectsLoaded: signal(true),
            selectedProject: selected,
            selectBySlug,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(IssuesPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selectBySlug).toHaveBeenCalledWith('alpha');
  });
});

function project(id: number, slug: string): TaigaProjectDetail {
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
    is_issues_activated: false,
    is_epics_activated: true,
    is_wiki_activated: true,
    my_permissions: [],
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
    members: [],
    us_statuses: [],
    tags: [],
    tags_colors: {},
  };
}
