import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import type { ShellProject } from '../../../shell/project-context/mock-projects';
import { ShellProjectContext } from '../../../shell/project-context/shell-project-context';
import type { TaigaProjectListItem } from '../data';
import { ProjectsPage } from './projects-page';

const projects: readonly ShellProject[] = [
  {
    id: 1, name: 'Aurora', slug: 'aurora', description: 'Platform work',
    accent: '#c9b6ff', code: 'AU', logoUrl: null, isPinned: true,
  },
  {
    id: 2, name: 'Orbit', slug: 'orbit', description: 'Release operations',
    accent: '#8de7d0', code: 'OR', logoUrl: null, isPinned: false,
  },
];

const details: readonly TaigaProjectListItem[] = projects.map((project) => ({
  id: project.id,
  name: project.name,
  slug: project.slug,
  description: project.description,
  is_private: project.id === 1,
  i_am_member: true,
  i_am_admin: false,
  i_am_owner: false,
  is_backlog_activated: true,
  is_kanban_activated: project.id === 1,
  is_issues_activated: true,
  is_epics_activated: false,
  is_wiki_activated: false,
  my_permissions: [],
  blocked_code: null,
  archived_code: null,
  logo_small_url: null,
}));

describe('ProjectsPage', () => {
  const shown = signal<readonly ShellProject[]>(projects);
  const raw = signal<readonly TaigaProjectListItem[]>(details);
  const loading = signal(false);
  const loaded = signal(true);
  const error = signal<{ operation: 'list'; cause: Error } | null>(null);
  const togglePin = vi.fn();
  const reload = vi.fn();

  beforeEach(async () => {
    shown.set(projects);
    raw.set(details);
    loading.set(false);
    loaded.set(true);
    error.set(null);
    togglePin.mockReset();
    reload.mockReset();
    reload.mockResolvedValue(details);

    await TestBed.configureTestingModule({
      imports: [ProjectsPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal({ id: 17 }) } },
        {
          provide: ShellProjectContext,
          useValue: {
            projects: shown.asReadonly(),
            selectedProject: signal(projects[0]),
            loading: loading.asReadonly(),
            error: error.asReadonly(),
            store: {
              projects: raw.asReadonly(),
              projectsLoaded: loaded.asReadonly(),
              loadMemberProjects: reload,
            },
            togglePin,
          },
        },
      ],
    }).compileComponents();
  });

  it('lists real projects and opens their supported workspaces', () => {
    const fixture = TestBed.createComponent(ProjectsPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.project-card')).toHaveLength(2);
    expect(host.querySelector('[data-testid="open-project-aurora"]')?.getAttribute('href')).toBe(
      '/project/aurora/kanban',
    );
    expect(host.querySelector('[data-testid="open-project-orbit"]')?.getAttribute('href')).toBe(
      '/project/orbit/issues',
    );
  });

  it('searches, filters pinned projects, and uses the existing pin store', () => {
    const fixture = TestBed.createComponent(ProjectsPage);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('input[aria-label="Search projects"]')!;
    search.value = 'release';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.querySelectorAll('.project-card')).toHaveLength(1);

    search.value = '';
    search.dispatchEvent(new Event('input'));
    host.querySelectorAll<HTMLButtonElement>('.project-scopes button')[1]!.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.project-card')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('[data-testid="pin-project-aurora"]')!.click();
    expect(togglePin).toHaveBeenCalled();
  });

  it('shows empty and failed states separately', () => {
    shown.set([]);
    raw.set([]);
    const fixture = TestBed.createComponent(ProjectsPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No projects yet');

    loaded.set(false);
    error.set({ operation: 'list', cause: new Error('offline') });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Projects unavailable');
  });
});
