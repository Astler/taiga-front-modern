import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize, firstValueFrom } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { KanbanApiService } from './kanban-api.service';
import type {
  KanbanCreateRequest,
  KanbanAttachmentUploadRequest,
  KanbanFiltersData,
  KanbanMilestone,
  KanbanMoveCommand,
  KanbanOrderUpdate,
  KanbanSwimlane,
  KanbanUserStory,
  KanbanStoryUpdateRequest,
} from './kanban.models';

export type KanbanLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type KanbanCreateResult = 'created' | 'failed' | 'uncertain';
export type KanbanMoveResult = 'moved' | 'failed' | 'uncertain';
export type KanbanUpdateResult = 'updated' | 'failed' | 'uncertain';
export type KanbanAttachmentResult = 'deleted' | 'uploaded' | 'failed';
export type KanbanStoryDetailStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface KanbanMutation {
  readonly kind: 'attachment' | 'create' | 'move' | 'update';
  readonly storyIds: readonly TaigaId[];
}

@Injectable()
export class KanbanStore {
  private readonly api = inject(KanbanApiService);
  private readonly projectIdState = signal<TaigaId | null>(null);
  private readonly statusState = signal<KanbanLoadStatus>('idle');
  private readonly userStoriesState = signal<readonly KanbanUserStory[]>([]);
  private readonly swimlanesState = signal<readonly KanbanSwimlane[]>([]);
  private readonly filtersDataState = signal<KanbanFiltersData | null>(null);
  private readonly milestonesState = signal<readonly KanbanMilestone[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly mutationState = signal<KanbanMutation | null>(null);
  private readonly mutationErrorState = signal<string | null>(null);
  private readonly lastSyncedAtState = signal<Date | null>(null);
  private readonly refreshingState = signal(false);
  private readonly requiresReconciliationState = signal(false);
  private readonly selectedStoryState = signal<KanbanUserStory | null>(null);
  private readonly selectedStoryStatusState = signal<KanbanStoryDetailStatus>('idle');
  private readonly selectedStoryErrorState = signal<string | null>(null);
  private requestRevision = 0;
  private mutationRevision = 0;
  private storyDetailRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly userStories = this.userStoriesState.asReadonly();
  readonly swimlanes = this.swimlanesState.asReadonly();
  readonly filtersData = this.filtersDataState.asReadonly();
  readonly milestones = this.milestonesState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly mutation = this.mutationState.asReadonly();
  readonly mutationError = this.mutationErrorState.asReadonly();
  readonly lastSyncedAt = this.lastSyncedAtState.asReadonly();
  readonly isRefreshing = this.refreshingState.asReadonly();
  readonly requiresReconciliation = this.requiresReconciliationState.asReadonly();
  readonly selectedStory = this.selectedStoryState.asReadonly();
  readonly selectedStoryStatus = this.selectedStoryStatusState.asReadonly();
  readonly selectedStoryError = this.selectedStoryErrorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly isMutating = computed(() => this.mutationState() !== null);

  load(projectId: TaigaId, force = false): void {
    if (!force && this.projectIdState() === projectId && this.statusState() !== 'error') {
      return;
    }

    const revision = ++this.requestRevision;
    ++this.mutationRevision;
    this.projectIdState.set(projectId);
    this.statusState.set('loading');
    this.errorState.set(null);
    this.userStoriesState.set([]);
    this.swimlanesState.set([]);
    this.filtersDataState.set(null);
    this.milestonesState.set([]);
    this.mutationState.set(null);
    this.mutationErrorState.set(null);
    this.refreshingState.set(false);
    this.requiresReconciliationState.set(false);
    this.closeStoryDetails();

    this.api
      .load(projectId)
      .pipe(
        finalize(() => {
          if (revision === this.requestRevision && this.statusState() === 'loading') {
            this.statusState.set('loaded');
          }
        }),
      )
      .subscribe({
        next: ({ filtersData, milestones, swimlanes, userStories }) => {
          if (revision !== this.requestRevision) {
            return;
          }
          this.swimlanesState.set([...swimlanes].sort((a, b) => a.order - b.order));
          this.filtersDataState.set(filtersData ?? null);
          this.milestonesState.set(milestones ?? []);
          this.userStoriesState.set(
            [...userStories].sort((a, b) => a.kanban_order - b.kanban_order),
          );
          this.lastSyncedAtState.set(new Date());
          this.statusState.set('loaded');
        },
        error: () => {
          if (revision !== this.requestRevision) {
            return;
          }
          this.errorState.set('The board could not be loaded. Check the connection and try again.');
          this.statusState.set('error');
        },
      });
  }

  retry(): void {
    const projectId = this.projectIdState();
    if (projectId !== null) {
      this.load(projectId, true);
    }
  }

  refresh(): void {
    const projectId = this.projectIdState();
    if (
      projectId === null ||
      this.statusState() !== 'loaded' ||
      this.isMutating() ||
      this.refreshingState()
    ) {
      return;
    }

    const revision = ++this.requestRevision;
    const reconcilingWrite = this.requiresReconciliationState();
    this.refreshingState.set(true);
    if (!reconcilingWrite) {
      this.mutationErrorState.set(null);
    }
    this.api
      .load(projectId)
      .pipe(
        finalize(() => {
          if (revision === this.requestRevision) {
            this.refreshingState.set(false);
          }
        }),
      )
      .subscribe({
        next: ({ filtersData, milestones, swimlanes, userStories }) => {
          if (revision !== this.requestRevision || this.projectIdState() !== projectId) {
            return;
          }
          this.swimlanesState.set([...swimlanes].sort((a, b) => a.order - b.order));
          this.filtersDataState.set(filtersData ?? this.filtersDataState());
          this.milestonesState.set(milestones ?? this.milestonesState());
          this.userStoriesState.set(sortStories(userStories));
          this.lastSyncedAtState.set(new Date());
          this.requiresReconciliationState.set(false);
          if (reconcilingWrite) {
            this.mutationErrorState.set(null);
          }
        },
        error: () => {
          if (revision === this.requestRevision && this.projectIdState() === projectId) {
            this.mutationErrorState.set(
              reconcilingWrite
                ? 'The last write is still unverified. Refresh successfully before creating or moving another story.'
                : 'The latest board state could not be loaded. Your current view was kept.',
            );
          }
        },
      });
  }

  async moveStory(command: KanbanMoveCommand): Promise<KanbanMoveResult> {
    if (
      this.projectIdState() !== command.projectId ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState() ||
      !this.userStoriesState().some(({ id }) => id === command.storyId)
    ) {
      return 'failed';
    }

    const snapshot = this.userStoriesState();
    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'move', storyIds: [command.storyId] });
    this.mutationErrorState.set(null);
    this.userStoriesState.set(moveStoryOptimistically(snapshot, command));

    try {
      const updates = await firstValueFrom(
        this.api.moveUserStories({
          projectId: command.projectId,
          statusId: command.statusId,
          swimlaneId: command.swimlaneId,
          storyIds: [command.storyId],
          ...(command.afterStoryId === undefined ? {} : { afterStoryId: command.afterStoryId }),
          ...(command.beforeStoryId === undefined ? {} : { beforeStoryId: command.beforeStoryId }),
        }),
      );
      if (!this.isCurrentMutation(revision, command.projectId)) {
        return 'failed';
      }
      this.applyOrderUpdates(updates);
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      this.refresh();
      return 'moved';
    } catch (error: unknown) {
      const ambiguous = isAmbiguousMutationFailure(error);
      if (!this.isCurrentMutation(revision, command.projectId)) {
        return 'failed';
      }
      this.userStoriesState.set(snapshot);
      this.mutationState.set(null);
      if (ambiguous) {
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm that move. The board is syncing before you try again.',
        );
        this.refresh();
      } else {
        this.mutationErrorState.set(
          'That story could not be moved. The board was restored to its previous order.',
        );
      }
      return ambiguous ? 'uncertain' : 'failed';
    }
  }

  async createStories(request: KanbanCreateRequest): Promise<KanbanCreateResult> {
    if (
      this.projectIdState() !== request.projectId ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState() ||
      request.subjects.trim().length === 0
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'create', storyIds: [] });
    this.mutationErrorState.set(null);
    try {
      const stories = await firstValueFrom(this.api.createUserStories(request));
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.userStoriesState.update((current) => sortStories([...current, ...stories]));
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      this.refresh();
      return 'created';
    } catch (error: unknown) {
      const ambiguous = isAmbiguousMutationFailure(error);
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.mutationState.set(null);
      if (ambiguous) {
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the new story. The board is syncing to prevent a duplicate.',
        );
        this.refresh();
      } else {
        this.mutationErrorState.set(
          'The new story could not be created. Check its title and try again.',
        );
      }
      return ambiguous ? 'uncertain' : 'failed';
    }
  }

  async updateStory(request: KanbanStoryUpdateRequest): Promise<KanbanUpdateResult> {
    if (
      this.projectIdState() !== request.projectId ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState() ||
      request.changes.subject.trim().length === 0
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'update', storyIds: [request.storyId] });
    this.mutationErrorState.set(null);
    try {
      const updated = await firstValueFrom(this.api.updateUserStory(request));
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.userStoriesState.update((stories) =>
        sortStories(
          stories.map((story) => (story.id === request.storyId ? { ...story, ...updated } : story)),
        ),
      );
      if (this.selectedStoryState()?.id === request.storyId) {
        this.selectedStoryState.update((story) => (story ? { ...story, ...updated } : story));
        this.selectedStoryStatusState.set('loaded');
      }
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'updated';
    } catch (error: unknown) {
      const ambiguous = isAmbiguousMutationFailure(error);
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.mutationState.set(null);
      if (ambiguous) {
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the story update. The board is syncing before another change.',
        );
        this.refresh();
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.mutationErrorState.set(
          'This story changed elsewhere. Reopen it to load the latest version before saving again.',
        );
      } else {
        this.mutationErrorState.set(
          'The story could not be saved. Review the fields and try again.',
        );
      }
      return ambiguous ? 'uncertain' : 'failed';
    }
  }

  async uploadAttachment(request: KanbanAttachmentUploadRequest): Promise<KanbanAttachmentResult> {
    if (
      this.projectIdState() !== request.projectId ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'attachment', storyIds: [request.storyId] });
    this.mutationErrorState.set(null);
    try {
      const attachment = await firstValueFrom(this.api.uploadAttachment(request));
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.userStoriesState.update((stories) =>
        stories.map((story) =>
          story.id === request.storyId
            ? {
                ...story,
                attachments: [...(story.attachments ?? []), attachment],
                total_attachments: (story.total_attachments ?? story.attachments?.length ?? 0) + 1,
              }
            : story,
        ),
      );
      if (this.selectedStoryState()?.id === request.storyId) {
        this.selectedStoryState.update((story) =>
          story
            ? {
                ...story,
                attachments: [...(story.attachments ?? []), attachment],
                total_attachments: (story.total_attachments ?? story.attachments?.length ?? 0) + 1,
              }
            : story,
        );
      }
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'uploaded';
    } catch {
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.mutationState.set(null);
      this.mutationErrorState.set(`“${request.file.name}” could not be uploaded.`);
      return 'failed';
    }
  }

  async deleteAttachment(
    projectId: TaigaId,
    storyId: TaigaId,
    attachmentId: TaigaId,
  ): Promise<KanbanAttachmentResult> {
    if (
      this.projectIdState() !== projectId ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'attachment', storyIds: [storyId] });
    this.mutationErrorState.set(null);
    try {
      await firstValueFrom(this.api.deleteAttachment(attachmentId));
      if (!this.isCurrentMutation(revision, projectId)) {
        return 'failed';
      }
      const withoutAttachment = (story: KanbanUserStory): KanbanUserStory => ({
        ...story,
        attachments: (story.attachments ?? []).filter(({ id }) => id !== attachmentId),
        total_attachments: Math.max(
          0,
          (story.total_attachments ?? story.attachments?.length ?? 1) - 1,
        ),
      });
      this.userStoriesState.update((stories) =>
        stories.map((story) => (story.id === storyId ? withoutAttachment(story) : story)),
      );
      if (this.selectedStoryState()?.id === storyId) {
        this.selectedStoryState.update((story) => (story ? withoutAttachment(story) : story));
      }
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'deleted';
    } catch {
      if (!this.isCurrentMutation(revision, projectId)) {
        return 'failed';
      }
      this.mutationState.set(null);
      this.mutationErrorState.set('The file could not be removed.');
      return 'failed';
    }
  }

  openStoryDetails(storyId: TaigaId): void {
    const seed = this.userStoriesState().find(({ id }) => id === storyId);
    if (!seed) {
      return;
    }

    const projectId = this.projectIdState();
    const revision = ++this.storyDetailRevision;
    this.selectedStoryState.set(seed);
    this.selectedStoryStatusState.set('loading');
    this.selectedStoryErrorState.set(null);
    this.api.getUserStory(storyId).subscribe({
      next: (story) => {
        if (revision !== this.storyDetailRevision || this.projectIdState() !== projectId) {
          return;
        }
        this.selectedStoryState.set(story);
        this.selectedStoryStatusState.set('loaded');
      },
      error: () => {
        if (revision !== this.storyDetailRevision || this.projectIdState() !== projectId) {
          return;
        }
        this.selectedStoryStatusState.set('error');
        this.selectedStoryErrorState.set(
          'Some details could not be loaded. The board summary is still available.',
        );
      },
    });
  }

  closeStoryDetails(): void {
    ++this.storyDetailRevision;
    this.selectedStoryState.set(null);
    this.selectedStoryStatusState.set('idle');
    this.selectedStoryErrorState.set(null);
  }

  dismissMutationError(): void {
    if (!this.requiresReconciliationState()) {
      this.mutationErrorState.set(null);
    }
  }

  private isCurrentMutation(revision: number, projectId: TaigaId): boolean {
    return revision === this.mutationRevision && this.projectIdState() === projectId;
  }

  private applyOrderUpdates(updates: readonly KanbanOrderUpdate[]): void {
    const byId = new Map(updates.map((update) => [update.id, update]));
    this.userStoriesState.update((stories) =>
      sortStories(
        stories.map((story) => {
          const update = byId.get(story.id);
          return update ? { ...story, ...update } : story;
        }),
      ),
    );
  }
}

function moveStoryOptimistically(
  stories: readonly KanbanUserStory[],
  command: KanbanMoveCommand,
): readonly KanbanUserStory[] {
  const story = stories.find(({ id }) => id === command.storyId);
  if (!story) {
    return stories;
  }

  const destination = stories
    .filter(
      (candidate) =>
        candidate.id !== command.storyId &&
        candidate.status === command.statusId &&
        candidate.swimlane === command.swimlaneId,
    )
    .sort((left, right) => left.kanban_order - right.kanban_order);
  const afterIndex = destination.findIndex(({ id }) => id === command.afterStoryId);
  const beforeIndex = destination.findIndex(({ id }) => id === command.beforeStoryId);
  const insertionIndex =
    afterIndex >= 0
      ? afterIndex + 1
      : beforeIndex >= 0
        ? beforeIndex
        : Math.max(0, Math.min(command.destinationIndex, destination.length));
  destination.splice(insertionIndex, 0, {
    ...story,
    status: command.statusId,
    swimlane: command.swimlaneId,
  });

  const destinationById = new Map(
    destination.map((candidate, index) => [
      candidate.id,
      { ...candidate, kanban_order: index + 1 },
    ]),
  );
  return sortStories(stories.map((candidate) => destinationById.get(candidate.id) ?? candidate));
}

function sortStories(stories: readonly KanbanUserStory[]): readonly KanbanUserStory[] {
  return [...stories].sort(
    (left, right) => left.kanban_order - right.kanban_order || left.id - right.id,
  );
}

function isAmbiguousMutationFailure(error: unknown): boolean {
  return (
    !(error instanceof HttpErrorResponse) ||
    error.status < 400 ||
    error.status === 408 ||
    error.status >= 500
  );
}
