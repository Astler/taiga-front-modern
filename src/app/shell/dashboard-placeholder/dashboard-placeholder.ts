import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';
import { RuntimeConfigService } from '../../core/config';
import type { KanbanAssignee, KanbanUserStory } from '../../features/kanban/data';
import type { TaigaId } from '../../shared/models';
import { ShellProjectContext } from '../project-context/shell-project-context';
import type { OverviewMilestone } from './dashboard-overview.models';
import { DashboardOverviewStore } from './dashboard-overview.store';

interface DashboardMetric {
  readonly change: string;
  readonly label: string;
  readonly tone: 'primary' | 'tertiary' | 'warning' | 'error';
  readonly value: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, RouterLink],
  providers: [DashboardOverviewStore],
  selector: 'pf-dashboard-placeholder',
  styleUrl: './dashboard-placeholder.scss',
  templateUrl: './dashboard-placeholder.html',
})
export class DashboardPlaceholder {
  protected readonly projectContext = inject(ShellProjectContext);
  protected readonly store = inject(DashboardOverviewStore);
  private readonly auth = inject(AuthService);
  private readonly config = inject(RuntimeConfigService);

  protected readonly project = computed(() => this.projectContext.store.selectedProject());
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const user = this.auth.user();
    return `${salutation}, ${firstName(user?.full_name_display || user?.username)}`;
  });
  protected readonly metrics = computed<readonly DashboardMetric[]>(() => {
    const stories = this.store.stories();
    const open = stories.filter((story) => !this.isClosed(story));
    const firstOpenStatus = [...(this.project()?.us_statuses ?? [])]
      .filter(({ is_archived, is_closed }) => !is_archived && !is_closed)
      .sort((left, right) => left.order - right.order)[0];
    const inProgress = open.filter((story) => {
      const status = this.status(story.status);
      return status && firstOpenStatus ? status.order > firstOpenStatus.order : false;
    });
    const blocked = open.filter(({ is_blocked }) => is_blocked);
    const overdue = open.filter((story) => this.isOverdue(story));
    const dueSoon = open.filter((story) => this.isDueSoon(story));
    const userId = this.auth.user()?.id;
    const mine = userId === undefined ? [] : open.filter((story) => isAssignedTo(story, userId));

    return [
      {
        change: `${mine.length} assigned to you`,
        label: 'Open stories',
        tone: 'primary',
        value: String(open.length),
      },
      {
        change: `${inProgress.filter((story) => userId !== undefined && isAssignedTo(story, userId)).length} yours`,
        label: 'In progress',
        tone: 'warning',
        value: String(inProgress.length),
      },
      {
        change: blocked.length ? 'Needs a decision' : 'No blockers right now',
        label: 'Blocked',
        tone: 'error',
        value: String(blocked.length),
      },
      {
        change: `${dueSoon.length} due in the next 7 days`,
        label: 'Overdue',
        tone: 'tertiary',
        value: String(overdue.length),
      },
    ];
  });

  protected readonly currentMilestone = computed(() =>
    pickCurrentMilestone(this.store.milestones()),
  );
  protected readonly milestoneStories = computed(() => {
    const milestoneId = this.currentMilestone()?.id;
    return milestoneId === undefined
      ? []
      : this.store.stories().filter(({ milestone }) => milestone === milestoneId);
  });
  protected readonly milestoneCompletion = computed(() => {
    const stories = this.milestoneStories();
    const completed = stories.filter((story) => this.isClosed(story)).length;
    return {
      completed,
      percentage: stories.length ? Math.round((completed / stories.length) * 100) : 0,
      total: stories.length,
    };
  });
  protected readonly focusStories = computed(() => {
    const source = this.milestoneStories().length
      ? this.milestoneStories()
      : this.store.stories().filter((story) => !this.isClosed(story));
    return [...source]
      .filter((story) => !this.isClosed(story))
      .sort((left, right) => this.focusScore(right) - this.focusScore(left))
      .slice(0, 5);
  });
  protected readonly recentStories = computed(() =>
    [...this.store.stories()]
      .filter(({ modified_date }) => Boolean(modified_date))
      .sort((left, right) => timestamp(right.modified_date) - timestamp(left.modified_date))
      .slice(0, 5),
  );

  constructor() {
    effect(() => {
      const projectId = this.project()?.id;
      if (projectId === undefined) {
        return;
      }
      untracked(() => this.store.load(projectId));
    });
  }

  protected refresh(): void {
    this.store.refresh();
  }

  protected statusName(story: KanbanUserStory): string {
    return this.status(story.status)?.name ?? 'Unknown status';
  }

  protected statusColor(story: KanbanUserStory): string {
    return this.status(story.status)?.color ?? '#8f8a99';
  }

  protected focusLabel(story: KanbanUserStory): string {
    if (this.isOverdue(story)) {
      return 'Overdue';
    }
    if (story.is_blocked) {
      return 'Blocked';
    }
    if (story.due_date) {
      return formatShortDate(story.due_date);
    }
    const userId = this.auth.user()?.id;
    if (userId !== undefined && isAssignedTo(story, userId)) {
      return 'Assigned to you';
    }
    return this.statusName(story);
  }

  protected focusDetail(story: KanbanUserStory): string {
    const tasks = story.tasks?.length
      ? `${story.tasks.filter(({ is_closed }) => is_closed).length}/${story.tasks.length} tasks`
      : null;
    return [this.statusName(story), tasks].filter(Boolean).join(' · ');
  }

  protected milestoneRange(milestone: OverviewMilestone): string {
    const start = milestone.estimated_start;
    const finish = milestone.estimated_finish;
    if (start && finish) {
      return `${formatShortDate(start)} – ${formatShortDate(finish)}`;
    }
    return finish
      ? `Ends ${formatShortDate(finish)}`
      : start
        ? `Started ${formatShortDate(start)}`
        : 'Open';
  }

  protected storyUrl(story: KanbanUserStory): string {
    const legacyUrl = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    const slug = this.project()?.slug ?? this.projectContext.selectedProject().slug;
    return `${legacyUrl}/project/${encodeURIComponent(slug)}/us/${story.ref}`;
  }

  protected storyPerson(story: KanbanUserStory): KanbanAssignee | null {
    const memberIds = [
      ...story.assigned_users,
      ...(story.assigned_to === null ? [] : [story.assigned_to]),
    ];
    const member = this.project()?.members.find(({ id }) => memberIds.includes(id));
    return member ?? story.assigned_to_extra_info ?? story.owner_extra_info ?? null;
  }

  protected personName(person: KanbanAssignee | null): string {
    return person?.full_name_display || person?.username || 'Unassigned';
  }

  protected initials(person: KanbanAssignee | null): string {
    return this.personName(person)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  protected relativeTime(value: string | undefined): string {
    if (!value) {
      return '';
    }
    const delta = Math.max(0, Date.now() - timestamp(value));
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 1) {
      return 'now';
    }
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours}h`;
    }
    const days = Math.floor(hours / 24);
    return days < 14 ? `${days}d` : formatShortDate(value);
  }

  protected isOverdue(story: KanbanUserStory): boolean {
    return Boolean(
      story.due_date && !this.isClosed(story) && story.due_date < localDateKey(new Date()),
    );
  }

  private isDueSoon(story: KanbanUserStory): boolean {
    if (!story.due_date || this.isClosed(story)) {
      return false;
    }
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + 7);
    return story.due_date >= localDateKey(today) && story.due_date <= localDateKey(end);
  }

  private isClosed(story: KanbanUserStory): boolean {
    return this.status(story.status)?.is_closed ?? story.is_closed;
  }

  private status(statusId: TaigaId) {
    return this.project()?.us_statuses.find(({ id }) => id === statusId);
  }

  private focusScore(story: KanbanUserStory): number {
    let score = timestamp(story.modified_date) / 1_000_000_000;
    if (this.isOverdue(story)) score += 1_000;
    if (story.is_blocked) score += 800;
    const userId = this.auth.user()?.id;
    if (userId !== undefined && isAssignedTo(story, userId)) score += 300;
    if (story.due_date) score += 100;
    return score;
  }
}

function firstName(fullName: string | undefined): string {
  return fullName?.trim().split(/\s+/)[0] || 'there';
}

function isAssignedTo(story: KanbanUserStory, userId: TaigaId): boolean {
  return story.assigned_to === userId || story.assigned_users.includes(userId);
}

function pickCurrentMilestone(milestones: readonly OverviewMilestone[]): OverviewMilestone | null {
  const open = milestones.filter(({ closed }) => !closed);
  if (!open.length) {
    return null;
  }
  const today = localDateKey(new Date());
  return (
    open.find(
      ({ estimated_start, estimated_finish }) =>
        (!estimated_start || estimated_start <= today) &&
        (!estimated_finish || estimated_finish >= today),
    ) ??
    [...open].sort((left, right) =>
      (left.estimated_finish ?? '9999-12-31').localeCompare(right.estimated_finish ?? '9999-12-31'),
    )[0]!
  );
}

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatShortDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
