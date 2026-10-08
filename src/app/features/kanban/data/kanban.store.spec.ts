import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KanbanApiService, type KanbanPayload } from './kanban-api.service';
import type { KanbanSwimlane, KanbanUserStory } from './kanban.models';
import { KanbanStore } from './kanban.store';

describe('KanbanStore', () => {
  let api: {
    load: ReturnType<typeof vi.fn<(projectId: number) => Observable<KanbanPayload>>>;
  };
  let store: KanbanStore;

  beforeEach(() => {
    api = { load: vi.fn() };
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
