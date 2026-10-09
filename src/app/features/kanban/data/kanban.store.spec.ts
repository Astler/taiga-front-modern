import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanApiService, type KanbanPayload } from './kanban-api.service';
import type {
  KanbanCreateRequest,
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
    updateUserStory: ReturnType<
      typeof vi.fn<(request: KanbanStoryUpdateRequest) => Observable<KanbanUserStory>>
    >;
  };
  let store: KanbanStore;

  beforeEach(() => {
    api = {
      load: vi.fn(),
      moveUserStories: vi.fn(),
      createUserStories: vi.fn(),
      getUserStory: vi.fn(),
      updateUserStory: vi.fn(),
    };
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
