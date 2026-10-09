import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth';
import { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { ProjectSwitcher } from '../project-switcher/project-switcher';
import { TopbarNotification, TopbarNotificationsService } from './topbar-notifications.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatMenuModule,
    MatToolbarModule,
    MatTooltipModule,
    OverlayModule,
    ProjectSwitcher,
  ],
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
  protected readonly notifications = signal<readonly TopbarNotification[]>([]);
  protected readonly notificationsTotal = signal(0);
  protected readonly notificationsStatus = signal<NotificationsStatus>('idle');
  protected readonly notificationsOpen = signal(false);
  protected readonly compactMode = signal(readCompactMode());
  protected readonly notificationPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ];
  private readonly router = inject(Router);
  private readonly notificationsApi = inject(TopbarNotificationsService);
  private readonly document = inject(DOCUMENT);

  constructor() {
    this.applyCompactMode(this.compactMode());
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        if (userId === undefined) {
          this.notifications.set([]);
          this.notificationsTotal.set(0);
          this.notificationsStatus.set('idle');
          return;
        }
        this.loadNotifications();
      });
    });
  }

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

  protected refreshNotifications(): void {
    this.loadNotifications(true);
  }

  protected toggleNotifications(): void {
    const open = !this.notificationsOpen();
    this.notificationsOpen.set(open);
    if (open) {
      this.refreshNotifications();
    }
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected toggleCompactMode(): void {
    const compact = !this.compactMode();
    this.compactMode.set(compact);
    this.applyCompactMode(compact);
    persistCompactMode(compact);
  }

  protected handleNotificationsKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeNotifications();
    }
  }

  protected notificationTitle(notification: TopbarNotification): string {
    const actor = notification.data?.user?.name || notification.data?.user?.username || 'Someone';
    const object = notificationObjectLabel(notification);

    switch (notification.event_type) {
      case 1:
        return `${actor} assigned you to ${object}`;
      case 2:
        return `${actor} mentioned you in ${object}`;
      case 3:
        return `${actor} added you as a watcher of ${object}`;
      case 4:
        return `${actor} added you to ${notification.data?.project?.name || 'a project'}`;
      case 5:
        return `${actor} commented on ${object}`;
      case 6:
        return `${actor} mentioned you in a comment on ${object}`;
      default:
        return `${actor} updated ${object}`;
    }
  }

  protected notificationKind(notification: TopbarNotification): string {
    switch (notification.event_type) {
      case 1:
        return 'Assignment';
      case 2:
        return 'Mention';
      case 3:
        return 'Watching';
      case 4:
        return 'Project invite';
      case 5:
        return 'Comment';
      case 6:
        return 'Comment mention';
      default:
        return 'Update';
    }
  }

  protected notificationAction(notification: TopbarNotification): string {
    switch (notification.event_type) {
      case 1:
        return 'assigned this item to you';
      case 2:
        return 'mentioned you in the description';
      case 3:
        return 'added you as a watcher';
      case 4:
        return 'added you to this project';
      case 5:
        return 'left a new comment';
      case 6:
        return 'mentioned you in a comment';
      default:
        return 'updated this item';
    }
  }

  protected notificationActor(notification: TopbarNotification): string {
    return notification.data?.user?.name || notification.data?.user?.username || 'Someone';
  }

  protected notificationObjectTitle(notification: TopbarNotification): string {
    return notificationObjectLabel(notification);
  }

  protected notificationObjectMeta(notification: TopbarNotification): string {
    const contentType = notification.data?.obj?.content_type;
    if (!contentType) {
      return 'Project activity';
    }
    return contentType === 'userstory'
      ? 'User story'
      : contentType.charAt(0).toLocaleUpperCase() + contentType.slice(1);
  }

  protected notificationProject(notification: TopbarNotification): NotificationProjectView {
    const source = notification.data?.project;
    const knownProject = this.projectContext
      .projects()
      .find(({ id, slug }) => id === source?.id || slug === source?.slug);
    if (knownProject) {
      return knownProject;
    }

    const name = source?.name || 'Unknown project';
    return {
      accent: '#c9b6ff',
      code: initials(name),
      logoUrl: source?.logo_small_url || null,
      name,
      slug: source?.slug || '',
    };
  }

  protected notificationInitials(notification: TopbarNotification): string {
    return initials(notification.data?.user?.name || notification.data?.user?.username || 'Taiga');
  }

  protected notificationTime(notification: TopbarNotification): string {
    return relativeTime(notification.created);
  }

  protected openNotification(notification: TopbarNotification): void {
    this.closeNotifications();
    this.markNotificationRead(notification);

    const projectSlug = notification.data?.project?.slug;
    if (!projectSlug) {
      return;
    }

    const project = this.projectContext.projects().find(({ slug }) => slug === projectSlug);
    if (project) {
      this.projectContext.selectProject(project);
    }

    const object = notification.data?.obj;
    const contentType = object?.content_type?.toLocaleLowerCase();
    if (contentType === 'issue') {
      void this.router.navigate(['/project', projectSlug, 'issues']);
      return;
    }
    if (contentType === 'epic') {
      void this.router.navigate(['/project', projectSlug, 'epics']);
      return;
    }
    if (contentType === 'userstory' && object?.id) {
      void this.router.navigate(['/project', projectSlug, 'kanban'], {
        queryParams: { story: object.id },
      });
      return;
    }
    void this.router.navigate(['/project', projectSlug, 'kanban']);
  }

  protected openNotificationProject(notification: TopbarNotification): void {
    this.closeNotifications();
    this.markNotificationRead(notification);
    const projectSlug = notification.data?.project?.slug;
    if (!projectSlug) {
      return;
    }
    const project = this.projectContext.projects().find(({ slug }) => slug === projectSlug);
    if (project) {
      this.projectContext.selectProject(project);
    }
    void this.router.navigate(['/project', projectSlug, 'kanban']);
  }

  protected markAllNotificationsRead(event: Event): void {
    event.stopPropagation();
    if (this.notificationsTotal() === 0) {
      return;
    }
    this.notifications.set([]);
    this.notificationsTotal.set(0);
    void firstValueFrom(this.notificationsApi.markAllAsRead()).catch(() => {
      this.loadNotifications(true);
    });
  }

  private loadNotifications(force = false): void {
    if (this.notificationsStatus() === 'loading') {
      return;
    }
    if (!force && this.notificationsStatus() === 'loaded') {
      return;
    }

    this.notificationsStatus.set('loading');
    void firstValueFrom(this.notificationsApi.listUnread())
      .then((response) => {
        const notifications = Array.isArray(response.objects) ? response.objects : [];
        this.notifications.set(notifications);
        this.notificationsTotal.set(Math.max(response.total || 0, notifications.length));
        this.notificationsStatus.set('loaded');
      })
      .catch(() => {
        this.notificationsStatus.set('error');
      });
  }

  private removeNotification(notificationId: number): void {
    this.notifications.update((notifications) =>
      notifications.filter(({ id }) => id !== notificationId),
    );
    this.notificationsTotal.update((total) => Math.max(0, total - 1));
  }

  private markNotificationRead(notification: TopbarNotification): void {
    this.removeNotification(notification.id);
    void firstValueFrom(this.notificationsApi.markAsRead(notification.id)).catch(() => {
      this.loadNotifications(true);
    });
  }

  private applyCompactMode(compact: boolean): void {
    this.document.documentElement.setAttribute(
      'data-ui-density',
      compact ? 'compact' : 'comfortable',
    );
  }
}

type NotificationsStatus = 'error' | 'idle' | 'loaded' | 'loading';

interface NotificationProjectView {
  readonly accent: string;
  readonly code: string;
  readonly logoUrl: string | null;
  readonly name: string;
  readonly slug: string;
}

const COMPACT_MODE_STORAGE_KEY = 'taiga-modern:compact-mode';

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

function notificationObjectLabel(notification: TopbarNotification): string {
  const object = notification.data?.obj;
  const reference = object?.ref ? `#${object.ref}` : '';
  const subject = object?.subject?.trim() || '';
  return [reference, subject].filter(Boolean).join(' ') || 'an item';
}

function relativeTime(value?: string): string {
  if (!value) {
    return '';
  }
  const created = new Date(value);
  const elapsed = Date.now() - created.getTime();
  if (!Number.isFinite(elapsed)) {
    return '';
  }
  if (elapsed < 60_000) {
    return 'Now';
  }
  if (elapsed < 3_600_000) {
    return `${Math.floor(elapsed / 60_000)} min`;
  }
  if (elapsed < 86_400_000) {
    return `${Math.floor(elapsed / 3_600_000)} hr`;
  }
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(created);
}

function readCompactMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(COMPACT_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistCompactMode(compact: boolean): void {
  try {
    globalThis.localStorage?.setItem(COMPACT_MODE_STORAGE_KEY, String(compact));
  } catch {
    // Density remains available for the current session when storage is unavailable.
  }
}
