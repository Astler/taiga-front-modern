import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthTokenStorage } from '../../../core/auth';
import {
  PINNED_PROJECTS_STORAGE_KEY,
  PROJECT_LOCAL_STORAGE,
  PinnedProjectsStorage,
  normalizeStoredPins,
  pinnedProjectsStorageKey,
} from './pinned-projects.storage';
import { PinnedProjectsApiService } from './pinned-projects-api.service';
import { ProjectApiService } from './project-api.service';
import type { TaigaProjectDetail, TaigaProjectListItem } from './project.models';
import { ProjectStore } from './project.store';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('ProjectStore', () => {
  let api: {
    listByMember: ReturnType<
      typeof vi.fn<(memberId: number) => Observable<readonly TaigaProjectListItem[]>>
    >;
    getBySlug: ReturnType<typeof vi.fn<(slug: string) => Observable<TaigaProjectDetail>>>;
    getById: ReturnType<typeof vi.fn<(id: number) => Observable<TaigaProjectDetail>>>;
  };
  let storage: MemoryStorage;
  let pinnedApi: {
    load: ReturnType<typeof vi.fn<() => Observable<readonly number[]>>>;
    save: ReturnType<typeof vi.fn<(ids: readonly number[]) => Observable<void>>>;
  };
  let authSessionRevision: number;
  let store: ProjectStore;

  beforeEach(() => {
    api = {
      listByMember: vi.fn(),
      getBySlug: vi.fn(),
      getById: vi.fn(),
    };
    pinnedApi = {
      load: vi.fn(() => throwError(() => new Error('remote storage unavailable'))),
      save: vi.fn(() => of(undefined)),
    };
    authSessionRevision = 0;
    storage = new MemoryStorage();
  });

  function createStore(): void {
    TestBed.configureTestingModule({
      providers: [
        ProjectStore,
        PinnedProjectsStorage,
        { provide: ProjectApiService, useValue: api },
        { provide: PinnedProjectsApiService, useValue: pinnedApi },
        {
          provide: AuthTokenStorage,
          useValue: { revision: () => authSessionRevision },
        },
        { provide: PROJECT_LOCAL_STORAGE, useValue: storage },
      ],
    });
    store = TestBed.inject(ProjectStore);
  }

  it('loads member projects and selects the first pinned project as full detail', async () => {
    const first = projectListItem(1, 'first');
    const pinned = projectListItem(2, 'pinned');
    storage.setItem(PINNED_PROJECTS_STORAGE_KEY, '[2]');
    api.listByMember.mockReturnValue(of([first, pinned]));
    api.getBySlug.mockReturnValue(of(projectDetail(pinned)));
    createStore();

    await expect(store.loadMemberProjects(9)).resolves.toEqual([first, pinned]);

    expect(api.listByMember).toHaveBeenCalledWith(9);
    expect(api.getBySlug).toHaveBeenCalledWith('pinned');
    expect(store.projects()).toEqual([first, pinned]);
    expect(store.pinnedProjects()).toEqual([pinned]);
    expect(store.unpinnedProjects()).toEqual([first]);
    expect(store.selectedProject()?.id).toBe(2);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('persists numeric IDs compatibly with the classic frontend and supports slug pins', async () => {
    const project = projectListItem(7, 'numeric-pin');
    api.listByMember.mockReturnValue(of([project]));
    api.getBySlug.mockReturnValue(of(projectDetail(project)));
    createStore();
    await store.loadMemberProjects(9);

    store.pin(project);
    store.pin('slug-only');
    store.pin('slug-only');

    expect(store.pins()).toEqual([
      { kind: 'id', value: 7 },
      { kind: 'slug', value: 'slug-only' },
    ]);
    expect(storage.getItem(pinnedProjectsStorageKey(9))).toBe('[7,"slug:slug-only"]');

    store.unpin({ id: 7, slug: 'numeric-pin' });
    expect(store.isPinned(7)).toBe(false);
  });

  it('uses remote classic-compatible pins when user storage is available', async () => {
    const first = projectListItem(1, 'first');
    const pinned = projectListItem(2, 'pinned');
    storage.setItem(PINNED_PROJECTS_STORAGE_KEY, '[1]');
    pinnedApi.load.mockReturnValue(of([2]));
    api.listByMember.mockReturnValue(of([first, pinned]));
    api.getBySlug.mockReturnValue(of(projectDetail(pinned)));
    createStore();

    await store.loadMemberProjects(9);

    expect(store.pinnedProjects()).toEqual([pinned]);
    expect(storage.getItem(PINNED_PROJECTS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(pinnedProjectsStorageKey(9))).toBe('[2]');
    expect(store.selectedProject()?.id).toBe(2);
  });

  it('keeps local fallback pins isolated when switching members', async () => {
    const memberOneProject = projectListItem(11, 'member-one');
    const memberTwoProject = projectListItem(21, 'member-two');
    storage.setItem(PINNED_PROJECTS_STORAGE_KEY, '[11]');
    storage.setItem(pinnedProjectsStorageKey(2), '[21]');
    api.listByMember.mockImplementation((memberId) =>
      of(memberId === 1 ? [memberOneProject] : [memberTwoProject]),
    );
    api.getBySlug.mockImplementation((slug) =>
      of(projectDetail(slug === memberOneProject.slug ? memberOneProject : memberTwoProject)),
    );
    createStore();

    await store.loadMemberProjects(1);
    expect(store.pins()).toEqual([{ kind: 'id', value: 11 }]);
    expect(storage.getItem(PINNED_PROJECTS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(pinnedProjectsStorageKey(1))).toBe('[11]');

    await store.loadMemberProjects(2);
    expect(store.pins()).toEqual([{ kind: 'id', value: 21 }]);
    expect(store.pinnedProjects()).toEqual([memberTwoProject]);

    await store.loadMemberProjects(1);
    expect(store.pins()).toEqual([{ kind: 'id', value: 11 }]);
    expect(store.pinnedProjects()).toEqual([memberOneProject]);
  });

  it('ignores a remote pin load that completes after switching members', async () => {
    const memberOneProject = projectListItem(11, 'member-one');
    const memberTwoProject = projectListItem(21, 'member-two');
    const memberOnePins = new Subject<readonly number[]>();
    const memberTwoPins = new Subject<readonly number[]>();
    pinnedApi.load.mockReturnValueOnce(memberOnePins).mockReturnValueOnce(memberTwoPins);
    api.listByMember.mockImplementation((memberId) =>
      of(memberId === 1 ? [memberOneProject] : [memberTwoProject]),
    );
    api.getBySlug.mockImplementation((slug) =>
      of(projectDetail(slug === memberOneProject.slug ? memberOneProject : memberTwoProject)),
    );
    createStore();

    const memberOneLoad = store.loadMemberProjects(1);
    const memberTwoLoad = store.loadMemberProjects(2);
    memberTwoPins.next([21]);
    memberTwoPins.complete();
    await memberTwoLoad;

    memberOnePins.next([11]);
    memberOnePins.complete();
    await memberOneLoad;

    expect(store.pins()).toEqual([{ kind: 'id', value: 21 }]);
    expect(store.projects()).toEqual([memberTwoProject]);
    expect(storage.getItem(pinnedProjectsStorageKey(1))).toBeNull();
    expect(storage.getItem(pinnedProjectsStorageKey(2))).toBe('[21]');
  });

  it('drops queued pin saves after the auth session changes, before the next member loads', async () => {
    const memberOneFirst = projectListItem(11, 'member-one-first');
    const memberOneSecond = projectListItem(12, 'member-one-second');
    const memberTwoProject = projectListItem(21, 'member-two');
    const firstSave = new Subject<void>();
    pinnedApi.load.mockReturnValue(of([]));
    pinnedApi.save.mockReturnValueOnce(firstSave).mockReturnValue(of(undefined));
    api.listByMember.mockImplementation((memberId) =>
      of(memberId === 1 ? [memberOneFirst, memberOneSecond] : [memberTwoProject]),
    );
    api.getBySlug.mockImplementation((slug) => {
      const projects = [memberOneFirst, memberOneSecond, memberTwoProject];
      return of(projectDetail(projects.find((project) => project.slug === slug)!));
    });
    createStore();

    await store.loadMemberProjects(1);
    store.pin(memberOneFirst);
    await vi.waitFor(() => expect(pinnedApi.save).toHaveBeenCalledTimes(1));
    store.pin(memberOneSecond);

    authSessionRevision += 1;
    firstSave.next(undefined);
    firstSave.complete();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(pinnedApi.save).toHaveBeenCalledTimes(1);

    await store.loadMemberProjects(2);
    store.pin(memberTwoProject);

    await vi.waitFor(() => expect(pinnedApi.save).toHaveBeenCalledTimes(2));
    expect(pinnedApi.save.mock.calls.map(([ids]) => ids)).toEqual([[11], [21]]);
  });

  it('keeps the newest project selection when requests finish out of order', async () => {
    const older = new Subject<TaigaProjectDetail>();
    const newer = new Subject<TaigaProjectDetail>();
    api.getBySlug.mockImplementation((slug) => (slug === 'older' ? older : newer));
    createStore();

    const olderSelection = store.selectBySlug('older');
    const newerSelection = store.selectBySlug('newer');
    newer.next(projectDetail(projectListItem(2, 'newer')));
    newer.complete();
    older.next(projectDetail(projectListItem(1, 'older')));
    older.complete();

    await expect(newerSelection).resolves.toMatchObject({ slug: 'newer' });
    await expect(olderSelection).resolves.toMatchObject({ slug: 'older' });
    expect(store.selectedProject()?.slug).toBe('newer');
    expect(store.loading()).toBe(false);
  });

  it('does not replace a deep-linked project while the member list is loading', async () => {
    const list = new Subject<readonly TaigaProjectListItem[]>();
    const requested = new Subject<TaigaProjectDetail>();
    const first = projectListItem(1, 'first');
    const deepLinked = projectListItem(2, 'deep-linked');
    pinnedApi.load.mockReturnValue(of([]));
    api.listByMember.mockReturnValue(list);
    api.getBySlug.mockReturnValue(requested);
    createStore();

    const listLoad = store.loadMemberProjects(9);
    const directSelection = store.selectBySlug('deep-linked');
    list.next([first]);
    list.complete();
    await listLoad;

    expect(api.getBySlug).toHaveBeenCalledOnce();
    expect(api.getBySlug).toHaveBeenCalledWith('deep-linked');
    expect(store.selectedProject()).toBeNull();

    requested.next(projectDetail(deepLinked));
    requested.complete();
    await directSelection;

    expect(store.selectedProject()?.slug).toBe('deep-linked');
  });

  it('preserves a failed deep-link lookup instead of selecting the first listed project', async () => {
    const list = new Subject<readonly TaigaProjectListItem[]>();
    const requested = new Subject<TaigaProjectDetail>();
    const first = projectListItem(1, 'first');
    pinnedApi.load.mockReturnValue(of([]));
    api.listByMember.mockReturnValue(list);
    api.getBySlug.mockReturnValue(requested);
    createStore();

    const listLoad = store.loadMemberProjects(9);
    const lookupFailure = new Error('Missing project');
    const directSelection = store.selectBySlug('missing').catch((error: unknown) => error);
    requested.error(lookupFailure);
    await expect(directSelection).resolves.toBe(lookupFailure);

    list.next([first]);
    list.complete();
    await listLoad;

    expect(api.getBySlug).toHaveBeenCalledOnce();
    expect(store.selectedProject()).toBeNull();
    expect(store.error()).toEqual({ operation: 'select', cause: lookupFailure });
    expect(store.loading()).toBe(false);
  });

  it('recovers from an old deep-link failure when a generic project load is retried', async () => {
    const first = projectListItem(1, 'first');
    const lookupFailure = new Error('Missing project');
    pinnedApi.load.mockReturnValue(of([]));
    api.listByMember.mockReturnValue(of([first]));
    api.getBySlug.mockReturnValueOnce(throwError(() => lookupFailure));
    createStore();

    const initialList = store.loadMemberProjects(9);
    await expect(store.selectBySlug('missing')).rejects.toBe(lookupFailure);
    await initialList;
    expect(store.selectedProject()).toBeNull();
    expect(store.error()).toEqual({ operation: 'select', cause: lookupFailure });

    api.getBySlug.mockReturnValueOnce(of(projectDetail(first)));
    await store.loadMemberProjects(9);

    expect(store.selectedProject()?.slug).toBe('first');
    expect(store.error()).toBeNull();
  });

  it('exposes API failures without discarding an existing project list', async () => {
    const project = projectListItem(1, 'first');
    api.listByMember.mockReturnValueOnce(of([project]));
    api.getBySlug.mockReturnValue(of(projectDetail(project)));
    createStore();
    await store.loadMemberProjects(9);

    const failure = new Error('offline');
    api.listByMember.mockReturnValueOnce(throwError(() => failure));

    await expect(store.loadMemberProjects(9)).rejects.toBe(failure);
    expect(store.projects()).toEqual([project]);
    expect(store.error()).toEqual({ operation: 'list', cause: failure });
    expect(store.loading()).toBe(false);
  });
});

describe('pinned project normalization', () => {
  it('accepts legacy IDs, modern slugs and old object-shaped values deterministically', () => {
    expect(normalizeStoredPins([3, '3', 'slug:alpha', 'alpha', { slug: 'beta' }, null])).toEqual([
      { kind: 'id', value: 3 },
      { kind: 'slug', value: 'alpha' },
      { kind: 'slug', value: 'beta' },
    ]);
  });
});

function projectListItem(id: number, slug: string): TaigaProjectListItem {
  return {
    id,
    slug,
    name: slug,
    description: '',
    is_private: true,
    i_am_member: true,
    i_am_admin: false,
    i_am_owner: false,
    is_backlog_activated: true,
    is_kanban_activated: true,
    is_issues_activated: true,
    is_epics_activated: true,
    is_wiki_activated: true,
    my_permissions: [],
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
  };
}

function projectDetail(project: TaigaProjectListItem): TaigaProjectDetail {
  return {
    ...project,
    members: [],
    us_statuses: [],
    tags: [],
    tags_colors: {},
  };
}
