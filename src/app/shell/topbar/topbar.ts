import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RuntimeConfigService } from '../../core';
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
  protected readonly legacyUrl = inject(RuntimeConfigService).snapshot().legacyUrl;

  protected selectProject(project: ShellProject): void {
    this.projectContext.selectProject(project);
  }
}
