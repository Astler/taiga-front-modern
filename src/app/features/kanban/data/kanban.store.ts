import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, firstValueFrom } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { KanbanApiService } from './kanban-api.service';
import type {
  KanbanCreateRequest,
  KanbanAttachmentSummary,
  KanbanAttachmentUploadRequest,
  KanbanFiltersData,
  KanbanMilestone,
  KanbanMoveCommand,
  KanbanOrderUpdate,
  KanbanSwimlane,
  KanbanUserStory,
  KanbanStoryUpdateRequest,
  KanbanTaskSummary,
  KanbanTaskStatus,
  KanbanTaskUpdate,
  KanbanStoryHistoryEntry,
} from './kanban.models';

export type KanbanLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type KanbanCreateResult = 'created' | 'failed' | 'uncertain';
export type KanbanMoveResult = 'moved' | 'failed' | 'uncertain';
export type KanbanUpdateResult = 'updated' | 'failed' | 'uncertain';
export type KanbanAttachmentResult = 'deleted' | 'uploaded' | 'failed';
export type KanbanDeleteResult = 'deleted' | 'failed' | 'uncertain';
export type KanbanTaskResult = 'updated' | 'failed' | 'uncertain';
export type KanbanStoryDetailStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface KanbanMutation {
  readonly kind:
    'attachment' | 'comment' | 'comment-edit' | 'comment-delete' |
    'create' | 'delete' | 'move' | 'points' | 'task' | 'update';
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
  private readonly taskStatusesState = signal<readonly KanbanTaskStatus[]>([]);
  private taskStatusesProjectId: TaigaId | null = null;
  private taskStatusesRevision = 0;
  private readonly errorState = signal<string | null>(null);
  private readonly mutationState = signal<KanbanMutation | null>(null);
  private readonly mutationErrorState = signal<string | null>(null);
  private readonly lastSyncedAtState = signal<Date | null>(null);
  private readonly refreshingState = signal(false);
  private readonly requiresReconciliationState = signal(false);
  private readonly selectedStoryState = signal<KanbanUserStory | null>(null);
  private readonly selectedStoryStatusState = signal<KanbanStoryDetailStatus>('idle');
  private readonly selectedStoryErrorState = signal<string | null>(null);
  private readonly storyAttachmentsState = signal<readonly KanbanAttachmentSummary[]>([]);
  private readonly storyAttachmentsLoadingState = signal(false);
  private readonly storyAttachmentsErrorState = signal<string | null>(null);
  private readonly storyHistoryState = signal<readonly KanbanStoryHistoryEntry[]>([]);
  private readonly storyHistoryLoadingState = signal(false);
  private readonly storyHistoryErrorState = signal<string | null>(null);
  private readonly pendingHistoryReconciliationState = signal(false);
  private historyRevision = 0;
  private requestRevision = 0;
  private mutationRevision = 0;
  private storyDetailRevision = 0;
  private storyAttachmentsRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly userStories = this.userStoriesState.asReadonly();
  readonly swimlanes = this.swimlanesState.asReadonly();
  readonly filtersData = this.filtersDataState.asReadonly();
  readonly milestones = this.milestonesState.asReadonly();
  readonly taskStatuses = this.taskStatusesState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly mutation = this.mutationState.asReadonly();
  readonly mutationError = this.mutationErrorState.asReadonly();
  readonly lastSyncedAt = this.lastSyncedAtState.asReadonly();
  readonly isRefreshing = this.refreshingState.asReadonly();
  readonly requiresReconciliation = this.requiresReconciliationState.asReadonly();
  readonly selectedStory = this.selectedStoryState.asReadonly();
  readonly selectedStoryStatus = this.selectedStoryStatusState.asReadonly();
  readonly selectedStoryError = this.selectedStoryErrorState.asReadonly();
  readonly storyAttachments = this.storyAttachmentsState.asReadonly();
  readonly storyAttachmentsLoading = this.storyAttachmentsLoadingState.asReadonly();
  readonly storyAttachmentsError = this.storyAttachmentsErrorState.asReadonly();
  readonly storyHistory = this.storyHistoryState.asReadonly();
  readonly storyComments = computed(() =>
    this.storyHistoryState().filter(({ comment, is_comment_deleted, delete_comment_date, is_hidden }) =>
      typeof comment === 'string' && !!comment.trim() &&
      !is_comment_deleted && !delete_comment_date && !is_hidden),
  );
  readonly storyHistoryLoading = this.storyHistoryLoadingState.asReadonly();
  readonly storyHistoryError = this.storyHistoryErrorState.asReadonly();
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
    this.taskStatusesProjectId = null;
    ++this.taskStatusesRevision;
    this.taskStatusesState.set([]);
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
          const selectedId = this.selectedStoryState()?.id;
          if (selectedId !== undefined && !userStories.some(({ id }) => id === selectedId)) {
            // The item may have been deleted elsewhere (or deletion was unconfirmed).
            this.closeStoryDetails();
          }
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

  loadTaskStatuses(projectId: TaigaId): void {
    if (this.projectIdState() !== projectId || this.taskStatusesProjectId === projectId) {
      return;
    }
    const revision = ++this.taskStatusesRevision;
    this.taskStatusesProjectId = projectId;
    this.taskStatusesState.set([]);
    this.api.listTaskStatuses(projectId).subscribe({
      next: (statuses) => {
        if (revision !== this.taskStatusesRevision || this.projectIdState() !== projectId) return;
        this.taskStatusesState.set([...statuses].sort((a, b) => a.order - b.order));
      },
      error: () => {
        if (revision !== this.taskStatusesRevision || this.projectIdState() !== projectId) return;
        // Story editing remains functional on installations without task statuses access.
        this.taskStatusesState.set([]);
      },
    });
  }

  async createTask(projectId: TaigaId, storyId: TaigaId, subject: string): Promise<KanbanTaskResult> {
    if (!subject.trim()) return 'failed';
    return this.mutateTask(projectId, storyId, this.api.createTask(projectId, storyId, subject.trim()),
      (current, response) => response ? [...current, response] : current);
  }

  async updateTask(
    projectId: TaigaId,
    storyId: TaigaId,
    task: KanbanTaskSummary,
    changes: KanbanTaskUpdate,
  ): Promise<KanbanTaskResult> {
    return this.mutateTask(
      projectId,
      storyId,
      this.api.updateTask(task.id, changes, task.version),
      (current, response) => current.map((entry) => {
        if (entry.id !== task.id) return entry;
        const statusClosed = changes.status === undefined
          ? entry.is_closed
          : (this.taskStatusesState().find(({ id }) => id === changes.status)?.is_closed ??
            entry.is_closed);
        return { ...entry, ...changes, ...response, is_closed: response?.is_closed ?? statusClosed };
      }),
    );
  }

  async deleteTask(
    projectId: TaigaId,
    storyId: TaigaId,
    taskId: TaigaId,
  ): Promise<KanbanTaskResult> {
    return this.mutateTask(
      projectId, storyId, this.api.deleteTask(taskId),
      (current) => current.filter(({ id }) => id !== taskId),
    );
  }

  private async mutateTask(
    projectId: TaigaId,
    storyId: TaigaId,
    request: Observable<KanbanTaskSummary | void>,
    apply: (
      tasks: readonly KanbanTaskSummary[],
      response: KanbanTaskSummary | void,
    ) => readonly KanbanTaskSummary[],
  ): Promise<KanbanTaskResult> {
    if (
      this.projectIdState() !== projectId ||
      !this.userStoriesState().some(({ id }) => id === storyId) ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'task', storyIds: [storyId] });
    this.mutationErrorState.set(null);
    try {
      const response = await firstValueFrom(request);
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';

      const update = (story: KanbanUserStory): KanbanUserStory => ({
        ...story, tasks: apply(story.tasks ?? [], response),
      });
      this.userStoriesState.update((stories) =>
        stories.map((story) => story.id === storyId ? update(story) : story),
      );
      if (this.selectedStoryState()?.id === storyId) {
        this.selectedStoryState.update((story) => story ? update(story) : story);
      }
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'updated';
    } catch (error: unknown) {
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.mutationState.set(null);
      if (isAmbiguousMutationFailure(error)) {
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the task change. The board is syncing before another change.',
        );
        this.refresh();
        return 'uncertain';
      }
      this.mutationErrorState.set(
        error instanceof HttpErrorResponse && error.status === 403
          ? 'You do not have permission to change tasks.'
          : 'The task could not be saved. Please try again.',
      );
      return 'failed';
    }
  }

  loadStoryHistory(storyId: TaigaId): void {
    const projectId = this.projectIdState();
    if (projectId === null || this.selectedStoryState()?.id !== storyId) return;

    const revision = ++this.historyRevision;
    this.storyHistoryState.set([]);
    this.storyHistoryErrorState.set(null);
    this.storyHistoryLoadingState.set(true);
    this.api.getStoryHistory(storyId).subscribe({
      next: (entries) => {
        if (revision !== this.historyRevision || this.projectIdState() !== projectId ||
            this.selectedStoryState()?.id !== storyId) return;
        this.storyHistoryState.set(Array.isArray(entries) ? entries : []);
        this.storyHistoryLoadingState.set(false);
        if (this.pendingHistoryReconciliationState()) {
          this.pendingHistoryReconciliationState.set(false);
          this.requiresReconciliationState.set(false);
          this.mutationErrorState.set(
            'Comment history refreshed. Check whether your last action succeeded before retrying.',
          );
        }
      },
      error: () => {
        if (revision !== this.historyRevision || this.projectIdState() !== projectId ||
            this.selectedStoryState()?.id !== storyId) return;
        this.storyHistoryErrorState.set('Comments could not be loaded.');
        this.storyHistoryLoadingState.set(false);
      },
    });
  }

  async editHistoryComment(
    projectId: TaigaId,
    storyId: TaigaId,
    historyId: string,
    comment: string,
  ): Promise<KanbanUpdateResult> {
    if (!comment.trim()) return 'failed';
    return this.mutateHistoryComment(
      projectId,
      storyId,
      historyId,
      'edit',
      () => this.api.editStoryHistoryComment(storyId, historyId, comment.trim()),
    );
  }

  async deleteHistoryComment(
    projectId: TaigaId,
    storyId: TaigaId,
    historyId: string,
  ): Promise<KanbanUpdateResult> {
    return this.mutateHistoryComment(
      projectId,
      storyId,
      historyId,
      'delete',
      () => this.api.deleteStoryHistoryComment(storyId, historyId),
    );
  }

  private async mutateHistoryComment(
    projectId: TaigaId,
    storyId: TaigaId,
    historyId: string,
    action: 'edit' | 'delete',
    request: () => Observable<void>,
  ): Promise<KanbanUpdateResult> {
    if (
      !historyId ||
      this.projectIdState() !== projectId ||
      this.selectedStoryState()?.id !== storyId ||
      !this.storyHistoryState().some((entry) =>
        String(entry.id ?? '') === historyId && !!entry.comment?.trim() &&
        !entry.delete_comment_date && !entry.is_comment_deleted
      ) ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) return 'failed';

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: action === 'edit' ? 'comment-edit' : 'comment-delete', storyIds: [storyId] });
    this.mutationErrorState.set(null);
    try {
      await firstValueFrom(request());
      if (!this.isCurrentMutation(revision, projectId) ||
          this.selectedStoryState()?.id !== storyId) return 'failed';

      if (action === 'delete') {
        const patch = (story: KanbanUserStory): KanbanUserStory => ({
          ...story,
          ...(story.total_comments === undefined
            ? {}
            : { total_comments: Math.max(0, story.total_comments - 1) }),
        });
        this.userStoriesState.update((stories) =>
          stories.map((story) => story.id === storyId ? patch(story) : story),
        );
        this.selectedStoryState.update((story) => story ? patch(story) : story);
      }
      this.mutationState.set(null);
      this.loadStoryHistory(storyId);
      return 'updated';
    } catch (error: unknown) {
      if (!this.isCurrentMutation(revision, projectId) ||
          this.selectedStoryState()?.id !== storyId) return 'failed';
      this.mutationState.set(null);
      if (isAmbiguousMutationFailure(error)) {
        this.pendingHistoryReconciliationState.set(true);
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the comment ' + action +
          '. Refreshing comment history before another change.',
        );
        this.loadStoryHistory(storyId);
        return 'uncertain';
      }
      this.mutationErrorState.set(
        error instanceof HttpErrorResponse && error.status === 403
          ? 'Only the author or an authorized user can change this comment.'
          : 'The comment could not be ' + (action === 'edit' ? 'edited.' : 'deleted.'),
      );
      return 'failed';
    }
  }

  async updateStoryPoints(
    projectId: TaigaId,
    storyId: TaigaId,
    points: Readonly<Record<string, TaigaId>>,
  ): Promise<KanbanUpdateResult> {
    if (
      this.projectIdState() !== projectId ||
      this.selectedStoryState()?.id !== storyId ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) return 'failed';

    const revision = ++this.mutationRevision;
    const version = this.selectedStoryState()?.version;
    this.mutationState.set({ kind: 'points', storyIds: [storyId] });
    this.mutationErrorState.set(null);
    try {
      const updated = await firstValueFrom(this.api.updateStoryPoints(storyId, points, version));
      if (!this.isCurrentMutation(revision, projectId) ||
          this.selectedStoryState()?.id !== storyId) return 'failed';

      const merge = (story: KanbanUserStory): KanbanUserStory => ({
        ...story,
        points: updated.points ?? points,
        ...(updated.total_points !== undefined ? { total_points: updated.total_points } : {}),
        ...(updated.version !== undefined ? { version: updated.version } : {}),
        ...(updated.modified_date !== undefined
          ? { modified_date: updated.modified_date }
          : {}),
      });
      this.userStoriesState.update((stories) =>
        stories.map((story) => story.id === storyId ? merge(story) : story),
      );
      this.selectedStoryState.update((story) => story ? merge(story) : story);
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'updated';
    } catch (error: unknown) {
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.mutationState.set(null);
      if (isAmbiguousMutationFailure(error)) {
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the estimation. The board is syncing before another change.',
        );
        this.refresh();
        return 'uncertain';
      }
      this.mutationErrorState.set(
        error instanceof HttpErrorResponse && error.status === 409
          ? 'This story changed elsewhere. Reopen it before changing points.'
          : 'Story points could not be saved. Please try again.',
      );
      return 'failed';
    }
  }

  async addStoryComment(
    projectId: TaigaId,
    storyId: TaigaId,
    comment: string,
  ): Promise<KanbanUpdateResult> {
    if (
      this.projectIdState() !== projectId ||
      this.selectedStoryState()?.id !== storyId ||
      !comment.trim() ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'comment', storyIds: [storyId] });
    this.mutationErrorState.set(null);
    try {
      const detail = this.selectedStoryState();
      const updated = await firstValueFrom(this.api.addStoryComment(
        storyId,
        comment.trim(),
        detail?.version,
      ));
      if (!this.isCurrentMutation(revision, projectId) ||
          this.selectedStoryState()?.id !== storyId) return 'failed';

      const patch = (story: KanbanUserStory): KanbanUserStory => ({
        ...story,
        ...(updated.version !== undefined ? { version: updated.version } : {}),
        ...(updated.modified_date !== undefined
          ? { modified_date: updated.modified_date }
          : {}),
        total_comments: updated.total_comments ?? (story.total_comments ?? 0) + 1,
      });
      this.userStoriesState.update((stories) =>
        stories.map((story) => story.id === storyId ? patch(story) : story),
      );
      this.selectedStoryState.update((story) => story ? patch(story) : story);
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      this.loadStoryHistory(storyId);
      return 'updated';
    } catch (error: unknown) {
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.mutationState.set(null);
      if (isAmbiguousMutationFailure(error)) {
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the comment. Check recent comments before posting again.',
        );
        // Do not resend automatically: the comment may have reached Taiga.
        this.loadStoryHistory(storyId);
        this.refresh();
        return 'uncertain';
      }
      this.mutationErrorState.set(
        error instanceof HttpErrorResponse && error.status === 403
          ? 'You do not have permission to comment on this story.'
          : error instanceof HttpErrorResponse && error.status === 409
            ? 'This story changed elsewhere. Reopen it to comment on the latest version.'
            : 'The comment could not be posted. Please try again.',
      );
      return 'failed';
    }
  }

  async deleteStory(projectId: TaigaId, storyId: TaigaId): Promise<KanbanDeleteResult> {
    if (
      this.projectIdState() !== projectId ||
      !this.userStoriesState().some(({ id }) => id === storyId) ||
      this.isMutating() ||
      this.refreshingState() ||
      this.requiresReconciliationState()
    ) {
      return 'failed';
    }

    const revision = ++this.mutationRevision;
    this.mutationState.set({ kind: 'delete', storyIds: [storyId] });
    this.mutationErrorState.set(null);
    try {
      await firstValueFrom(this.api.deleteUserStory(storyId));
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';

      this.userStoriesState.update((stories) => stories.filter(({ id }) => id !== storyId));
      if (this.selectedStoryState()?.id === storyId) this.closeStoryDetails();
      if (this.selectedStoryState()?.id === storyId) {
        const shouldRefresh = this.storyAttachmentsLoadingState() ||
          this.storyAttachmentsErrorState() !== null;
        ++this.storyAttachmentsRevision;
        this.storyAttachmentsState.update((attachments) =>
          attachments.filter(({ id }) => id !== attachmentId),
        );
        this.storyAttachmentsLoadingState.set(false);
        this.storyAttachmentsErrorState.set(null);
        if (shouldRefresh) this.loadStoryAttachments(storyId);
      }
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'deleted';
    } catch (error: unknown) {
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';

      this.mutationState.set(null);
      const ambiguous = isAmbiguousMutationFailure(error);
      if (ambiguous) {
        // Taiga may have committed the deletion despite losing the HTTP response.
        // Do not offer an immediate second DELETE until the board is reconciled.
        this.requiresReconciliationState.set(true);
        this.mutationErrorState.set(
          'Taiga did not confirm the deletion. Checking the board before another change.',
        );
        this.refresh();
      } else if (error instanceof HttpErrorResponse && error.status === 403) {
        this.mutationErrorState.set('You do not have permission to delete this story.');
      } else if (error instanceof HttpErrorResponse && error.status === 409) {
        this.mutationErrorState.set('This story changed elsewhere. Refresh before deleting.');
      } else {
        this.mutationErrorState.set('The story could not be deleted. Please try again.');
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
      if (this.selectedStoryState()?.id === request.storyId) {
        const shouldRefresh = this.storyAttachmentsLoadingState() ||
          this.storyAttachmentsErrorState() !== null;
        ++this.storyAttachmentsRevision;
        this.storyAttachmentsState.update((attachments) =>
          attachments.some(({ id }) => id === attachment.id)
            ? attachments
            : [...attachments, attachment],
        );
        this.storyAttachmentsLoadingState.set(false);
        this.storyAttachmentsErrorState.set(null);
        if (shouldRefresh) this.loadStoryAttachments(request.storyId);
      }
      this.lastSyncedAtState.set(new Date());
      this.mutationState.set(null);
      return 'uploaded';
    } catch (error: unknown) {
      if (!this.isCurrentMutation(revision, request.projectId)) {
        return 'failed';
      }
      this.mutationState.set(null);
      this.mutationErrorState.set(attachmentFailureMessage(error, request.file.name));
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

  /**
   * Unlike the embedded user-story array, the dedicated attachments endpoint
   * supplies names, sizes, original URLs and image preview URLs.
   */
  loadStoryAttachments(storyId: TaigaId): void {
    const projectId = this.projectIdState();
    if (projectId === null || this.selectedStoryState()?.id !== storyId) return;

    const revision = ++this.storyAttachmentsRevision;
    this.storyAttachmentsLoadingState.set(true);
    this.storyAttachmentsErrorState.set(null);
    this.api.listAttachments(projectId, storyId).subscribe({
      next: (attachments) => {
        if (revision !== this.storyAttachmentsRevision ||
          this.projectIdState() !== projectId ||
          this.selectedStoryState()?.id !== storyId) return;
        this.storyAttachmentsState.set(attachments);
        this.storyAttachmentsLoadingState.set(false);
      },
      error: () => {
        if (revision !== this.storyAttachmentsRevision ||
          this.projectIdState() !== projectId ||
          this.selectedStoryState()?.id !== storyId) return;
        this.storyAttachmentsErrorState.set('Could not load the files. Try again.');
        this.storyAttachmentsLoadingState.set(false);
      },
    });
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
    ++this.storyAttachmentsRevision;
    this.storyAttachmentsState.set([]);
    this.storyAttachmentsLoadingState.set(false);
    this.storyAttachmentsErrorState.set(null);
    ++this.historyRevision;
    this.pendingHistoryReconciliationState.set(false);
    this.storyHistoryState.set([]);
    this.storyHistoryLoadingState.set(false);
    this.storyHistoryErrorState.set(null);
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

function attachmentFailureMessage(error: unknown, fileName: string): string {
  const fallback = `“${fileName}” could not be uploaded.`;
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 413) {
    return `“${fileName}” is larger than the server upload limit.`;
  }

  const detail = responseErrorDetail(error.error);
  return detail ? `${fallback} ${detail}` : fallback;
}

function responseErrorDetail(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  for (const candidate of [record['_error_message'], record['detail'], record['attached_file']]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
    if (Array.isArray(candidate) && typeof candidate[0] === 'string') {
      return candidate[0];
    }
  }
  return null;
}
