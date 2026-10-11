import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, type ParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth';
import { DashboardPlaceholder } from '../../shell/dashboard-placeholder/dashboard-placeholder';
import type { TaigaProjectDetail } from '../projects/data';
import { ProjectStore } from '../projects/data';
import { ProjectDashboardPage } from './project-dashboard-page';

@Component({
  selector: 'pf-dashboard-placeholder',
  template: '<div class="restored-project-dashboard">Original live project overview</div>',
})
class OverviewStub {}

describe('ProjectDashboardPage', () => {
  const params = new Subject<ParamMap>();
  const selectedProject = signal<TaigaProjectDetail | null>(null);
  const projectList = signal<readonly TaigaProjectDetail[]>([]);
  const projectsLoaded = signal(false);
  const error = signal<{ operation: 'select'; cause: Error } | null>(null);
  const selectBySlug = vi.fn<(slug: string) => Promise<TaigaProjectDetail>>();
  const loadMemberProjects = vi.fn();

  beforeEach(async () => {
    selectedProject.set(null);
    projectList.set([]);
    projectsLoaded.set(false);
    error.set(null);
    selectBySlug.mockReset().mockImplementation(async (slug) => makeProject(slug));
    loadMemberProjects.mockReset();

    TestBed.overrideComponent(ProjectDashboardPage, {
      remove: { imports: [DashboardPlaceholder] },
      add: { imports: [OverviewStub] },
    });

    await TestBed.configureTestingModule({
      imports: [ProjectDashboardPage],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        { provide: AuthService, useValue: { user: signal({ id: 7 }) } },
        {
          provide: ProjectStore,
          useValue: {
            selectedProject: selectedProject.asReadonly(),
            projects: projectList.asReadonly(),
            projectsLoaded: projectsLoaded.asReadonly(),
            error: error.asReadonly(),
            selectBySlug,
            loadMemberProjects,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the original project overview only after the requested slug has loaded', () => {
    const fixture = TestBed.createComponent(ProjectDashboardPage);
    fixture.detectChanges();
    params.next(convertToParamMap({ projectSlug: 'puzzles-together' }));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(selectBySlug).toHaveBeenCalledWith('puzzles-together');
    expect(host.textContent).toContain('Loading project overview');
    expect(host.querySelector('pf-dashboard-placeholder')).toBeNull();

    selectedProject.set(makeProject('puzzles-together'));
    fixture.detectChanges();
    expect(host.querySelector('.restored-project-dashboard')).toBeTruthy();
  });

  it('does not render the wrong project while switching between project dashboards', () => {
    const fixture = TestBed.createComponent(ProjectDashboardPage);
    params.next(convertToParamMap({ projectSlug: 'alpha' }));
    selectedProject.set(makeProject('alpha'));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('pf-dashboard-placeholder')).toBeTruthy();

    params.next(convertToParamMap({ projectSlug: 'beta' }));
    fixture.detectChanges();
    expect(selectBySlug).toHaveBeenLastCalledWith('beta');
    expect(host.querySelector('pf-dashboard-placeholder')).toBeNull();

    selectedProject.set(makeProject('beta'));
    fixture.detectChanges();
    expect(host.querySelector('pf-dashboard-placeholder')).toBeTruthy();
  });

  it('allows retry after the project cannot be found', async () => {
    selectBySlug.mockRejectedValueOnce(new Error('Not found'));
    const fixture = TestBed.createComponent(ProjectDashboardPage);
    params.next(convertToParamMap({ projectSlug: 'missing' }));
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Project unavailable');
    host.querySelector<HTMLButtonElement>('.project-state button')!.click();
    expect(selectBySlug).toHaveBeenCalledTimes(2);
    expect(selectBySlug).toHaveBeenLastCalledWith('missing');
  });
});

function makeProject(slug: string): TaigaProjectDetail {
  return {
    id: slug === 'beta' ? 2 : 1,
    name: slug,
    slug,
    description: '',
    is_private: false,
    i_am_member: true,
    i_am_admin: false,
    i_am_owner: false,
    is_backlog_activated: true,
    is_kanban_activated: true,
    is_issues_activated: true,
    is_epics_activated: true,
    is_wiki_activated: true,
    my_permissions: [],
    archived_code: null,
    blocked_code: null,
    logo_small_url: null,
    members: [],
    us_statuses: [],
    tags: [],
    tags_colors: {},
  };
}
