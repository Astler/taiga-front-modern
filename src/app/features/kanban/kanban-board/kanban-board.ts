import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import {
  KanbanStore,
  type KanbanAssignee,
  type KanbanLane,
  type KanbanProjectSnapshot,
  type KanbanStatus,
  type KanbanUserStory,
} from '../data';

const UNCLASSIFIED_LANE: KanbanLane = { id: null, name: 'Unclassified' };
const ROOT_LANE: KanbanLane = { id: null, name: null };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, MatTooltipModule],
  providers: [KanbanStore],
  selector: 'pf-kanban-board',
  styleUrl: './kanban-board.scss',
  templateUrl: './kanban-board.html',
})
export class KanbanBoard {
  readonly project = input.required<KanbanProjectSnapshot>();

  protected readonly store = inject(KanbanStore);
  protected readonly query = signal('');
  protected readonly selectedTag = signal<string | null>(null);
  protected readonly selectedAssigneeId = signal<TaigaId | null>(null);
  private loadedProjectId: TaigaId | undefined;

  protected readonly statuses = computed(() =>
    [...this.project().us_statuses]
      .filter((status) => !status.is_archived)
      .sort((a, b) => a.order - b.order),
  );

  protected readonly tags = computed(() => {
    const tags = new Map<string, string>();
    for (const story of this.store.userStories()) {
      for (const [name] of story.tags ?? []) {
        tags.set(name.toLocaleLowerCase(), name);
      }
    }
    return [...tags.values()].sort((a, b) => a.localeCompare(b));
  });

  protected readonly assignees = computed(() => {
    const assignees = new Map<TaigaId, KanbanAssignee>();
    const assignedIds = new Set(
      this.store
        .userStories()
        .flatMap((story) => [
          ...story.assigned_users,
          ...(story.assigned_to ? [story.assigned_to] : []),
        ]),
    );
    for (const member of this.project().members ?? []) {
      if (assignedIds.has(member.id)) {
        assignees.set(member.id, member);
      }
    }
    for (const story of this.store.userStories()) {
      if (story.assigned_to_extra_info) {
        assignees.set(story.assigned_to_extra_info.id, story.assigned_to_extra_info);
      }
    }
    return [...assignees.values()].sort((a, b) =>
      this.assigneeName(a).localeCompare(this.assigneeName(b)),
    );
  });

  protected readonly hasActiveFilters = computed(
    () =>
      this.query().trim().length > 0 ||
      this.selectedTag() !== null ||
      this.selectedAssigneeId() !== null,
  );

  private readonly projectMembersById = computed(
    () => new Map((this.project().members ?? []).map((member) => [member.id, member])),
  );

  protected readonly visibleStories = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const tag = this.selectedTag();
    const assigneeId = this.selectedAssigneeId();

    return this.store.userStories().filter((story) => {
      if (query && !matchesStoryQuery(story, query)) {
        return false;
      }
      if (tag && !(story.tags ?? []).some(([storyTag]) => storyTag === tag)) {
        return false;
      }
      if (
        assigneeId !== null &&
        story.assigned_to !== assigneeId &&
        !story.assigned_users.includes(assigneeId)
      ) {
        return false;
      }
      return true;
    });
  });

  protected readonly lanes = computed<readonly KanbanLane[]>(() => {
    const swimlanes = this.store.swimlanes();
    if (swimlanes.length === 0) {
      return [ROOT_LANE];
    }

    const lanes: KanbanLane[] = swimlanes.map(({ id, name }) => ({ id, name }));
    if (this.store.userStories().some(({ swimlane }) => swimlane === null)) {
      lanes.unshift(UNCLASSIFIED_LANE);
    }
    return lanes;
  });

  private readonly cardsByLaneAndStatus = computed(() => {
    const cards = new Map<string, readonly KanbanUserStory[]>();
    for (const lane of this.lanes()) {
      for (const status of this.statuses()) {
        cards.set(
          this.columnKey(lane.id, status.id),
          this.visibleStories().filter(
            (story) => story.status === status.id && story.swimlane === lane.id,
          ),
        );
      }
    }
    return cards;
  });

  private readonly unfilteredStoryCountByLaneAndStatus = computed(() => {
    const counts = new Map<string, number>();
    for (const story of this.store.userStories()) {
      const key = this.columnKey(story.swimlane, story.status);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly config = inject(RuntimeConfigService);

  constructor() {
    effect(() => {
      const projectId = this.project().id;
      untracked(() => {
        if (this.loadedProjectId === projectId) {
          return;
        }

        this.loadedProjectId = projectId;
        this.clearFilters();
        this.store.load(projectId);
      });
    });
  }

  protected updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected updateTag(event: Event): void {
    this.selectedTag.set((event.target as HTMLSelectElement).value || null);
  }

  protected updateAssignee(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedAssigneeId.set(value ? Number(value) : null);
  }

  protected clearFilters(): void {
    this.query.set('');
    this.selectedTag.set(null);
    this.selectedAssigneeId.set(null);
  }

  protected cardsFor(laneId: TaigaId | null, statusId: TaigaId): readonly KanbanUserStory[] {
    return this.cardsByLaneAndStatus().get(this.columnKey(laneId, statusId)) ?? [];
  }

  protected wipLimit(status: KanbanStatus, laneId: TaigaId | null): number | null {
    if (laneId !== null) {
      const laneStatus = this.store
        .swimlanes()
        .find(({ id }) => id === laneId)
        ?.statuses?.find(({ id: statusId }) => statusId === status.id);
      if (laneStatus?.wip_limit !== undefined) {
        return laneStatus.wip_limit;
      }
    }
    return status.wip_limit ?? null;
  }

  protected isOverWipLimit(status: KanbanStatus, laneId: TaigaId | null): boolean {
    const limit = this.wipLimit(status, laneId);
    const storyCount =
      this.unfilteredStoryCountByLaneAndStatus().get(this.columnKey(laneId, status.id)) ?? 0;
    return limit !== null && storyCount > limit;
  }

  protected assigneeName(assignee: KanbanAssignee): string {
    return assignee.full_name_display || assignee.username;
  }

  protected assigneeInitials(assignee: KanbanAssignee): string {
    return this.assigneeName(assignee)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  protected storyAssignees(story: KanbanUserStory): readonly KanbanAssignee[] {
    const assignedIds = [...story.assigned_users];
    if (story.assigned_to !== null && !assignedIds.includes(story.assigned_to)) {
      assignedIds.unshift(story.assigned_to);
    }
    const assignees = assignedIds
      .map((id) => this.projectMembersById().get(id))
      .filter((member): member is KanbanAssignee => member !== undefined);

    const legacyAssignee = story.assigned_to_extra_info;
    if (
      legacyAssignee &&
      assignedIds.includes(legacyAssignee.id) &&
      !assignees.some(({ id }) => id === legacyAssignee.id)
    ) {
      assignees.unshift(legacyAssignee);
    }
    return assignees;
  }

  protected storyUrl(story: KanbanUserStory): string {
    const legacyUrl = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return `${legacyUrl}/project/${encodeURIComponent(this.project().slug)}/us/${story.ref}`;
  }

  private columnKey(laneId: TaigaId | null, statusId: TaigaId): string {
    return `${laneId ?? 'none'}:${statusId}`;
  }
}

function matchesStoryQuery(story: KanbanUserStory, query: string): boolean {
  const reference = String(story.ref);
  const referenceQuery = /^#(\d+)$/.exec(query);
  if (referenceQuery) {
    return reference.includes(referenceQuery[1]!);
  }
  return reference.includes(query) || story.subject.toLocaleLowerCase().includes(query);
}
