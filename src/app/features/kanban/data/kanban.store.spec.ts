import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanApiService, type KanbanPayload } from './kanban-api.service';
import type {
  KanbanCreateRequest,
  KanbanAttachmentSummary,
  KanbanAttachmentUploadRequest,
  KanbanMoveRequest,
  KanbanOrderUpdate,
  KanbanSwimlane,
  KanbanUserStory,
  KanbanStoryUpdateRequest,
} from './kanban.models';
import { KanbanStore } from './kanban.store';

describe('KanbanStore', () => {
  let api: {
    load: ReturnType<typeof vi.fn<(projectId: number) => Observable<KanbanPayload>>>;
    moveUserStories: ReturnType<
      typeof vi.fn<(request: KanbanMoveRequest) => Observable<readonly KanbanOrderUpdate[]>>
    >;
    createUserStories: ReturnType<
      typeof vi.fn<(request: KanbanCreateRequest) => Observable<readonly KanbanUserStory[]>>
    >;
    getUserStory: ReturnType<typeof vi.fn<(storyId: number) => Observable<KanbanUserStory>>>;
    listAttachments: ReturnType<typeof vi.fn<
      (projectId: number, storyId: number) => Observable<readonly KanbanAttachmentSummary[]>
    >>;
    updateUserStory: ReturnType<
      typeof vi.fn<(request: KanbanStoryUpdateRequest) => Observable<KanbanUserStory>>
    >;
    uploadAttachment: ReturnType<
      typeof vi.fn<(request: KanbanAttachmentUploadRequest) => Observable<KanbanAttachmentSummary>>
    >;
    deleteAttachment: ReturnType<typeof vi.fn<(attachmentId: number) => Observable<void>>>;
    deleteUserStory: ReturnType<typeof vi.fn<(storyId: number) => Observable<void>>>;
    listTaskStatuses: ReturnType<
      typeof vi.fn<(projectId: number) => Observable<readonly { id: number; name: string; color: string; order: number; is_closed: boolean }[]>>
    >;
    createTask: ReturnType<typeof vi.fn<(projectId: number, storyId: number, subject: string) => Observable<any>>>;
    updateTask: ReturnType<typeof vi.fn<(taskId: number, changes: any, version?: number) => Observable<any>>>;
    deleteTask: ReturnType<typeof vi.fn<(taskId: number) => Observable<void>>>;
    getStoryHistory: ReturnType<typeof vi.fn<(storyId: number) => Observable<any[]>>>;
    editStoryHistoryComment: ReturnType<
      typeof vi.fn<(storyId: number, historyId: string, comment: string) => Observable<void>>
    >;
    deleteStoryHistoryComment: ReturnType<
      typeof vi.fn<(storyId: number, historyId: string) => Observable<void>>
    >;
    addStoryComment: ReturnType<typeof vi.fn<(storyId: number, comment: string, version?: number) => Observable<KanbanUserStory>>>;
    updateStoryPoints: ReturnType<typeof vi.fn<(storyId: number, points: Readonly<Record<string, number>>, version?: number) => Observable<KanbanUserStory>>>;
  };
  let store: KanbanStore;

  beforeEach(() => {
    api = {
      load: vi.fn(),
      moveUserStories: vi.fn(),
      createUserStories: vi.fn(),
      getUserStory: vi.fn(),
      listAttachments: vi.fn(),
      updateUserStory: vi.fn(),
      uploadAttachment: vi.fn(),
      deleteAttachment: vi.fn(),
      deleteUserStory: vi.fn(),
      listTaskStatuses: vi.fn(),
      createTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      getStoryHistory: vi.fn(),
      editStoryHistoryComment: vi.fn(),
      deleteStoryHistoryComment: vi.fn(),
      addStoryComment: vi.fn(),
      updateStoryPoints: vi.fn(),
    };
    api.listAttachments.mockReturnValue(of([]));
    TestBed.configureTestingModule({
      providers: [KanbanStore, { provide: KanbanApiService, useValue: api }],
    });
    store = TestBed.inject(KanbanStore);
  });

  it('exposes loading immediately and stores a sorted successful response', () => {
    const request = new Subject<KanbanPayload>();
    api.load.mockReturnValue(request);

    store.load(17);

    expect(store.projectId()).toBe(17);
    expect(store.status()).toBe('loading');
    expect(store.isLoading()).toBe(true);
    expect(store.error()).toBeNull();
    expect(store.userStories()).toEqual([]);
    expect(store.swimlanes()).toEqual([]);

    request.next({
      swimlanes: [swimlane(2, 20), swimlane(1, 10)],
      userStories: [userStory(2, 20), userStory(1, 10)],
    });
    request.complete();

    expect(store.status()).toBe('loaded');
    expect(store.isLoading()).toBe(false);
    expect(store.swimlanes().map(({ id }) => id)).toEqual([1, 2]);
    expect(store.userStories().map(({ id }) => id)).toEqual([1, 2]);
  });

  it('surfaces an API failure and can retry the same project', () => {
    api.load
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of({ swimlanes: [swimlane(1, 1)], userStories: [userStory(1, 1)] }));

    store.load(17);

    expect(store.status()).toBe('error');
    expect(store.isLoading()).toBe(false);
    expect(store.error()).toBe(
      'The board could not be loaded. Check the connection and try again.',
    );

    store.retry();

    expect(api.load).toHaveBeenNthCalledWith(1, 17);
    expect(api.load).toHaveBeenNthCalledWith(2, 17);
    expect(store.status()).toBe('loaded');
    expect(store.error()).toBeNull();
    expect(store.userStories().map(({ id }) => id)).toEqual([1]);
  });

  it('hydrates a selected story while keeping the board summary visible', () => {
    const summary = userStory(1, 1);
    const detail = { ...summary, description: 'Complete story details' };
    const request = new Subject<KanbanUserStory>();
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [summary] }));
    api.getUserStory.mockReturnValue(request);
    store.load(17);

    store.openStoryDetails(1);

    expect(store.selectedStory()).toEqual(summary);
    expect(store.selectedStoryStatus()).toBe('loading');
    request.next(detail);
    request.complete();
    expect(store.selectedStory()).toEqual(detail);
    expect(store.selectedStoryStatus()).toBe('loaded');

    store.closeStoryDetails();
    expect(store.selectedStory()).toBeNull();
    expect(store.selectedStoryStatus()).toBe('idle');
  });

  it('keeps the summary in the detail drawer when hydration fails', () => {
    const summary = userStory(1, 1);
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [summary] }));
    api.getUserStory.mockReturnValue(throwError(() => new Error('offline')));
    store.load(17);

    store.openStoryDetails(1);

    expect(store.selectedStory()).toEqual(summary);
    expect(store.selectedStoryStatus()).toBe('error');
    expect(store.selectedStoryError()).toContain('board summary');
  });

  it('saves story edits into both the board and open editor', async () => {
    const original = { ...userStory(1, 1), version: 4 };
    const updated = {
      ...original,
      subject: 'Updated title',
      description: 'Updated body',
      version: 5,
    };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [original] }));
    api.getUserStory.mockReturnValue(of(original));
    api.updateUserStory.mockReturnValue(of(updated));
    store.load(17);
    store.openStoryDetails(1);

    await expect(
      store.updateStory({
        projectId: 17,
        storyId: 1,
        version: 4,
        changes: {
          subject: 'Updated title',
          description: 'Updated body',
          status: 1,
          assigned_users: [],
          milestone: null,
          due_date: null,
          tags: [],
          is_blocked: false,
          blocked_note: '',
        },
      }),
    ).resolves.toBe('updated');

    expect(store.userStories()[0]?.subject).toBe('Updated title');
    expect(store.selectedStory()?.description).toBe('Updated body');
    expect(store.mutationError()).toBeNull();
  });

  it('removes a confirmed deletion from the board and closes an open editor', async () => {
    const first = userStory(1, 1);
    const second = userStory(2, 2);
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [first, second] }));
    api.getUserStory.mockReturnValue(of(first));
    api.deleteUserStory.mockReturnValue(of(undefined));
    store.load(17);
    store.openStoryDetails(1);

    await expect(store.deleteStory(17, 1)).resolves.toBe('deleted');
    expect(api.deleteUserStory).toHaveBeenCalledWith(1);
    expect(store.userStories().map(({ id }) => id)).toEqual([2]);
    expect(store.selectedStory()).toBeNull();
    expect(store.isMutating()).toBe(false);
  });

  it('keeps the story when deletion is forbidden, and surfaces the API failure', async () => {
    const story = userStory(1, 1);
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [story] }));
    api.deleteUserStory.mockReturnValue(throwError(
      () => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    ));
    store.load(17);
    await expect(store.deleteStory(17, 1)).resolves.toBe('failed');
    expect(store.userStories().map(({ id }) => id)).toEqual([1]);
    expect(store.mutationError()).toContain('permission');
  });

  it('reconciles an ambiguous deletion instead of retrying it', async () => {
    const story = userStory(1, 1);
    api.load.mockReturnValueOnce(of({ swimlanes: [], userStories: [story] }))
      .mockReturnValueOnce(of({ swimlanes: [], userStories: [] }));
    api.deleteUserStory.mockReturnValue(throwError(
      () => new HttpErrorResponse({ status: 0, statusText: 'Network unavailable' }),
    ));
    store.load(17);

    await expect(store.deleteStory(17, 1)).resolves.toBe('uncertain');
    expect(api.deleteUserStory).toHaveBeenCalledTimes(1);
    expect(store.userStories()).toEqual([]);
    expect(store.requiresReconciliation()).toBe(false);
  });

  it('ignores a deletion response that arrives after changing projects', async () => {
    const pending = new Subject<void>();
    api.load.mockImplementation((projectId) => of({
      swimlanes: [], userStories: [userStory(projectId, 1, projectId)],
    }));
    api.deleteUserStory.mockReturnValue(pending);
    store.load(17);
    const deleting = store.deleteStory(17, 17);
    store.load(18);
    pending.next();
    pending.complete();
    await expect(deleting).resolves.toBe('failed');
    expect(store.userStories()[0]?.project).toBe(18);
  });

  it('creates, renames, changes status, and deletes tasks in selected story and board', async () => {
    const initial = { ...userStory(1, 1), tasks: [], total_attachments: 0 };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [initial] }));
    api.getUserStory.mockReturnValue(of(initial));
    api.listTaskStatuses.mockReturnValue(of([
      { id: 1, name: 'Ready', color: '#777', order: 0, is_closed: false },
      { id: 2, name: 'Done', color: '#7f7', order: 1, is_closed: true },
    ]));
    api.createTask.mockReturnValue(of({ id: 9, subject: 'Initial task', is_closed: false, version: 3, status: 1 }));
    api.updateTask.mockReturnValueOnce(of({
      id: 9, subject: 'Renamed', is_closed: false, version: 4, status: 1,
    })).mockReturnValueOnce(of({
      id: 9, subject: 'Renamed', is_closed: true, version: 5, status: 2,
    }));
    api.deleteTask.mockReturnValue(of(undefined));

    store.load(17);
    store.openStoryDetails(1);
    store.loadTaskStatuses(17);
    expect(store.taskStatuses()).toHaveLength(2);

    expect(await store.createTask(17, 1, 'Initial task')).toBe('updated');
    expect(store.selectedStory()?.tasks?.[0]?.subject).toBe('Initial task');
    expect(store.userStories()[0]?.tasks).toHaveLength(1);
    const created = store.selectedStory()!.tasks![0]!;

    expect(await store.updateTask(17, 1, created, { subject: 'Renamed' })).toBe('updated');
    expect(api.updateTask).toHaveBeenLastCalledWith(9, { subject: 'Renamed' }, 3);
    const renamed = store.selectedStory()!.tasks![0]!;
    expect(renamed.subject).toBe('Renamed');
    expect(await store.updateTask(17, 1, renamed, { status: 2 })).toBe('updated');
    expect(store.selectedStory()?.tasks?.[0]?.is_closed).toBe(true);
    expect(store.userStories()[0]?.tasks?.[0]?.status).toBe(2);

    expect(await store.deleteTask(17, 1, 9)).toBe('updated');
    expect(store.selectedStory()?.tasks).toEqual([]);
    expect(store.userStories()[0]?.tasks).toEqual([]);
  });

  it('keeps task state unchanged on server rejection', async () => {
    const initial = { ...userStory(1, 1), tasks: [{ id: 9, subject: 'Keep me', is_closed: false }] };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [initial] }));
    api.deleteTask.mockReturnValue(throwError(
      () => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    ));
    store.load(17);
    await expect(store.deleteTask(17, 1, 9)).resolves.toBe('failed');
    expect(store.userStories()[0]?.tasks?.[0]?.subject).toBe('Keep me');
    expect(store.mutationError()).toContain('permission');
  });

  it('updates estimates by role with optimistic concurrency without editing other fields', async () => {
    const story = {
      ...userStory(1, 1),
      points: { '8': 4 },
      total_points: null,
      version: 4,
    };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [story] }));
    api.getUserStory.mockReturnValue(of(story));
    api.updateStoryPoints.mockReturnValue(of({
      ...story, points: { '8': 5 }, total_points: 3, version: 5,
    }));
    store.load(17);
    store.openStoryDetails(1);
    await expect(store.updateStoryPoints(17, 1, { '8': 5 })).resolves.toBe('updated');
    expect(api.updateStoryPoints).toHaveBeenCalledWith(1, { '8': 5 }, 4);
    expect(store.selectedStory()?.points).toEqual({ '8': 5 });
    expect(store.selectedStory()?.total_points).toBe(3);
    expect(store.userStories()[0]?.total_points).toBe(3);
    expect(store.selectedStory()?.version).toBe(5);
  });

  it('does not change a role estimate when Taiga rejects the version', async () => {
    const story = { ...userStory(1, 1), points: { '8': 4 }, version: 4 };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [story] }));
    api.getUserStory.mockReturnValue(of(story));
    api.updateStoryPoints.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 409, statusText: 'Conflict' }),
    ));
    store.load(17);
    store.openStoryDetails(1);
    await expect(store.updateStoryPoints(17, 1, { '8': 5 })).resolves.toBe('failed');
    expect(store.selectedStory()?.points).toEqual({ '8': 4 });
    expect(store.mutationError()).toContain('changed elsewhere');
  });

  it('edits and deletes a comment through Taiga history and updates the visible list', async () => {
    const story = { ...userStory(1, 1), total_comments: 1 };
    const initial = { id: 'history-1', comment: 'Original', user: { pk: 7, name: 'Ada' } };
    const edited = { ...initial, comment: 'Corrected' };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [story] }));
    api.getUserStory.mockReturnValue(of(story));
    api.getStoryHistory
      .mockReturnValueOnce(of([initial]))
      .mockReturnValueOnce(of([edited]))
      .mockReturnValueOnce(of([{ ...edited, delete_comment_date: '2026-10-11T00:00:00Z' }]));
    api.editStoryHistoryComment.mockReturnValue(of(undefined));
    api.deleteStoryHistoryComment.mockReturnValue(of(undefined));

    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryHistory(1);
    expect(store.storyComments()).toHaveLength(1);
    expect(await store.editHistoryComment(17, 1, 'history-1', 'Corrected')).toBe('updated');
    expect(api.editStoryHistoryComment).toHaveBeenCalledWith(1, 'history-1', 'Corrected');
    expect(store.storyComments()[0]?.comment).toBe('Corrected');

    expect(await store.deleteHistoryComment(17, 1, 'history-1')).toBe('updated');
    expect(api.deleteStoryHistoryComment).toHaveBeenCalledWith(1, 'history-1');
    expect(store.storyComments()).toEqual([]);
    expect(store.selectedStory()?.total_comments).toBe(0);
    expect(store.userStories()[0]?.total_comments).toBe(0);
  });

  it('keeps the comment on a forbidden delete and ignores an ambiguous edit retry', async () => {
    const story = { ...userStory(1, 1), total_comments: 1 };
    const entry = { id: 'history-1', comment: 'Keep me', user: { pk: 7 } };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [story] }));
    api.getUserStory.mockReturnValue(of(story));
    api.getStoryHistory.mockReturnValue(of([entry]));
    api.deleteStoryHistoryComment.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    ));
    api.editStoryHistoryComment.mockReturnValue(throwError(() =>
      new HttpErrorResponse({ status: 0, statusText: 'Network disconnected' }),
    ));

    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryHistory(1);
    expect(await store.deleteHistoryComment(17, 1, 'history-1')).toBe('failed');
    expect(store.storyComments()[0]?.comment).toBe('Keep me');
    expect(store.mutationError()).toContain('author');
    expect(await store.editHistoryComment(17, 1, 'history-1', 'Attempted')).toBe('uncertain');
    expect(api.editStoryHistoryComment).toHaveBeenCalledTimes(1);
    expect(store.storyComments()[0]?.comment).toBe('Keep me');
    expect(store.mutationError()).toContain('history refreshed');
  });

  it('ignores stale comment modification results after switching projects', async () => {
    const pending = new Subject<void>();
    const story = userStory(1, 1);
    api.load.mockImplementation((id) => of({
      swimlanes: [], userStories: [userStory(id, 1, id)],
    }));
    api.getUserStory.mockReturnValue(of(story));
    api.getStoryHistory.mockReturnValue(of([{ id: 'history-1', comment: 'Note' }]));
    api.editStoryHistoryComment.mockReturnValue(pending);
    store.load(1);
    store.openStoryDetails(1);
    store.loadStoryHistory(1);

    const editing = store.editHistoryComment(1, 1, 'history-1', 'Late edit');
    store.load(2);
    pending.next();
    pending.complete();
    await expect(editing).resolves.toBe('failed');
    expect(store.projectId()).toBe(2);
    expect(store.storyComments()).toEqual([]);
  });

  it('loads visible story comments and appends a comment without changing the story draft', async () => {
    const original = { ...userStory(1, 1), version: 3, total_comments: 1 };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [original] }));
    api.getUserStory.mockReturnValue(of(original));
    api.getStoryHistory.mockReturnValueOnce(of([
      { id: 'a', comment: 'Original', user: { name: 'Ada' } },
      { id: 'b', comment: '', user: { name: 'Bot' } },
      { id: 'c', comment: 'Deleted', is_comment_deleted: true },
    ])).mockReturnValueOnce(of([
      { id: 'a', comment: 'Original', user: { name: 'Ada' } },
      { id: 'd', comment: 'New message', user: { name: 'Grace' } },
    ]));
    api.addStoryComment.mockReturnValue(of({
      ...original, version: 4, total_comments: 2,
    }));
    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryHistory(1);

    expect(store.storyComments().map(({ id }) => id)).toEqual(['a']);
    await expect(store.addStoryComment(17, 1, 'New message')).resolves.toBe('updated');
    expect(api.addStoryComment).toHaveBeenCalledWith(1, 'New message', 3);
    expect(store.storyComments().map(({ id }) => id)).toEqual(['a', 'd']);
    expect(store.selectedStory()?.total_comments).toBe(2);
    expect(store.selectedStory()?.version).toBe(4);
    expect(store.mutationError()).toBeNull();
  });

  it('keeps a comment visible after a failed post and ignores stale history', async () => {
    const first = userStory(1, 1);
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [first] }));
    api.getUserStory.mockReturnValue(of(first));
    const delayed = new Subject<any[]>();
    api.getStoryHistory.mockReturnValue(delayed);
    api.addStoryComment.mockReturnValue(throwError(
      () => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' }),
    ));
    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryHistory(1);
    await expect(store.addStoryComment(17, 1, 'Not allowed')).resolves.toBe('failed');
    expect(store.mutationError()).toContain('permission');
    store.closeStoryDetails();
    delayed.next([{ id: 'stale', comment: 'Old comment' }]);
    delayed.complete();
    expect(store.storyComments()).toEqual([]);
  });

  it('loads complete story attachments instead of embedded thumbnail-only rows', () => {
    const basic = { id: 22, attached_file: 'attachments/test/screenshot.png', thumbnail_card_url: '/tiny.png' };
    const full = {
      ...basic,
      name: 'screenshot.png',
      url: 'https://files.example.test/screenshot.png',
      preview_url: 'https://files.example.test/screenshot.png',
      size: 1048576,
    };
    api.load.mockReturnValue(of({
      swimlanes: [],
      userStories: [{ ...userStory(1, 1), attachments: [basic], total_attachments: 1 }],
    }));
    api.getUserStory.mockReturnValue(of({ ...userStory(1, 1), attachments: [basic] }));
    api.listAttachments.mockReturnValue(of([full]));
    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryAttachments(1);

    expect(api.listAttachments).toHaveBeenCalledWith(17, 1);
    expect(store.storyAttachments()).toEqual([full]);
    expect(store.storyAttachmentsLoading()).toBe(false);
    expect(store.storyAttachmentsError()).toBeNull();
  });

  it('ignores stale attachment metadata after closing and switching stories', () => {
    const pending = new Subject<readonly KanbanAttachmentSummary[]>();
    api.load.mockReturnValue(of({
      swimlanes: [],
      userStories: [userStory(1, 1), userStory(2, 2)],
    }));
    api.getUserStory.mockImplementation((id) => of(userStory(id, id)));
    api.listAttachments.mockReturnValueOnce(pending).mockReturnValueOnce(of([
      { id: 34, name: 'fresh.pdf', url: 'https://files.example.test/fresh.pdf' },
    ]));
    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryAttachments(1);
    expect(store.storyAttachmentsLoading()).toBe(true);

    store.closeStoryDetails();
    expect(store.storyAttachments()).toEqual([]);
    store.openStoryDetails(2);
    store.loadStoryAttachments(2);
    pending.next([{ id: 33, name: 'stale.png' }]);
    pending.complete();

    expect(store.selectedStory()?.id).toBe(2);
    expect(store.storyAttachments().map(({ id }) => id)).toEqual([34]);
  });

  it('surfaces attachment listing errors and retries without discarding the story', () => {
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [userStory(1, 1)] }));
    api.getUserStory.mockReturnValue(of(userStory(1, 1)));
    api.listAttachments
      .mockReturnValueOnce(throwError(() => new Error('Network unavailable')))
      .mockReturnValueOnce(of([
        { id: 12, name: 'report.pdf', url: 'https://files.example.test/report.pdf' },
      ]));
    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryAttachments(1);
    expect(store.storyAttachmentsError()).toContain('Could not load');
    expect(store.selectedStory()?.id).toBe(1);

    store.loadStoryAttachments(1);
    expect(store.storyAttachmentsError()).toBeNull();
    expect(store.storyAttachments()[0]?.name).toBe('report.pdf');
  });

  it('adds and removes attachments in both the board and open editor', async () => {
    const original = { ...userStory(1, 1), attachments: [], total_attachments: 0 };
    const attachment = {
      id: 12,
      name: 'clipboard.png',
      url: 'https://files.example.test/clipboard.png',
    };
    const file = new File(['image data'], attachment.name, { type: 'image/png' });
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [original] }));
    api.getUserStory.mockReturnValue(of(original));
    api.uploadAttachment.mockReturnValue(of(attachment));
    api.deleteAttachment.mockReturnValue(of(undefined));
    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryAttachments(1);

    await expect(store.uploadAttachment({ projectId: 17, storyId: 1, file })).resolves.toBe(
      'uploaded',
    );
    expect(store.userStories()[0]?.attachments).toEqual([attachment]);
    expect(store.selectedStory()?.attachments).toEqual([attachment]);
    expect(store.storyAttachments()).toEqual([attachment]);
    expect(store.selectedStory()?.total_attachments).toBe(1);

    await expect(store.deleteAttachment(17, 1, attachment.id)).resolves.toBe('deleted');
    expect(api.deleteAttachment).toHaveBeenCalledWith(12);
    expect(store.userStories()[0]?.attachments).toEqual([]);
    expect(store.selectedStory()?.attachments).toEqual([]);
    expect(store.storyAttachments()).toEqual([]);
    expect(store.selectedStory()?.total_attachments).toBe(0);
  });

  it('does not let an older attachment request erase a freshly uploaded image', async () => {
    const oldList = new Subject<readonly KanbanAttachmentSummary[]>();
    const original = { ...userStory(1, 1), attachments: [], total_attachments: 0 };
    const image = {
      id: 77, name: 'new.png', url: 'https://files.example.test/new.png', size: 100,
    };
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [original] }));
    api.getUserStory.mockReturnValue(of(original));
    api.listAttachments
      .mockReturnValueOnce(oldList)
      .mockReturnValueOnce(of([image]));
    api.uploadAttachment.mockReturnValue(of(image));

    store.load(17);
    store.openStoryDetails(1);
    store.loadStoryAttachments(1);
    expect(store.storyAttachmentsLoading()).toBe(true);
    const file = new File(['image'], 'new.png', { type: 'image/png' });
    await expect(store.uploadAttachment({ projectId: 17, storyId: 1, file }))
      .resolves.toBe('uploaded');
    expect(api.listAttachments).toHaveBeenCalledTimes(2);

    oldList.next([]);
    oldList.complete();
    expect(store.storyAttachments()).toEqual([image]);
    expect(store.storyAttachmentsLoading()).toBe(false);
  });

  it('surfaces the attachment validation message returned by Taiga', async () => {
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [userStory(1, 1)] }));
    api.uploadAttachment.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { attached_file: ['This file type is not allowed.'] },
          }),
      ),
    );
    store.load(17);

    await expect(
      store.uploadAttachment({
        projectId: 17,
        storyId: 1,
        file: new File(['content'], 'blocked.exe'),
      }),
    ).resolves.toBe('failed');
    expect(store.mutationError()).toContain('This file type is not allowed.');
  });

  it('ignores a stale response when a newer project request has already won', () => {
    const older = new Subject<KanbanPayload>();
    const newer = new Subject<KanbanPayload>();
    api.load.mockImplementation((projectId) => (projectId === 1 ? older : newer));

    store.load(1);
    store.load(2);

    newer.next({ swimlanes: [swimlane(20, 1, 2)], userStories: [userStory(20, 1, 2)] });
    newer.complete();
    older.next({ swimlanes: [swimlane(10, 1, 1)], userStories: [userStory(10, 1, 1)] });
    older.complete();

    expect(store.projectId()).toBe(2);
    expect(store.status()).toBe('loaded');
    expect(store.error()).toBeNull();
    expect(store.swimlanes().map(({ id }) => id)).toEqual([20]);
    expect(store.userStories().map(({ id }) => id)).toEqual([20]);
  });

  it('optimistically moves a story and reconciles every order returned by Taiga', async () => {
    api.load
      .mockReturnValueOnce(
        of({
          swimlanes: [],
          userStories: [
            userStory(1, 1),
            { ...userStory(2, 2), status: 2 },
            { ...userStory(3, 3), status: 2 },
          ],
        }),
      )
      .mockReturnValueOnce(
        of({
          swimlanes: [],
          userStories: [
            { ...userStory(2, 2), status: 2 },
            { ...userStory(1, 8), status: 2 },
            { ...userStory(3, 9), status: 2 },
          ],
        }),
      );
    const response = new Subject<readonly KanbanOrderUpdate[]>();
    api.moveUserStories.mockReturnValue(response);
    store.load(17);

    const result = store.moveStory({
      projectId: 17,
      storyId: 1,
      statusId: 2,
      swimlaneId: null,
      destinationIndex: 1,
      afterStoryId: 2,
    });

    expect(store.isMutating()).toBe(true);
    expect(
      store
        .userStories()
        .filter(({ status }) => status === 2)
        .map(({ id }) => id),
    ).toEqual([2, 1, 3]);
    expect(api.moveUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 2,
      swimlaneId: null,
      storyIds: [1],
      afterStoryId: 2,
    });

    response.next([
      { id: 1, status: 2, swimlane: null, kanban_order: 8 },
      { id: 3, status: 2, swimlane: null, kanban_order: 9 },
    ]);
    response.complete();

    await expect(result).resolves.toBe('moved');
    expect(store.isMutating()).toBe(false);
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(store.isRefreshing()).toBe(false);
    expect(store.userStories().find(({ id }) => id === 1)?.kanban_order).toBe(8);
    expect(store.userStories().find(({ id }) => id === 3)?.kanban_order).toBe(9);
  });

  it('honours a visible before-anchor even when filtered-out stories occupy the column', async () => {
    const original = [userStory(1, 10), userStory(2, 15), userStory(3, 20)];
    const response = new Subject<readonly KanbanOrderUpdate[]>();
    api.load.mockReturnValue(of({ swimlanes: [], userStories: original }));
    api.moveUserStories.mockReturnValue(response);
    store.load(17);

    const result = store.moveStory({
      projectId: 17,
      storyId: 3,
      statusId: 1,
      swimlaneId: null,
      destinationIndex: 0,
      beforeStoryId: 1,
    });

    expect(store.userStories().map(({ id }) => id)).toEqual([3, 1, 2]);
    response.error(new HttpErrorResponse({ status: 400, statusText: 'Rejected for test' }));
    await expect(result).resolves.toBe('failed');
    expect(store.userStories().map(({ id }) => id)).toEqual([1, 2, 3]);
  });

  it('rolls an optimistic move back when Taiga rejects it', async () => {
    const original = [userStory(1, 1), { ...userStory(2, 2), status: 2 }];
    api.load.mockReturnValue(of({ swimlanes: [], userStories: original }));
    api.moveUserStories.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    store.load(17);

    await expect(
      store.moveStory({
        projectId: 17,
        storyId: 1,
        statusId: 2,
        swimlaneId: null,
        destinationIndex: 0,
        beforeStoryId: 2,
      }),
    ).resolves.toBe('failed');

    expect(store.userStories()).toEqual(original);
    expect(store.mutationError()).toContain('restored');
    expect(store.isMutating()).toBe(false);
  });

  it('reconciles an ambiguous move failure before allowing another mutation', async () => {
    const original = [userStory(1, 1), { ...userStory(2, 2), status: 2 }];
    const committed = [
      { ...userStory(2, 1), status: 2 },
      { ...userStory(1, 2), status: 2 },
    ];
    api.load
      .mockReturnValueOnce(of({ swimlanes: [], userStories: original }))
      .mockReturnValueOnce(of({ swimlanes: [], userStories: committed }));
    api.moveUserStories.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Network error' })),
    );
    store.load(17);

    await expect(
      store.moveStory({
        projectId: 17,
        storyId: 1,
        statusId: 2,
        swimlaneId: null,
        destinationIndex: 1,
        afterStoryId: 2,
      }),
    ).resolves.toBe('uncertain');

    expect(api.load).toHaveBeenCalledTimes(2);
    expect(store.userStories().find(({ id }) => id === 1)?.status).toBe(2);
    expect(store.mutationError()).toBeNull();
    expect(store.requiresReconciliation()).toBe(false);
    expect(store.isRefreshing()).toBe(false);
  });

  it('adds stories returned by the quick-create endpoint', async () => {
    const createdStory = { ...userStory(2, 2), subject: 'New story' };
    api.load
      .mockReturnValueOnce(of({ swimlanes: [], userStories: [userStory(1, 1)] }))
      .mockReturnValueOnce(of({ swimlanes: [], userStories: [userStory(1, 1), createdStory] }));
    api.createUserStories.mockReturnValue(of([createdStory]));
    store.load(17);

    await expect(
      store.createStories({
        projectId: 17,
        statusId: 1,
        swimlaneId: null,
        subjects: 'New story',
      }),
    ).resolves.toBe('created');

    expect(store.userStories().map(({ subject }) => subject)).toEqual(['Story 1', 'New story']);
    expect(store.mutationError()).toBeNull();
  });

  it('blocks retries until an ambiguous create has been reconciled successfully', async () => {
    const original = [userStory(1, 1)];
    const createdStory = { ...userStory(2, 2), subject: 'Possibly created' };
    api.load
      .mockReturnValueOnce(of({ swimlanes: [], userStories: original }))
      .mockReturnValueOnce(throwError(() => new Error('offline during reconciliation')))
      .mockReturnValueOnce(of({ swimlanes: [], userStories: [...original, createdStory] }));
    api.createUserStories.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Network error' })),
    );
    store.load(17);
    const request = {
      projectId: 17,
      statusId: 1,
      swimlaneId: null,
      subjects: 'Possibly created',
    } as const;

    await expect(store.createStories(request)).resolves.toBe('uncertain');
    await expect(store.createStories(request)).resolves.toBe('failed');
    await expect(
      store.moveStory({
        projectId: 17,
        storyId: 1,
        statusId: 1,
        swimlaneId: null,
        destinationIndex: 0,
      }),
    ).resolves.toBe('failed');

    expect(api.createUserStories).toHaveBeenCalledOnce();
    expect(api.moveUserStories).not.toHaveBeenCalled();
    expect(store.requiresReconciliation()).toBe(true);
    expect(store.mutationError()).toContain('still unverified');

    store.dismissMutationError();
    expect(store.mutationError()).toContain('still unverified');

    store.refresh();

    expect(store.requiresReconciliation()).toBe(false);
    expect(store.mutationError()).toBeNull();
    expect(store.userStories().map(({ id }) => id)).toEqual([1, 2]);
  });

  it('keeps a definitive create rejection retryable', async () => {
    api.load.mockReturnValue(of({ swimlanes: [], userStories: [userStory(1, 1)] }));
    api.createUserStories.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad request' })),
    );
    store.load(17);

    await expect(
      store.createStories({
        projectId: 17,
        statusId: 1,
        swimlaneId: null,
        subjects: 'Invalid story',
      }),
    ).resolves.toBe('failed');

    expect(store.requiresReconciliation()).toBe(false);
    expect(store.mutationError()).toContain('could not be created');
  });

  it('ignores a stale mutation failure after switching projects', async () => {
    const create = new Subject<readonly KanbanUserStory[]>();
    api.load.mockImplementation((projectId) =>
      of({ swimlanes: [], userStories: [userStory(projectId, 1, projectId)] }),
    );
    api.createUserStories.mockReturnValue(create);
    store.load(17);

    const result = store.createStories({
      projectId: 17,
      statusId: 1,
      swimlaneId: null,
      subjects: 'Old project draft',
    });
    store.load(18);
    create.error(new HttpErrorResponse({ status: 0, statusText: 'Network error' }));

    await expect(result).resolves.toBe('failed');
    expect(store.projectId()).toBe(18);
    expect(store.requiresReconciliation()).toBe(false);
    expect(store.mutationError()).toBeNull();
  });

  it('keeps the current board visible when a background refresh fails', () => {
    api.load
      .mockReturnValueOnce(of({ swimlanes: [], userStories: [userStory(1, 1)] }))
      .mockReturnValueOnce(throwError(() => new Error('offline')));
    store.load(17);

    store.refresh();

    expect(store.status()).toBe('loaded');
    expect(store.userStories().map(({ id }) => id)).toEqual([1]);
    expect(store.isRefreshing()).toBe(false);
    expect(store.mutationError()).toContain('current view was kept');
  });

  it('ignores refresh requests until the initial load has completed', () => {
    const request = new Subject<KanbanPayload>();
    api.load.mockReturnValue(request);
    store.load(17);

    store.refresh();

    expect(api.load).toHaveBeenCalledOnce();
    expect(store.status()).toBe('loading');
    request.next({ swimlanes: [], userStories: [userStory(1, 1)] });
    request.complete();
    expect(store.status()).toBe('loaded');
  });
});

function userStory(id: number, kanbanOrder: number, project = 17): KanbanUserStory {
  return {
    id,
    ref: id,
    subject: `Story ${id}`,
    project,
    status: 1,
    swimlane: null,
    kanban_order: kanbanOrder,
    is_closed: false,
    assigned_to: null,
    assigned_users: [],
    assigned_to_extra_info: null,
    tags: [],
  };
}

function swimlane(id: number, order: number, project = 17): KanbanSwimlane {
  return { id, name: `Lane ${id}`, order, project };
}
