import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth';
import type { ShellProject } from '../../../shell/project-context/mock-projects';
import { ShellProjectContext } from '../../../shell/project-context/shell-project-context';
import type { ProfileWorkItem, ProfileWorkType } from '../data/profile-dashboard.models';
import { ProfileDashboardStore } from '../data/profile-dashboard.store';

type MetricTone = 'primary' | 'tertiary' | 'warning' | 'error';

interface DashboardMetric {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: MetricTone;
}

interface ProjectSummary {
  readonly id: number;
  readonly name: string;
  readonly slug: string | null;
  readonly assigned: number;
  readonly watching: number;
}

const PAGE_SIZE = 10;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  providers: [ProfileDashboardStore],
  selector: 'pf-dashboard-page',
  styleUrl: './dashboard-page.scss',
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  protected readonly context = inject(ShellProjectContext);
  protected readonly store = inject(ProfileDashboardStore);
  private readonly auth = inject(AuthService);

  protected readonly showAllAssigned = signal(false);
  protected readonly showAllWatching = signal(false);

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const user = this.auth.user();
    return `${salutation}, ${user?.full_name_display?.trim().split(/\s+/)[0] || user?.username || 'there'}`;
  });

  protected readonly sortedAssigned = computed(() =>
    [...this.store.assigned()].sort((left, right) =>
      priorityScore(right) - priorityScore(left) ||
      dateValue(right.updatedAt) - dateValue(left.updatedAt),
    ),
  );

  protected readonly visibleAssigned = computed(() =>
    this.showAllAssigned()
      ? this.sortedAssigned()
      : this.sortedAssigned().slice(0, PAGE_SIZE),
  );

  protected readonly visibleWatching = computed(() =>
    this.showAllWatching()
      ? this.store.watching()
      : this.store.watching().slice(0, PAGE_SIZE),
  );

  protected readonly dueSoonCount = computed(() =>
    this.store.assigned().filter((item) => isDueSoon(item)).length,
  );

  protected readonly overdueCount = computed(() =>
    this.store.assigned().filter((item) => this.isOverdue(item)).length,
  );

  protected readonly blockedCount = computed(() =>
    this.store.assigned().filter((item) => item.isBlocked).length,
  );

  protected readonly metrics = computed<readonly DashboardMetric[]>(() => [
    {
      label: 'Working on',
      value: String(this.store.assigned().length),
      detail: 'Open items assigned to you',
      tone: 'primary',
    },
    {
      label: 'Watching',
      value: String(this.store.watching().length),
      detail: 'Following across Taiga',
      tone: 'tertiary',
    },
    {
      label: 'Overdue',
      value: String(this.overdueCount()),
      detail: `${this.dueSoonCount()} due in the next 7 days`,
      tone: 'error',
    },
    {
      label: 'Blocked',
      value: String(this.blockedCount()),
      detail: 'Assigned items needing attention',
      tone: 'warning',
    },
  ]);

  protected readonly recentItems = computed(() => {
    const items = new Map<string, ProfileWorkItem>();
    for (const item of [...this.store.assigned(), ...this.store.watching()]) {
      items.set(`${item.type}:${item.id}`, item);
    }
    return [...items.values()]
      .filter((item) => item.updatedAt !== null)
      .sort((a, b) => dateValue(b.updatedAt) - dateValue(a.updatedAt))
      .slice(0, 8);
  });

  protected readonly projectSummaries = computed<readonly ProjectSummary[]>(() => {
    const known = new Map(this.context.projects().map((project) => [project.id, project]));
    const results = new Map<number, ProjectSummary>();
    for (const [items, type] of [
      [this.store.assigned(), 'assigned'],
      [this.store.watching(), 'watching'],
    ] as const) {
      for (const item of items) {
        if (item.projectId === null) continue;
        const project = known.get(item.projectId);
        const existing = results.get(item.projectId);
        const base: ProjectSummary = existing ?? {
          id: item.projectId,
          name: project?.name ?? item.projectName ?? `Project #${item.projectId}`,
          slug: project?.slug ?? item.projectSlug ?? null,
          assigned: 0,
          watching: 0,
        };
        results.set(item.projectId, { ...base, [type]: base[type] + 1 });
      }
    }
    return [...results.values()].sort(
      (a, b) => b.assigned - a.assigned || b.watching - a.watching || a.name.localeCompare(b.name),
    );
  });

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        if (userId === undefined) this.store.clear();
        else this.store.load(userId);
      });
    });
  }

  protected refresh(): void {
    this.store.refresh();
  }

  protected kindName(type: ProfileWorkType): string {
    switch (type) {
      case 'userstory': return 'Story';
      case 'task': return 'Task';
      case 'issue': return 'Issue';
      case 'epic': return 'Epic';
      case 'project': return 'Project';
    }
  }

  protected projectName(item: ProfileWorkItem): string {
    return this.context.projects().find(({ id }) => id === item.projectId)?.name ??
      item.projectName ?? 'Unknown project';
  }

  protected itemRoute(item: ProfileWorkItem): readonly string[] | null {
    const known = this.context.projects().find(({ id }) => id === item.projectId);
    const slug = item.projectSlug || known?.slug;
    if (!slug) return null;

    if (item.type === 'project') {
      return this.projectRoute(slug);
    }
    const section = item.type === 'issue'
      ? 'issues'
      : item.type === 'epic'
        ? 'epics'
        : 'kanban';
    return ['/project', slug, section];
  }

  protected itemQuery(item: ProfileWorkItem): Readonly<Record<string, string | number>> | null {
    if (item.type === 'userstory') return { story: item.id };
    if (item.type === 'task') {
      return item.parentStoryId === null ? null : { story: item.parentStoryId };
    }
    if (item.type === 'issue' || item.type === 'epic') {
      return { q: item.ref === null ? item.title : `#${item.ref}` };
    }
    return null;
  }

  protected projectRoute(slug: string): readonly string[] {
    const details = this.context.store.projects().find((project) => project.slug === slug);
    const section = details?.is_kanban_activated
      ? 'kanban'
      : details?.is_issues_activated
        ? 'issues'
        : details?.is_epics_activated
          ? 'epics'
          : 'team';
    return ['/project', slug, section];
  }

  protected dateLabel(value: string | null): string {
    if (!value) return '';
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }

  protected isOverdue(item: ProfileWorkItem): boolean {
    return item.dueDate !== null && !item.isClosed && item.dueDate < todayKey();
  }

  protected referenceLabel(item: ProfileWorkItem): string {
    return item.ref === null ? this.kindName(item.type) : `#${item.ref}`;
  }

  protected summaryProject(project: ProjectSummary): ShellProject | undefined {
    return this.context.projects().find(({ id }) => id === project.id);
  }
}

function priorityScore(item: ProfileWorkItem): number {
  if (item.isClosed) return -10;
  const overdue = item.dueDate !== null && item.dueDate < todayKey();
  return (overdue ? 1000 : 0) + (item.isBlocked ? 700 : 0) + (isDueSoon(item) ? 300 : 0);
}

function isDueSoon(item: ProfileWorkItem): boolean {
  if (!item.dueDate || item.isClosed) return false;
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  return item.dueDate >= todayKey() && item.dueDate <= todayKey(nextWeek);
}

function todayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const result = Date.parse(value);
  return Number.isNaN(result) ? 0 : result;
}
