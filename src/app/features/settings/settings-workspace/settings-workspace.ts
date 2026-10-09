import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { TaigaProjectDetail } from '../../projects/data';

interface ProjectModule {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  selector: 'pf-settings-workspace',
  styleUrl: './settings-workspace.scss',
  templateUrl: './settings-workspace.html',
})
export class SettingsWorkspace {
  readonly project = input.required<TaigaProjectDetail>();

  protected readonly canAdminister = computed(
    () => this.project().i_am_admin || this.project().i_am_owner,
  );
  protected readonly accessLabel = computed(() => {
    const project = this.project();
    if (project.i_am_owner) {
      return 'Project owner';
    }
    if (project.i_am_admin) {
      return 'Project admin';
    }
    if (project.i_am_member) {
      return 'Project member';
    }
    return 'Read-only guest';
  });
  protected readonly modules = computed<readonly ProjectModule[]>(() => {
    const project = this.project();
    return [
      {
        key: 'backlog',
        label: 'Backlog',
        description: 'Prioritised stories and sprint planning',
        enabled: project.is_backlog_activated,
      },
      {
        key: 'kanban',
        label: 'Kanban',
        description: 'Visual flow across story statuses',
        enabled: project.is_kanban_activated,
      },
      {
        key: 'issues',
        label: 'Issues',
        description: 'Bugs, requests and operational work',
        enabled: project.is_issues_activated,
      },
      {
        key: 'epics',
        label: 'Epics',
        description: 'Large initiatives spanning stories',
        enabled: project.is_epics_activated,
      },
      {
        key: 'wiki',
        label: 'Wiki',
        description: 'Shared project documentation',
        enabled: project.is_wiki_activated,
      },
    ];
  });
  protected readonly enabledModuleCount = computed(
    () => this.modules().filter((module) => module.enabled).length,
  );
  protected readonly activeStatuses = computed(() =>
    this.project()
      .us_statuses.filter((status) => !status.is_archived)
      .sort((left, right) => left.order - right.order),
  );
  protected readonly archivedStatusCount = computed(
    () => this.project().us_statuses.filter((status) => status.is_archived).length,
  );
  protected readonly visiblePermissions = computed(() => this.project().my_permissions.slice(0, 8));
  protected readonly hiddenPermissionCount = computed(() =>
    Math.max(0, this.project().my_permissions.length - this.visiblePermissions().length),
  );

  protected ownerName(): string {
    const owner = this.project().owner;
    return owner?.full_name_display || owner?.username || 'Not included in this project response';
  }

  protected permissionLabel(permission: string): string {
    return permission.replaceAll('_', ' ').replace(/^\w/, (letter) => letter.toLocaleUpperCase());
  }

  protected tagColor(tag: string): string {
    return this.project().tags_colors[tag] || '#8f8a99';
  }
}
