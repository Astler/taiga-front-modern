import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import {
  CompactKanbanToolbarService,
  type CompactKanbanToolbar,
} from '../../shared/compact-kanban-toolbar.service';
import { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { ProjectSwitcher } from '../project-switcher/project-switcher';
import { TopbarNotification, TopbarNotificationsService } from './topbar-notifications.service';
import {
  EMPTY_TOPBAR_SEARCH_RESULTS,
  TopbarSearchService,
  type TopbarSearchItem,
} from './topbar-search.service';

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
  protected readonly searchQuery = signal('');
  protected readonly searchResults = signal(EMPTY_TOPBAR_SEARCH_RESULTS);
  protected readonly searchStatus = signal<SearchStatus>('idle');
  protected readonly searchOpen = signal(false);
  protected readonly searchResultCount = computed(() => {
    const results = this.searchResults();
    return (
      this.projectSearchMatches().length +
      results.userstories.length +
      results.issues.length +
      results.epics.length
    );
  });
  protected readonly projectSearchMatches = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    if (query.length < 2) {
      return [];
    }
    return this.projectContext
      .projects()
      .filter(
        ({ name, description }) =>
          name.toLocaleLowerCase().includes(query) ||
          description.toLocaleLowerCase().includes(query),
      )
      .slice(0, 4);
  });
  protected readonly compactKanbanToolbar = inject(CompactKanbanToolbarService);
  protected readonly compactMode = this.compactKanbanToolbar.compactMode;
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
  protected readonly searchPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 6,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -6,
    },
  ];
  private readonly router = inject(Router);
  private readonly notificationsApi = inject(TopbarNotificationsService);
  private readonly searchApi = inject(TopbarSearchService);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRevision = 0;
  private searchProjectId: number | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelSearchTimer());

    effect(() => {
      const projectId = this.projectContext.selectedProject().id;
      untracked(() => {
        if (this.searchProjectId === projectId) {
          return;
        }
        this.searchProjectId = projectId;
        this.resetGlobalSearch();
      });
    });

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
      this.closeGlobalSearch();
      this.refreshNotifications();
    }
  }

  protected closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  protected toggleCompactMode(): void {
    this.compactKanbanToolbar.toggleCompactMode();
  }

  protected openGlobalSearch(): void {
    this.closeNotifications();
    this.searchOpen.set(true);
  }

  protected closeGlobalSearch(): void {
    this.searchOpen.set(false);
  }

  protected updateGlobalSearch(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);
    this.closeNotifications();
    this.searchOpen.set(true);
    this.cancelSearchTimer();
    ++this.searchRevision;

    if (query.trim().length < 2) {
      this.searchResults.set(EMPTY_TOPBAR_SEARCH_RESULTS);
      this.searchStatus.set('idle');
      return;
    }

    this.searchStatus.set('loading');
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.runGlobalSearch();
    }, 220);
  }

  protected submitGlobalSearch(event: Event): void {
    event.preventDefault();
    this.cancelSearchTimer();
    this.runGlobalSearch();
  }

  protected handleGlobalSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeGlobalSearch();
    }
  }

  protected retryGlobalSearch(): void {
    this.runGlobalSearch();
  }

  protected openSearchProject(project: ShellProject): void {
    this.projectContext.selectProject(project);
    this.resetGlobalSearch();
    void this.router.navigate(['/project', project.slug, 'kanban']);
  }

  protected openSearchItem(kind: 'epic' | 'issue' | 'userstory', item: TopbarSearchItem): void {
    const project = this.projectContext.selectedProject();
    const reference = item.ref ? `#${item.ref}` : item.subject || '';
    this.resetGlobalSearch();

    if (kind === 'userstory') {
      void this.router.navigate(['/project', project.slug, 'kanban'], {
        queryParams: { story: item.id },
      });
      return;
    }
    void this.router.navigate(['/project', project.slug, kind === 'issue' ? 'issues' : 'epics'], {
      queryParams: { q: reference },
    });
  }

  protected searchItemTitle(item: TopbarSearchItem): string {
    return [item.ref ? `#${item.ref}` : '', item.subject || item.slug || 'Untitled item']
      .filter(Boolean)
      .join(' ');
  }

  protected updateCompactKanbanQuery(toolbar: CompactKanbanToolbar, event: Event): void {
    toolbar.setQuery((event.target as HTMLInputElement).value);
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

  private runGlobalSearch(): void {
    const query = this.searchQuery().trim();
    const projectId = this.projectContext.selectedProject().id;
    if (query.length < 2 || projectId < 0) {
      this.searchStatus.set('idle');
      return;
    }

    const revision = ++this.searchRevision;
    this.searchStatus.set('loading');
    void firstValueFrom(this.searchApi.search(projectId, query))
      .then((results) => {
        if (revision !== this.searchRevision) {
          return;
        }
        this.searchResults.set(results);
        this.searchStatus.set('loaded');
      })
      .catch(() => {
        if (revision === this.searchRevision) {
          this.searchResults.set(EMPTY_TOPBAR_SEARCH_RESULTS);
          this.searchStatus.set('error');
        }
      });
  }

  private resetGlobalSearch(): void {
    this.cancelSearchTimer();
    ++this.searchRevision;
    this.searchQuery.set('');
    this.searchResults.set(EMPTY_TOPBAR_SEARCH_RESULTS);
    this.searchStatus.set('idle');
    this.searchOpen.set(false);
  }

  private cancelSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
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
}

type NotificationsStatus = 'error' | 'idle' | 'loaded' | 'loading';
type SearchStatus = 'error' | 'idle' | 'loaded' | 'loading';

interface NotificationProjectView {
  readonly accent: string;
  readonly code: string;
  readonly logoUrl: string | null;
  readonly name: string;
  readonly slug: string;
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
