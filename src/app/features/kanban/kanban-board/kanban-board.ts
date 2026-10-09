import { CdkDrag, CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
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
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth';
import type { TaigaId } from '../../../shared/models';
import {
  KanbanStore,
  KanbanFilterPresetsService,
  type KanbanAssignee,
  type KanbanFilterCategory,
  type KanbanFilterClause,
  type KanbanFilterMode,
  type KanbanFilterOption,
  type KanbanFilterPreset,
  type KanbanLane,
  type KanbanProjectSnapshot,
  type KanbanSortMode,
  type KanbanStatus,
  type KanbanUserStory,
} from '../data';

const UNCLASSIFIED_LANE: KanbanLane = { id: null, name: 'Unclassified' };
const ROOT_LANE: KanbanLane = { id: null, name: null };

interface FilterDefinition {
  readonly category: KanbanFilterCategory;
  readonly label: string;
}

interface StoryEditorDraft {
  readonly id: TaigaId;
  readonly subject: string;
  readonly description: string;
  readonly status: TaigaId;
  readonly assignedUsers: readonly TaigaId[];
  readonly milestone: TaigaId | null;
  readonly dueDate: string;
  readonly tags: readonly string[];
  readonly isBlocked: boolean;
  readonly blockedNote: string;
}

const FILTER_DEFINITIONS: readonly FilterDefinition[] = [
  { category: 'tags', label: 'Tags' },
  { category: 'assigned_users', label: 'People' },
  { category: 'role', label: 'Roles' },
  { category: 'milestone', label: 'Releases' },
  { category: 'owner', label: 'Created by' },
  { category: 'epic', label: 'Epics' },
  { category: 'focus', label: 'Focus' },
];

const FOCUS_OPTIONS: readonly KanbanFilterOption[] = [
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'tasks', label: 'Has tasks' },
  { value: 'attachments', label: 'Has attachments' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
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
  styleUrls: ['./kanban-board.scss', './kanban-filter-panel.scss', './kanban-story-drawer.scss'],
  templateUrl: './kanban-board.html',
})
export class KanbanBoard {
  readonly project = input.required<KanbanProjectSnapshot>();
  readonly storyId = input<TaigaId | null>(null);

  protected readonly store = inject(KanbanStore);
  private readonly auth = inject(AuthService);
  private readonly presetApi = inject(KanbanFilterPresetsService);
  protected readonly query = signal('');
  protected readonly sortMode = signal<KanbanSortMode>('manual');
  protected readonly filterPanelOpen = signal(false);
  protected readonly filterClauses = signal<readonly KanbanFilterClause[]>([]);
  protected readonly filterDefinitions = FILTER_DEFINITIONS;
  protected readonly savedPresets = signal<readonly KanbanFilterPreset[]>([]);
  protected readonly presetsLoading = signal(false);
  protected readonly presetsSaving = signal(false);
  protected readonly presetsError = signal<string | null>(null);
  protected readonly presetName = signal('');
  protected readonly presetEditorOpen = signal(false);
  protected readonly quickCreateCell = signal<string | null>(null);
  protected readonly quickCreateDraft = signal('');
  protected readonly activeStory = signal<KanbanUserStory | null>(null);
  protected readonly storyDraft = signal<StoryEditorDraft | null>(null);
  protected readonly storyDraftDirty = signal(false);
  protected readonly liveAnnouncement = signal('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private loadedProjectId: TaigaId | undefined;
  private presetLoadRevision = 0;
  private consumedStoryLink: string | null = null;

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

  protected readonly editorAssignees = computed(() =>
    [...(this.project().members ?? [])].sort((a, b) =>
      this.assigneeName(a).localeCompare(this.assigneeName(b)),
    ),
  );

  protected readonly editorTags = computed(() => {
    const names = new Set(this.project().tags ?? []);
    for (const [name] of this.store.selectedStory()?.tags ?? []) {
      names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  });

  private readonly filterOptionsByCategory = computed(() => {
    const options = new Map<KanbanFilterCategory, readonly KanbanFilterOption[]>();
    const stories = this.store.userStories();
    const remote = this.store.filtersData();

    options.set(
      'tags',
      mergeFilterOptions(
        (remote?.tags ?? []).map((tag) => ({
          value: tag.name ?? '',
          label: tag.name ?? '',
          color: tag.color,
          count: tag.count,
        })),
        stories.flatMap((story) =>
          story.tags.map(([name, color]) => ({ value: name, label: name, color })),
        ),
      ),
    );
    options.set(
      'assigned_users',
      mergeFilterOptions(
        [{ value: 'none', label: 'Unassigned' }],
        this.assignees().map((assignee) => ({
          value: String(assignee.id),
          label: this.assigneeName(assignee),
        })),
      ),
    );
    options.set(
      'role',
      mergeFilterOptions(
        (remote?.roles ?? []).map((role) => ({
          value: role.id === null || role.id === undefined ? 'none' : String(role.id),
          label: role.name || 'No role',
          count: role.count,
        })),
        (this.project().members ?? [])
          .filter(({ role }) => role !== undefined && role !== null)
          .map((member) => ({
            value: String(member.role),
            label: member.role_name || `Role ${member.role}`,
          })),
      ),
    );
    options.set(
      'milestone',
      mergeFilterOptions(
        [{ value: 'none', label: 'No release' }],
        stories
          .filter(({ milestone }) => milestone !== null && milestone !== undefined)
          .map((story) => ({
            value: String(story.milestone),
            label: story.milestone_name || `Release ${story.milestone}`,
          })),
      ),
    );
    options.set(
      'owner',
      mergeFilterOptions(
        (remote?.owners ?? []).map((owner) => ({
          value: owner.id === null || owner.id === undefined ? 'none' : String(owner.id),
          label: owner.full_name || owner.name || 'Unknown creator',
          count: owner.count,
        })),
        stories
          .filter(({ owner }) => owner !== null && owner !== undefined)
          .map((story) => ({
            value: String(story.owner),
            label:
              story.owner_extra_info?.full_name_display ||
              story.owner_extra_info?.username ||
              `User ${story.owner}`,
          })),
      ),
    );
    options.set(
      'epic',
      mergeFilterOptions(
        [{ value: 'none', label: 'Not in an epic' }],
        (remote?.epics ?? []).map((epic) => ({
          value: epic.id === null || epic.id === undefined ? 'none' : String(epic.id),
          label:
            epic.ref === undefined
              ? epic.subject || epic.name || 'Epic'
              : `#${epic.ref} ${epic.subject || epic.name || ''}`.trim(),
          count: epic.count,
        })),
        stories.flatMap((story) =>
          (story.epics ?? []).map((epic) => ({
            value: String(epic.id),
            label:
              epic.ref === undefined
                ? epic.subject || `Epic ${epic.id}`
                : `#${epic.ref} ${epic.subject || ''}`.trim(),
            color: epic.color,
          })),
        ),
      ),
    );
    options.set('focus', FOCUS_OPTIONS);
    return options;
  });

  protected readonly hasActiveFilters = computed(
    () => this.query().trim().length > 0 || this.filterClauses().length > 0,
  );

  protected readonly activeFilterCount = computed(
    () => this.filterClauses().length + (this.query().trim() ? 1 : 0),
  );

  protected readonly canReorder = computed(
    () =>
      this.canModify() &&
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

  protected readonly builtInPresets = computed<readonly KanbanFilterPreset[]>(() => {
    const presets: KanbanFilterPreset[] = [
      { id: 'builtin:all', name: 'All work', query: '', sort: 'manual', filters: [] },
      {
        id: 'builtin:unassigned',
        name: 'Unassigned',
        query: '',
        sort: 'manual',
        filters: [filterClause('focus', 'unassigned', 'Unassigned')],
      },
      {
        id: 'builtin:blocked',
        name: 'Blocked',
        query: '',
        sort: 'manual',
        filters: [filterClause('focus', 'blocked', 'Blocked')],
      },
      {
        id: 'builtin:overdue',
        name: 'Overdue',
        query: '',
        sort: 'due',
        filters: [filterClause('focus', 'overdue', 'Overdue')],
      },
    ];
    const userId = this.auth.user()?.id;
    if (userId !== undefined) {
      presets.splice(1, 0, {
        id: 'builtin:mine',
        name: 'My work',
        query: '',
        sort: 'manual',
        filters: [
          filterClause(
            'assigned_users',
            String(userId),
            this.auth.user()?.full_name_display || 'My work',
          ),
        ],
      });
    }
    return presets;
  });

  protected readonly activePresetId = computed(() => {
    const candidates = [...this.builtInPresets(), ...this.savedPresets()];
    return (
      candidates.find(
        (preset) =>
          preset.query === this.query() &&
          preset.sort === this.sortMode() &&
          clausesEqual(preset.filters, this.filterClauses()),
      )?.id ?? null
    );
  });

  private readonly projectMembersById = computed(
    () => new Map((this.project().members ?? []).map((member) => [member.id, member])),
  );

  protected readonly visibleStories = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    const clauses = this.filterClauses();
    const stories = this.store.userStories().filter((story) => {
      if (query && !matchesStoryQuery(story, query)) {
        return false;
      }
      return this.matchesFilters(story, clauses);
    });
    return sortVisibleStories(stories, this.sortMode());
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
        this.consumedStoryLink = null;
        this.clearFilters();
        this.sortMode.set('manual');
        this.filterPanelOpen.set(false);
        this.presetName.set('');
        this.presetEditorOpen.set(false);
        this.presetsSaving.set(false);
        this.cancelQuickCreate(false);
        this.activeStory.set(null);
        this.store.load(projectId);
        this.loadPresets(projectId);
      });
    });

    effect(() => {
      const story = this.store.selectedStory();
      const dirty = this.storyDraftDirty();
      untracked(() => {
        if (!story) {
          this.storyDraft.set(null);
          this.storyDraftDirty.set(false);
          return;
        }
        if (this.storyDraft()?.id !== story.id || !dirty) {
          this.storyDraft.set(storyDraftFrom(story));
        }
      });
    });

    effect(() => {
      const storyId = this.storyId();
      const projectId = this.project().id;
      const loaded = this.store.status() === 'loaded';
      const stories = this.store.userStories();
      untracked(() => {
        if (storyId === null || !loaded) {
          return;
        }
        const key = `${projectId}:${storyId}`;
        if (this.consumedStoryLink === key) {
          return;
        }
        const story = stories.find(({ id }) => id === storyId);
        if (story) {
          this.consumedStoryLink = key;
          this.openStoryDetails(story);
        }
      });
    });
  }

  protected updateQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected updateSort(event: Event): void {
    this.sortMode.set((event.target as HTMLSelectElement).value as KanbanSortMode);
  }

  protected toggleFilterPanel(): void {
    this.filterPanelOpen.update((open) => !open);
  }

  protected optionsFor(category: KanbanFilterCategory): readonly KanbanFilterOption[] {
    return this.filterOptionsByCategory().get(category) ?? [];
  }

  protected addFilter(category: KanbanFilterCategory, mode: KanbanFilterMode, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    select.value = '';
    if (!value) {
      return;
    }
    const option = this.optionsFor(category).find((candidate) => candidate.value === value);
    if (!option) {
      return;
    }
    this.filterClauses.update((current) => [
      ...current.filter(
        (clause) => !(clause.category === category && clause.value === option.value),
      ),
      filterClause(category, option.value, option.label, mode, option.color),
    ]);
  }

  protected toggleFilterMode(filter: KanbanFilterClause): void {
    this.filterClauses.update((current) =>
      current.map((candidate) =>
        candidate === filter
          ? { ...candidate, mode: candidate.mode === 'include' ? 'exclude' : 'include' }
          : candidate,
      ),
    );
  }

  protected removeFilter(filter: KanbanFilterClause): void {
    this.filterClauses.update((current) => current.filter((candidate) => candidate !== filter));
  }

  protected clearFilters(): void {
    this.query.set('');
    this.filterClauses.set([]);
  }

  protected applyPreset(preset: KanbanFilterPreset): void {
    this.query.set(preset.query);
    this.sortMode.set(preset.sort);
    this.filterClauses.set(preset.filters.map((filter) => ({ ...filter })));
  }

  protected updatePresetName(event: Event): void {
    this.presetName.set((event.target as HTMLInputElement).value);
  }

  protected async savePreset(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.presetName().trim();
    if (!name || this.presetsSaving()) {
      return;
    }
    const current = this.savedPresets();
    const existing = current.find(
      (preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const preset: KanbanFilterPreset = {
      id: existing?.id ?? uniquePresetId(),
      name,
      query: this.query(),
      sort: this.sortMode(),
      filters: this.filterClauses().map((filter) => ({ ...filter })),
    };
    const next = existing
      ? current.map((candidate) => (candidate.id === existing.id ? preset : candidate))
      : [...current, preset];
    this.savedPresets.set(next);
    this.presetName.set('');
    this.presetEditorOpen.set(false);
    await this.persistPresets(next);
  }

  protected async removePreset(preset: KanbanFilterPreset, event: Event): Promise<void> {
    event.stopPropagation();
    const next = this.savedPresets().filter(({ id }) => id !== preset.id);
    this.savedPresets.set(next);
    await this.persistPresets(next);
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
    if (result === 'moved' && this.sortMode() !== 'manual') {
      this.sortMode.set('manual');
    }
  }

  protected selectStory(story: KanbanUserStory): void {
    this.activeStory.set(story);
  }

  protected openStoryDetails(story: KanbanUserStory): void {
    this.storyDraft.set(storyDraftFrom(story));
    this.storyDraftDirty.set(false);
    this.store.openStoryDetails(story.id);
  }

  protected closeStoryDetails(): void {
    const storyId = this.store.selectedStory()?.id;
    this.store.closeStoryDetails();
    if (storyId !== undefined) {
      queueMicrotask(() => {
        const trigger = [
          ...this.host.nativeElement.querySelectorAll<HTMLButtonElement>(
            '[data-story-details-trigger]',
          ),
        ].find((candidate) => candidate.dataset['storyDetailsTrigger'] === String(storyId));
        trigger?.focus();
      });
    }
  }

  protected updateStoryText(
    field: 'subject' | 'description' | 'dueDate' | 'blockedNote',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.patchStoryDraft({ [field]: value });
  }

  protected updateStoryStatus(event: Event): void {
    this.patchStoryDraft({ status: Number((event.target as HTMLSelectElement).value) });
  }

  protected updateStoryMilestone(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.patchStoryDraft({ milestone: value ? Number(value) : null });
  }

  protected toggleStoryAssignee(assigneeId: TaigaId): void {
    const draft = this.storyDraft();
    if (!draft) {
      return;
    }
    const assignedUsers = draft.assignedUsers.includes(assigneeId)
      ? draft.assignedUsers.filter((id) => id !== assigneeId)
      : [...draft.assignedUsers, assigneeId];
    this.patchStoryDraft({ assignedUsers });
  }

  protected toggleStoryTag(tag: string): void {
    const draft = this.storyDraft();
    if (!draft) {
      return;
    }
    const tags = draft.tags.includes(tag)
      ? draft.tags.filter((candidate) => candidate !== tag)
      : [...draft.tags, tag];
    this.patchStoryDraft({ tags });
  }

  protected storyTagColor(tag: string): string {
    return (
      this.store.selectedStory()?.tags.find(([name]) => name === tag)?.[1] ??
      this.project().tags_colors?.[tag] ??
      '#8f8a99'
    );
  }

  protected toggleStoryBlocked(event: Event): void {
    this.patchStoryDraft({ isBlocked: (event.target as HTMLInputElement).checked });
  }

  protected resetStoryDraft(): void {
    const story = this.store.selectedStory();
    if (story) {
      this.storyDraft.set(storyDraftFrom(story));
      this.storyDraftDirty.set(false);
    }
  }

  protected async saveStory(event: Event): Promise<void> {
    event.preventDefault();
    const detail = this.store.selectedStory();
    const draft = this.storyDraft();
    if (!detail || !draft || !this.canModify() || !draft.subject.trim()) {
      return;
    }
    const projectId = this.project().id;
    const result = await this.store.updateStory({
      projectId,
      storyId: detail.id,
      ...(detail.version === undefined ? {} : { version: detail.version }),
      changes: {
        subject: draft.subject.trim(),
        description: draft.description,
        status: draft.status,
        assigned_users: draft.assignedUsers,
        milestone: draft.milestone,
        due_date: draft.dueDate || null,
        tags: draft.tags,
        is_blocked: draft.isBlocked,
        blocked_note: draft.isBlocked ? draft.blockedNote : '',
      },
    });
    if (this.project().id !== projectId) {
      return;
    }
    if (result === 'updated') {
      this.storyDraftDirty.set(false);
      this.liveAnnouncement.set(`Story #${detail.ref} saved.`);
    }
  }

  private patchStoryDraft(changes: Partial<StoryEditorDraft>): void {
    this.storyDraft.update((draft) => (draft ? { ...draft, ...changes } : draft));
    this.storyDraftDirty.set(true);
  }

  protected storyStatus(story: KanbanUserStory): KanbanStatus | null {
    return this.statusById().get(story.status) ?? null;
  }

  protected formatTimestamp(value: string | undefined): string {
    if (!value) {
      return 'Unknown';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(date);
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
    if (result === 'moved' && this.sortMode() !== 'manual') {
      this.sortMode.set('manual');
    }
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

  private matchesFilters(story: KanbanUserStory, clauses: readonly KanbanFilterClause[]): boolean {
    for (const definition of FILTER_DEFINITIONS) {
      const categoryClauses = clauses.filter(({ category }) => category === definition.category);
      const included = categoryClauses.filter(({ mode }) => mode === 'include');
      const excluded = categoryClauses.filter(({ mode }) => mode === 'exclude');
      if (included.length > 0 && !included.some((clause) => this.matchesClause(story, clause))) {
        return false;
      }
      if (excluded.some((clause) => this.matchesClause(story, clause))) {
        return false;
      }
    }
    return true;
  }

  private matchesClause(story: KanbanUserStory, clause: KanbanFilterClause): boolean {
    switch (clause.category) {
      case 'tags':
        return story.tags.some(([name]) => name === clause.value);
      case 'assigned_users': {
        const assigned = [...story.assigned_users];
        if (story.assigned_to !== null && !assigned.includes(story.assigned_to)) {
          assigned.push(story.assigned_to);
        }
        return clause.value === 'none'
          ? assigned.length === 0
          : assigned.includes(Number(clause.value));
      }
      case 'role': {
        const roles = this.storyAssignees(story)
          .map(({ role }) => role)
          .filter((role): role is TaigaId => role !== undefined && role !== null);
        return clause.value === 'none' ? roles.length === 0 : roles.includes(Number(clause.value));
      }
      case 'owner':
        return clause.value === 'none'
          ? story.owner === null || story.owner === undefined
          : story.owner === Number(clause.value);
      case 'epic':
        return clause.value === 'none'
          ? !story.epics?.length
          : (story.epics ?? []).some(({ id }) => id === Number(clause.value));
      case 'milestone':
        return clause.value === 'none'
          ? story.milestone === null || story.milestone === undefined
          : story.milestone === Number(clause.value);
      case 'focus':
        return this.matchesFocus(story, clause.value);
    }
  }

  private matchesFocus(story: KanbanUserStory, value: string): boolean {
    switch (value) {
      case 'unassigned':
        return story.assigned_to === null && story.assigned_users.length === 0;
      case 'blocked':
        return Boolean(story.is_blocked);
      case 'overdue':
        return this.isOverdue(story);
      case 'tasks':
        return Boolean(story.tasks?.length);
      case 'attachments':
        return Boolean(story.total_attachments || story.attachments?.length);
      default:
        return false;
    }
  }

  private loadPresets(projectId: TaigaId): void {
    const revision = ++this.presetLoadRevision;
    this.savedPresets.set([]);
    this.presetsLoading.set(true);
    this.presetsError.set(null);
    firstValueFrom(this.presetApi.load(projectId))
      .then((presets) => {
        if (revision === this.presetLoadRevision && this.project().id === projectId) {
          this.savedPresets.set(presets);
        }
      })
      .catch(() => {
        if (revision === this.presetLoadRevision && this.project().id === projectId) {
          this.presetsError.set('Saved views could not be loaded. Local filtering still works.');
        }
      })
      .finally(() => {
        if (revision === this.presetLoadRevision && this.project().id === projectId) {
          this.presetsLoading.set(false);
        }
      });
  }

  private async persistPresets(presets: readonly KanbanFilterPreset[]): Promise<void> {
    const projectId = this.project().id;
    this.presetsSaving.set(true);
    this.presetsError.set(null);
    try {
      await firstValueFrom(this.presetApi.save(projectId, presets));
    } catch {
      if (this.project().id === projectId) {
        this.presetsError.set('Saved views could not be synced. Try saving again.');
      }
    } finally {
      if (this.project().id === projectId) {
        this.presetsSaving.set(false);
      }
    }
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

function storyDraftFrom(story: KanbanUserStory): StoryEditorDraft {
  const assignedUsers = [...story.assigned_users];
  if (story.assigned_to !== null && !assignedUsers.includes(story.assigned_to)) {
    assignedUsers.unshift(story.assigned_to);
  }
  return {
    id: story.id,
    subject: story.subject,
    description: story.description ?? '',
    status: story.status,
    assignedUsers,
    milestone: story.milestone ?? null,
    dueDate: story.due_date ?? '',
    tags: story.tags.map(([name]) => name),
    isBlocked: story.is_blocked ?? false,
    blockedNote: story.blocked_note ?? '',
  };
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sortVisibleStories(
  stories: readonly KanbanUserStory[],
  mode: KanbanSortMode,
): readonly KanbanUserStory[] {
  const sorted = [...stories];
  sorted.sort((left, right) => {
    let result = 0;
    switch (mode) {
      case 'newest':
        result = compareDateDescending(left.created_date, right.created_date);
        break;
      case 'updated':
        result = compareDateDescending(left.modified_date, right.modified_date);
        break;
      case 'due':
        result = compareNullableText(left.due_date, right.due_date);
        break;
      case 'points':
        result = (right.total_points ?? -1) - (left.total_points ?? -1);
        break;
      case 'title':
        result = left.subject.localeCompare(right.subject);
        break;
      case 'manual':
        break;
    }
    return result || left.kanban_order - right.kanban_order || left.id - right.id;
  });
  return sorted;
}

function compareDateDescending(left: string | undefined, right: string | undefined): number {
  return compareNullableText(right, left);
}

function compareNullableText(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right);
}

function mergeFilterOptions(
  ...collections: readonly (readonly KanbanFilterOption[])[]
): readonly KanbanFilterOption[] {
  const options = new Map<string, KanbanFilterOption>();
  for (const collection of collections) {
    for (const option of collection) {
      if (!option.value || !option.label) {
        continue;
      }
      const existing = options.get(option.value);
      options.set(option.value, {
        ...existing,
        ...option,
        count: option.count ?? existing?.count,
        color: option.color ?? existing?.color,
      });
    }
  }
  return [...options.values()].sort((left, right) => left.label.localeCompare(right.label));
}

function filterClause(
  category: KanbanFilterCategory,
  value: string,
  label: string,
  mode: KanbanFilterMode = 'include',
  color?: string | null,
): KanbanFilterClause {
  return { category, value, label, mode, ...(color === undefined ? {} : { color }) };
}

function clausesEqual(
  left: readonly KanbanFilterClause[],
  right: readonly KanbanFilterClause[],
): boolean {
  const normalize = (clauses: readonly KanbanFilterClause[]) =>
    clauses
      .map(({ category, mode, value }) => `${category}:${mode}:${value}`)
      .sort()
      .join('|');
  return normalize(left) === normalize(right);
}

function uniquePresetId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
