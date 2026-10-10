import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShellProject } from '../project-context/mock-projects';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.project-switcher-compact]': 'compact()' },
  imports: [MatMenuModule, MatTooltipModule, NgTemplateOutlet],
  selector: 'pf-project-switcher',
  styleUrl: './project-switcher.scss',
  templateUrl: './project-switcher.html',
})
export class ProjectSwitcher {
  readonly compact = input(false);
  readonly projects = input.required<readonly ShellProject[]>();
  readonly selectedProject = input.required<ShellProject>();
  readonly projectSelected = output<ShellProject>();
  readonly pinToggled = output<ShellProject>();
  readonly viewAllRequested = output<void>();
  protected readonly pinnedProjects = computed(() =>
    this.projects().filter(({ isPinned }) => isPinned),
  );
  protected readonly otherProjects = computed(() =>
    this.projects().filter(({ isPinned }) => !isPinned),
  );
  private readonly menuTrigger = viewChild.required(MatMenuTrigger);

  protected selectProject(project: ShellProject): void {
    if (project.id !== this.selectedProject().id) {
      this.projectSelected.emit(project);
    }
    this.menuTrigger().closeMenu();
  }

  protected viewAllProjects(): void {
    this.menuTrigger().closeMenu();
    this.viewAllRequested.emit();
  }

  protected togglePin(event: Event, project: ShellProject): void {
    event.stopPropagation();
    this.pinToggled.emit(project);
  }
}
