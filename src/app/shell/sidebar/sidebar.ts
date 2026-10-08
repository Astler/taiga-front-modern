import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShellProjectContext } from '../project-context/shell-project-context';

interface NavigationItem {
  readonly iconPath: string;
  readonly label: string;
  readonly route: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDividerModule, MatTooltipModule, RouterLink, RouterLinkActive],
  selector: 'pf-sidebar',
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  readonly navigationSelected = output<void>();
  readonly collapseRequested = output<void>();

  protected readonly projectContext = inject(ShellProjectContext);

  protected readonly primaryNavigation = computed<readonly NavigationItem[]>(() => {
    const projectSlug = this.projectContext.selectedProject().slug;
    return [
      {
        iconPath: 'M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z',
        label: 'Overview',
        route: '/dashboard',
      },
      {
        iconPath: 'M4 5.5h4.5v13H4v-13Zm5.75 0h4.5v13h-4.5v-13Zm5.75 0H20v13h-4.5v-13Z',
        label: 'Kanban',
        route: projectSlug ? `/project/${projectSlug}/kanban` : '/kanban',
      },
      {
        iconPath:
          'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2.5 5h7M8.5 13h5M8.5 17h3',
        label: 'Issues',
        route: '/issues',
      },
      {
        iconPath: 'm12 3 8.5 15H3.5L12 3Zm0 5v4.5m0 3v.2',
        label: 'Epics',
        route: '/epics',
      },
    ];
  });

  protected readonly secondaryNavigation: readonly NavigationItem[] = [
    {
      iconPath:
        'M8.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 19a5.5 5.5 0 0 1 11 0m0-5.5a5 5 0 0 1 7 4.5',
      label: 'Team',
      route: '/team',
    },
    {
      iconPath:
        'M12 3v2m0 14v2M3 12h2m14 0h2M5.64 5.64l1.42 1.42m9.88 9.88 1.42 1.42m0-12.72-1.42 1.42M7.06 16.94l-1.42 1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
      label: 'Settings',
      route: '/settings',
    },
  ];
}
