import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { CdkScrollable } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
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
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    CdkDropListGroup,
    CdkScrollable,
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  providers: [KanbanStore],
  selector: 'pf-kanban-board',
  styleUrl: './kanban-board.scss',
  templateUrl: './kanban-board.html',
})
export class KanbanBoard {
  readonly project = input.required<KanbanProjectSnapshot>();

  protected readonly store = inject(KanbanStore);
  protected readonly config = inject(RuntimeConfigService);
  protected readonly query = signal('');
  protected readonly selectedTag = signal<string | null>(null);
  protected readonly selectedAssigneeId = signal<TaigaId | null>(null);
  protected readonly quickCreateCell = signal<string | null>(null);
  protected readonly quickCreateDraft = signal('');
  protected readonly activeStory = signal<KanbanUserStory | null>(null);
  protected readonly liveAnnouncement = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private loadedProjectId: TaigaId | undefined;

  protected readonly statuses = computed(() =>
    [...this.project().us_statuses]
      .filter((status) => !status.is_archived)
      .sort((a, b) => a.order - b.order),
  );

  protected readonly canModify = computed(
    () =>
      (this.project().my_permissions ?? []).includes('modify_us') &&
      !this.project().archived_code &&
      !this.project().blocked_code,
  );

  protected readonly canCreate = computed(() => {
    const permissions = this.project().my_permissions ?? [];
    return (
      (permissions.includes('add_us') || permissions.includes('add_us_to_project')) &&
      !this.project().archived_code &&
      !this.project().blocked_code
    );
  });

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

  protected readonly canReorder = computed(
    () =>
      this.canModify() &&
      !this.hasActiveFilters() &&
      !this.store.isMutating() &&
      !this.store.isRefreshing() &&
      !this.store.requiresReconciliation(),
  );

  protected readonly openStoryCount = computed(
    () => this.store.userStories().filter((story) => !this.isStoryClosed(story)).length,
  );

  private readonly statusById = computed(
    () => new Map(this.statuses().map((status) => [status.id, status])),
  );

  protected readonly classicBoardUrl = computed(() => {
    const legacyUrl = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return `${legacyUrl}/project/${encodeURIComponent(this.project().slug)}/kanban`;
  });

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
    const cards = new Map<string, KanbanUserStory[]>();
    for (const story of this.visibleStories()) {
      const key = this.columnKey(story.swimlane, story.status);
      const column = cards.get(key) ?? [];
      column.push(story);
      cards.set(key, column);
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

  private readonly visibleStoryCountByLane = computed(() => {
    const counts = new Map<TaigaId | null, number>();
    for (const story of this.visibleStories()) {
      counts.set(story.swimlane, (counts.get(story.swimlane) ?? 0) + 1);
    }
    return counts;
  });

  private readonly totalStoryCountByLane = computed(() => {
    const counts = new Map<TaigaId | null, number>();
    for (const story of this.store.userStories()) {
      counts.set(story.swimlane, (counts.get(story.swimlane) ?? 0) + 1);
    }
    return counts;
  });

  constructor() {
    effect(() => {
      const projectId = this.project().id;
      untracked(() => {
        if (this.loadedProjectId === projectId) {
          return;
        }

        this.loadedProjectId = projectId;
        this.clearFilters();
        this.cancelQuickCreate(false);
        this.activeStory.set(null);
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

  protected columnStoryCount(laneId: TaigaId | null, statusId: TaigaId): number {
    return this.unfilteredStoryCountByLaneAndStatus().get(this.columnKey(laneId, statusId)) ?? 0;
  }

  protected laneStoryCount(laneId: TaigaId | null, visible: boolean): number {
    return (
      (visible ? this.visibleStoryCountByLane() : this.totalStoryCountByLane()).get(laneId) ?? 0
    );
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
    return limit !== null && this.columnStoryCount(laneId, status.id) > limit;
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

  protected assigneeSummary(story: KanbanUserStory): string {
    const names = this.storyAssignees(story).map((assignee) => this.assigneeName(assignee));
    return names.length > 0 ? `Assigned to ${names.join(', ')}` : 'Unassigned';
  }

  protected storyUrl(story: KanbanUserStory): string {
    const legacyUrl = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return `${legacyUrl}/project/${encodeURIComponent(this.project().slug)}/us/${story.ref}`;
  }

  protected startQuickCreate(laneId: TaigaId | null, statusId: TaigaId): void {
    this.quickCreateCell.set(this.columnKey(laneId, statusId));
    this.quickCreateDraft.set('');
  }

  protected isQuickCreating(laneId: TaigaId | null, statusId: TaigaId): boolean {
    return this.quickCreateCell() === this.columnKey(laneId, statusId);
  }

  protected cellKey(laneId: TaigaId | null, statusId: TaigaId): string {
    return this.columnKey(laneId, statusId);
  }

  protected updateQuickCreateDraft(event: Event): void {
    this.quickCreateDraft.set((event.target as HTMLTextAreaElement).value);
  }

  protected quickCreateKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelQuickCreate();
    }
  }

  protected cancelQuickCreate(restoreFocus = true): void {
    const cell = this.quickCreateCell();
    this.quickCreateCell.set(null);
    this.quickCreateDraft.set('');
    if (restoreFocus && cell) {
      queueMicrotask(() => {
        const trigger = [
          ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
            '[data-quick-create-trigger]',
          ),
        ].find((candidate) => candidate.dataset['quickCreateTrigger'] === cell);
        trigger?.focus();
      });
    }
  }

  protected async submitQuickCreate(
    event: Event,
    laneId: TaigaId | null,
    statusId: TaigaId,
  ): Promise<void> {
    event.preventDefault();
    const subjects = this.quickCreateDraft()
      .split(/\r?\n/)
      .map((subject) => subject.trim())
      .filter(Boolean)
      .join('\n');
    if (!subjects || !this.canCreate()) {
      return;
    }

    const projectId = this.project().id;
    const submittedCell = this.columnKey(laneId, statusId);
    const result = await this.store.createStories({
      projectId,
      statusId,
      swimlaneId: laneId,
      subjects,
    });
    if (this.project().id !== projectId || this.quickCreateCell() !== submittedCell) {
      return;
    }
    if (result === 'created') {
      const count = subjects.split('\n').length;
      this.liveAnnouncement.set(`${count} ${count === 1 ? 'story' : 'stories'} created.`);
      this.cancelQuickCreate();
    } else if (result === 'uncertain') {
      this.liveAnnouncement.set(
        'Taiga did not confirm the new story. Check the synced board before adding it again.',
      );
      this.cancelQuickCreate();
    }
  }

  protected async dropStory(
    event: CdkDragDrop<readonly KanbanUserStory[]>,
    lane: KanbanLane,
    status: KanbanStatus,
  ): Promise<void> {
    if (!this.canReorder() || event.isPointerOverContainer === false) {
      return;
    }

    const story = event.item.data as KanbanUserStory;
    const projectId = this.project().id;
    const currentIndex = this.cardsFor(story.swimlane, story.status).findIndex(
      ({ id }) => id === story.id,
    );
    if (
      story.swimlane === lane.id &&
      story.status === status.id &&
      currentIndex === event.currentIndex
    ) {
      return;
    }

    const destination = this.cardsFor(lane.id, status.id).filter(({ id }) => id !== story.id);
    const destinationIndex = Math.max(0, Math.min(event.currentIndex, destination.length));
    const previousStory = destination[destinationIndex - 1];
    const nextStory = destination[destinationIndex];
    const result = await this.store.moveStory({
      projectId,
      storyId: story.id,
      statusId: status.id,
      swimlaneId: lane.id,
      destinationIndex,
      ...(previousStory ? { afterStoryId: previousStory.id } : {}),
      ...(!previousStory && nextStory ? { beforeStoryId: nextStory.id } : {}),
    });

    if (this.project().id !== projectId) {
      return;
    }
    this.announceMoveResult(result, story, lane, status);
  }

  protected selectStory(story: KanbanUserStory): void {
    this.activeStory.set(story);
  }

  protected async moveActiveStory(lane: KanbanLane, status: KanbanStatus): Promise<void> {
    const story = this.activeStory();
    if (
      !story ||
      !this.canModify() ||
      this.store.isMutating() ||
      this.store.isRefreshing() ||
      this.store.requiresReconciliation()
    ) {
      return;
    }

    const destination = this.store
      .userStories()
      .filter(
        (candidate) =>
          candidate.id !== story.id &&
          candidate.swimlane === lane.id &&
          candidate.status === status.id,
      )
      .sort((left, right) => left.kanban_order - right.kanban_order);
    const previousStory = destination.at(-1);
    const projectId = this.project().id;
    const move = this.store.moveStory({
      projectId,
      storyId: story.id,
      statusId: status.id,
      swimlaneId: lane.id,
      destinationIndex: destination.length,
      ...(previousStory ? { afterStoryId: previousStory.id } : {}),
    });
    this.restoreStoryMenuFocus(story.id);
    const result = await move;

    if (this.project().id !== projectId || this.activeStory()?.id !== story.id) {
      return;
    }
    this.announceMoveResult(result, story, lane, status);
    this.activeStory.set(null);
    this.restoreStoryMenuFocus(story.id);
  }

  protected taskSummary(story: KanbanUserStory): string | null {
    if (!story.tasks?.length) {
      return null;
    }
    return `${story.tasks.filter(({ is_closed }) => is_closed).length}/${story.tasks.length}`;
  }

  protected isOverdue(story: KanbanUserStory): boolean {
    if (!story.due_date || this.isStoryClosed(story)) {
      return false;
    }
    return story.due_date < localDateKey(new Date());
  }

  protected formatDueDate(value: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
  }

  protected refresh(): void {
    this.store.refresh();
  }

  private columnKey(laneId: TaigaId | null, statusId: TaigaId): string {
    return `${laneId ?? 'none'}:${statusId}`;
  }

  private destinationName(lane: KanbanLane, status: KanbanStatus): string {
    return lane.name ? `${lane.name}, ${status.name}` : status.name;
  }

  private announceMoveResult(
    result: 'moved' | 'failed' | 'uncertain',
    story: KanbanUserStory,
    lane: KanbanLane,
    status: KanbanStatus,
  ): void {
    if (result === 'moved') {
      this.liveAnnouncement.set(
        `Story ${story.ref} moved to ${this.destinationName(lane, status)}.`,
      );
    } else if (result === 'uncertain') {
      this.liveAnnouncement.set(
        `Taiga did not confirm the move of story ${story.ref}. Check the synced board before moving it again.`,
      );
    } else {
      this.liveAnnouncement.set(`Story ${story.ref} could not be moved.`);
    }
  }

  private isStoryClosed(story: KanbanUserStory): boolean {
    if (story.tasks?.length) {
      return story.tasks.every(({ is_closed }) => is_closed);
    }
    return this.statusById().get(story.status)?.is_closed ?? story.is_closed;
  }

  private restoreStoryMenuFocus(storyId: TaigaId): void {
    const focusTrigger = () => {
      const trigger = [
        ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>('[data-story-menu-trigger]'),
      ].find((candidate) => candidate.dataset['storyMenuTrigger'] === String(storyId));
      trigger?.focus();
      return trigger !== undefined;
    };

    queueMicrotask(() => {
      if (!focusTrigger()) {
        setTimeout(focusTrigger);
      }
    });
  }
}

function matchesStoryQuery(story: KanbanUserStory, query: string): boolean {
  const reference = String(story.ref);
  const referenceQuery = /^#(\d+)$/.exec(query);
  if (referenceQuery) {
    return reference === referenceQuery[1];
  }
  return reference.includes(query) || story.subject.toLocaleLowerCase().includes(query);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
