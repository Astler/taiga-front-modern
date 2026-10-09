import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth';
import { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { ProjectSwitcher } from '../project-switcher/project-switcher';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatMenuModule, MatToolbarModule, MatTooltipModule, ProjectSwitcher],
  selector: 'pf-topbar',
  styleUrl: './topbar.scss',
  templateUrl: './topbar.html',
})
export class Topbar {
  readonly navigationExpanded = input.required<boolean>();
  readonly navigationToggle = output<void>();

  protected readonly projectContext = inject(ShellProjectContext);
  protected readonly auth = inject(AuthService);
  protected readonly profileName = computed(
    () => this.auth.user()?.full_name_display || this.auth.user()?.username || 'Taiga user',
  );
  protected readonly profileInitials = computed(() => initials(this.profileName()));
  private readonly router = inject(Router);

  protected selectProject(project: ShellProject): void {
    this.projectContext.selectProject(project);
    const currentPath = this.router.url.split(/[?#]/, 1)[0] ?? '';
    const projectSection = currentProjectSection(currentPath);
    if (projectSection) {
      void this.router.navigate(['/project', project.slug, projectSection]);
    }
  }

  protected togglePin(project: ShellProject): void {
    this.projectContext.togglePin(project);
  }

  protected logout(): void {
    this.auth.logout();
  }
}

type ProjectSection = 'epics' | 'issues' | 'kanban' | 'settings' | 'team';

function currentProjectSection(path: string): ProjectSection | null {
  const match = /^\/(?:project\/[^/]+\/)?(epics|issues|kanban|settings|team)$/.exec(path);
  return match ? (match[1] as ProjectSection) : null;
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase() || 'T'
  );
}
