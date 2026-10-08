import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaProjectDetail } from '../../projects/data';

interface ProjectModule {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly enabled: boolean;
}

interface ClassicSettingsLink {
  readonly label: string;
  readonly description: string;
  readonly path: string;
}

const CLASSIC_SETTINGS_LINKS: readonly ClassicSettingsLink[] = [
  {
    label: 'Project details',
    description: 'Name, description, privacy and ownership',
    path: 'admin/project-profile/details',
  },
  {
    label: 'Default values',
    description: 'Defaults used when new work is created',
    path: 'admin/project-profile/default-values',
  },
  {
    label: 'Modules',
    description: 'Enable or disable project workspaces',
    path: 'admin/project-profile/modules',
  },
  {
    label: 'Statuses and workflow',
    description: 'Edit statuses, ordering and WIP limits',
    path: 'admin/project-values/status',
  },
  {
    label: 'Tags',
    description: 'Manage the shared project tag palette',
    path: 'admin/project-values/tags',
  },
  {
    label: 'Members',
    description: 'Invite people and change their roles',
    path: 'admin/memberships',
  },
  {
    label: 'Roles and permissions',
    description: 'Control what each project role can do',
    path: 'admin/roles',
  },
  {
    label: 'Integrations',
    description: 'Webhooks and source control connections',
    path: 'admin/third-parties/webhooks',
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  selector: 'pf-settings-workspace',
  styleUrl: './settings-workspace.scss',
  templateUrl: './settings-workspace.html',
})
export class SettingsWorkspace {
  readonly project = input.required<TaigaProjectDetail>();

  private readonly config = inject(RuntimeConfigService);

  protected readonly classicLinks = computed(() =>
    this.project().archived_code
      ? CLASSIC_SETTINGS_LINKS.filter(
          (link) =>
            link.path === 'admin/project-profile/details' || link.path === 'admin/memberships',
        )
      : CLASSIC_SETTINGS_LINKS,
  );
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

  protected classicSettingsUrl(path: string): string {
    const base = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return `${base}/project/${encodeURIComponent(this.project().slug)}/${path}`;
  }

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
