import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import type { ShellProject } from '../../../shell/project-context/mock-projects';
import { ShellProjectContext } from '../../../shell/project-context/shell-project-context';
import type { TaigaProjectListItem } from '../data';

type ProjectScope = 'all' | 'pinned';
type ProjectSort = 'user-order' | 'name';

interface ProjectCard extends ShellProject {
  readonly details: TaigaProjectListItem | undefined;
}

interface ProjectGroup {
  readonly key: string;
  readonly title: string;
  readonly items: readonly ProjectCard[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  selector: 'pf-projects-page',
  styleUrl: './projects-page.scss',
  templateUrl: './projects-page.html',
})
export class ProjectsPage {
  protected readonly context = inject(ShellProjectContext);
  private readonly auth = inject(AuthService);

  protected readonly search = signal('');
  protected readonly scope = signal<ProjectScope>('all');
  protected readonly sort = signal<ProjectSort>('user-order');

  protected readonly allProjects = computed<readonly ProjectCard[]>(() => {
    const details = new Map(this.context.store.projects().map((project) => [project.id, project]));
    return this.context.projects().map((project) => ({
      ...project,
      details: details.get(project.id),
    }));
  });

  protected readonly pinnedCount = computed(
    () => this.allProjects().filter((project) => project.isPinned).length,
  );

  protected readonly filtered = computed<readonly ProjectCard[]>(() => {
    const query = this.search().trim().toLocaleLowerCase();
    const pinnedOnly = this.scope() === 'pinned';
    const projects = this.allProjects().filter((project) => {
      if (pinnedOnly && !project.isPinned) {
        return false;
      }
      return !query ||
        (project.name + ' ' + project.slug + ' ' + project.description)
          .toLocaleLowerCase()
          .includes(query);
    });
    return this.sort() === 'name'
      ? [...projects].sort((left, right) => left.name.localeCompare(right.name))
      : projects;
  });

  protected readonly groups = computed<readonly ProjectGroup[]>(() => {
    const pinned = this.filtered().filter((project) => project.isPinned);
    const others = this.filtered().filter((project) => !project.isPinned);
    return [
      { key: 'pinned', title: 'Pinned', items: pinned },
      { key: 'other', title: pinned.length ? 'Other projects' : 'All projects', items: others },
    ].filter(({ items }) => items.length > 0);
  });

  protected readonly listError = computed(() => this.context.error()?.operation === 'list');

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected setScope(scope: ProjectScope): void {
    this.scope.set(scope);
  }

  protected updateSort(event: Event): void {
    this.sort.set((event.target as HTMLSelectElement).value as ProjectSort);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.scope.set('all');
  }

  protected refresh(): void {
    const userId = this.auth.user()?.id;
    if (userId !== undefined) {
      void this.context.store.loadMemberProjects(userId).catch(() => undefined);
    }
  }

  protected togglePin(project: ProjectCard): void {
    this.context.togglePin(project);
  }

  protected projectRoute(project: ProjectCard): readonly string[] {
    const details = project.details;
    const section = details?.is_kanban_activated
      ? 'kanban'
      : details?.is_issues_activated
        ? 'issues'
        : details?.is_epics_activated
          ? 'epics'
          : 'team';
    return ['/project', project.slug, section];
  }

  protected moduleLabels(project: ProjectCard): readonly string[] {
    const details = project.details;
    return [
      ...(details?.is_kanban_activated ? ['Kanban'] : []),
      ...(details?.is_backlog_activated ? ['Backlog'] : []),
      ...(details?.is_issues_activated ? ['Issues'] : []),
      ...(details?.is_epics_activated ? ['Epics'] : []),
      ...(details?.is_wiki_activated ? ['Wiki'] : []),
    ].slice(0, 3);
  }
}
