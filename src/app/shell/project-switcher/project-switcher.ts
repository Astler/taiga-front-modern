import { ChangeDetectionStrategy, Component, input, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { ShellProject } from '../project-context/mock-projects';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatMenuModule],
  selector: 'pf-project-switcher',
  styleUrl: './project-switcher.scss',
  templateUrl: './project-switcher.html',
})
export class ProjectSwitcher {
  readonly projects = input.required<readonly ShellProject[]>();
  readonly selectedProject = input.required<ShellProject>();
  readonly projectSelected = output<ShellProject>();
  private readonly menuTrigger = viewChild.required(MatMenuTrigger);

  protected selectProject(project: ShellProject): void {
    if (project.id !== this.selectedProject().id) {
      this.projectSelected.emit(project);
    }
    this.menuTrigger().closeMenu();
  }
}
