import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { ProjectStore, type TaigaProjectDetail } from '../../projects/data';
import { KanbanPage } from './kanban-page';

describe('KanbanPage', () => {
  it('shows an error when a missing deep link loses a race with the member project list', async () => {
    const fallbackProject = projectDetail(1, 'fallback');
    const store = projectStoreStub({
      projects: [fallbackProject],
      selectedProject: fallbackProject,
      selectBySlug: vi.fn().mockRejectedValue(new Error('Not found')),
    });
    await configurePage('missing-project', store);

    const fixture = TestBed.createComponent(KanbanPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Project unavailable');
    expect(fixture.nativeElement.textContent).not.toContain('Loading project');
  });

  it('shows a terminal empty state after an empty member project list loads', async () => {
    const store = projectStoreStub({ projects: [], selectedProject: null });
    await configurePage(null, store);

    const fixture = TestBed.createComponent(KanbanPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('No projects yet');
    expect(fixture.nativeElement.textContent).not.toContain('Loading project');
  });
});

async function configurePage(
  projectSlug: string | null,
  store: ReturnType<typeof projectStoreStub>,
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [KanbanPage],
    providers: [
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap(projectSlug ? { projectSlug } : {})),
        },
      },
      { provide: AuthService, useValue: { user: signal({ id: 7 }) } },
      { provide: ProjectStore, useValue: store },
    ],
  }).compileComponents();
}

function projectStoreStub(options: {
  projects: readonly TaigaProjectDetail[];
  selectedProject: TaigaProjectDetail | null;
  selectBySlug?: ReturnType<typeof vi.fn>;
}) {
  return {
    error: signal(null),
    loadMemberProjects: vi.fn().mockResolvedValue(options.projects),
    loading: signal(false),
    projects: signal(options.projects),
    projectsLoaded: signal(true),
    selectedProject: signal(options.selectedProject),
    selectBySlug: options.selectBySlug ?? vi.fn(),
  };
}

function projectDetail(id: number, slug: string): TaigaProjectDetail {
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
    members: [],
    us_statuses: [],
    tags: [],
    tags_colors: {},
  };
}
