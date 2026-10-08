import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { AuthService } from '../../core/auth';
import { ProjectStore, type TaigaProjectListItem } from '../../features/projects/data';
import { ShellProject } from './mock-projects';

const PROJECT_ACCENTS = ['#c9b6ff', '#8de7d0', '#ffb4ab', '#b8c4ff', '#ffca86', '#a6d5ff'];
const EMPTY_PROJECT: ShellProject = {
  accent: PROJECT_ACCENTS[0]!,
  code: '–',
  description: 'Your projects will appear here after they load.',
  id: -1,
  isPinned: false,
  logoUrl: null,
  name: 'Loading projects…',
  slug: '',
};

@Injectable()
export class ShellProjectContext {
  private readonly auth = inject(AuthService);
  readonly store = inject(ProjectStore);

  readonly projects = computed(() =>
    this.store.projects().map((project) => this.toShellProject(project)),
  );
  readonly pinnedProjects = computed(() =>
    this.store.pinnedProjects().map((project) => this.toShellProject(project)),
  );
  readonly unpinnedProjects = computed(() =>
    this.store.unpinnedProjects().map((project) => this.toShellProject(project)),
  );
  readonly selectedProject = computed(() => {
    const selected = this.store.selectedProject();
    return selected ? this.toShellProject(selected) : (this.projects()[0] ?? EMPTY_PROJECT);
  });
  readonly loading = this.store.loading;
  readonly error = this.store.error;

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      if (userId === undefined) {
        return;
      }
      untracked(() => {
        void this.store.loadMemberProjects(userId).catch(() => undefined);
      });
    });
  }

  selectProject(project: ShellProject): void {
    if (project.id < 0) {
      return;
    }
    void this.store.selectById(project.id).catch(() => undefined);
  }

  togglePin(project: ShellProject): void {
    if (project.id >= 0) {
      this.store.togglePin({ id: project.id, slug: project.slug });
    }
  }

  private toShellProject(project: TaigaProjectListItem): ShellProject {
    return {
      accent: PROJECT_ACCENTS[Math.abs(project.id) % PROJECT_ACCENTS.length]!,
      code: projectCode(project.name),
      description:
        project.description || (project.is_private ? 'Private project' : 'Public project'),
      id: project.id,
      isPinned: this.store.isPinned(project),
      logoUrl: project.logo_small_url,
      name: project.name,
      slug: project.slug,
    };
  }
}

function projectCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '–';
  }
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase();
}
