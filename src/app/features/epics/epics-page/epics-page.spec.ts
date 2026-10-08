import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { ProjectStore, type TaigaProjectDetail } from '../../projects/data';
import { EpicsPage } from './epics-page';

describe('EpicsPage', () => {
  it('shows a terminal module state when epics are disabled', async () => {
    const selectedProject = project(false);
    await TestBed.configureTestingModule({
      imports: [EpicsPage],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
        { provide: AuthService, useValue: { user: signal({ id: 7 }) } },
        {
          provide: ProjectStore,
          useValue: {
            error: signal(null),
            loadMemberProjects: vi.fn(),
            projects: signal([selectedProject]),
            projectsLoaded: signal(true),
            selectedProject: signal(selectedProject),
            selectBySlug: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(EpicsPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Epics are disabled');
    expect(fixture.nativeElement.textContent).not.toContain('Loading project');
  });
});

function project(epicsEnabled: boolean): TaigaProjectDetail {
  return {
    id: 17,
    slug: 'alpha',
    name: 'Alpha',
    description: '',
    is_private: true,
    i_am_member: true,
    i_am_admin: false,
    i_am_owner: false,
    is_backlog_activated: true,
    is_kanban_activated: true,
    is_issues_activated: true,
    is_epics_activated: epicsEnabled,
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
