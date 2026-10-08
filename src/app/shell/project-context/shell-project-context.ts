import { Injectable, signal } from '@angular/core';
import { MOCK_SHELL_PROJECTS, ShellProject } from './mock-projects';

@Injectable()
export class ShellProjectContext {
  readonly projects = MOCK_SHELL_PROJECTS;

  private readonly selectedProjectState = signal<ShellProject>(this.projects[0]!);

  readonly selectedProject = this.selectedProjectState.asReadonly();

  selectProject(project: ShellProject): void {
    const availableProject = this.projects.find(({ id }) => id === project.id);

    if (availableProject) {
      this.selectedProjectState.set(availableProject);
    }
  }
}
