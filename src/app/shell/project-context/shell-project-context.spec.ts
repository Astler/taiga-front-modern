import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth';
import { ProjectStore, type TaigaProjectDetail } from '../../features/projects/data';
import type { TaigaProjectSummary } from '../../shared/models';
import { ShellProjectContext } from './shell-project-context';

describe('ShellProjectContext', () => {
  const project: TaigaProjectSummary = {
    id: 7,
    slug: 'puzzles-together',
    name: 'Puzzles Together',
    description: 'Puzzles with friends',
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
  };
  const projects = signal<readonly TaigaProjectSummary[]>([project]);
  const selectedProject = signal<TaigaProjectDetail | null>({
    ...project,
    members: [],
    us_statuses: [],
    tags: [],
    tags_colors: {},
  });
  const selectById = vi.fn().mockResolvedValue(selectedProject());
  const togglePin = vi.fn();
  const loadMemberProjects = vi.fn().mockResolvedValue([project]);
  const pinned = signal(true);
  let context: ShellProjectContext;

  beforeEach(() => {
    selectById.mockClear();
    togglePin.mockClear();
    loadMemberProjects.mockClear();
    pinned.set(true);
    TestBed.configureTestingModule({
      providers: [
        ShellProjectContext,
        { provide: AuthService, useValue: { user: signal({ id: 11 }) } },
        {
          provide: ProjectStore,
          useValue: {
            projects,
            selectedProject,
            pinnedProjects: () => (pinned() ? [project] : []),
            unpinnedProjects: () => (pinned() ? [] : [project]),
            loading: signal(false),
            error: signal(null),
            isPinned: () => pinned(),
            loadMemberProjects,
            selectById,
            togglePin,
          },
        },
      ],
    });
    context = TestBed.inject(ShellProjectContext);
  });

  it('maps live Taiga projects to shell presentation data', () => {
    expect(context.projects()[0]).toMatchObject({
      id: 7,
      slug: 'puzzles-together',
      name: 'Puzzles Together',
      code: 'PT',
      isPinned: true,
    });
    expect(context.selectedProject().id).toBe(7);
  });

  it('selects projects through the shared project store', () => {
    context.selectProject(context.projects()[0]!);

    expect(selectById).toHaveBeenCalledWith(7);
  });

  it('toggles a persistent project pin through the store', () => {
    context.togglePin(context.projects()[0]!);

    expect(togglePin).toHaveBeenCalledWith({ id: 7, slug: 'puzzles-together' });
  });
});
