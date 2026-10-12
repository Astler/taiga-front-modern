import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import { StoryEditorLayoutService } from '../../../shared/story-editor-layout.service';
import { KanbanSortPreferenceService } from '../data/kanban-sort-preference.service';
import { KanbanPointsVisibilityService } from '../data/kanban-points-visibility.service';
import {
  KanbanApiService,
  KanbanFilterPresetsService,
  type KanbanLane,
  type KanbanMoveRequest,
  type KanbanFilterPreset,
  type KanbanSortMode,
  type KanbanProjectSnapshot,
  type KanbanStatus,
  type KanbanUserStory,
} from '../data';
import { KanbanBoard } from './kanban-board';

describe('KanbanBoard', () => {
  const load = vi.fn();
  const moveUserStories = vi.fn();
  const createUserStories = vi.fn();
  const getUserStory = vi.fn();
  const updateUserStory = vi.fn();
  const uploadAttachment = vi.fn();
  const listAttachments = vi.fn();
  const deleteAttachment = vi.fn();
  const deleteUserStory = vi.fn();
  const listTaskStatuses = vi.fn();
  const createTask = vi.fn();
  const updateTask = vi.fn();
  const deleteTask = vi.fn();
  const getStoryHistory = vi.fn();
  const editStoryHistoryComment = vi.fn();
  const deleteStoryHistoryComment = vi.fn();
  const addStoryComment = vi.fn();
  const updateStoryPoints = vi.fn();
  const loadPresets = vi.fn();
  const savePresets = vi.fn();
  const readSort = vi.fn();
  const loadRemoteSort = vi.fn();
  const saveSort = vi.fn();
  const cacheSort = vi.fn();
  const fullscreenPreference = signal(false);
  const pointsVisible = signal(false);
  const loadPoints = vi.fn();

  beforeEach(async () => {
    fullscreenPreference.set(false);
    pointsVisible.set(false);
    loadPoints.mockClear();
    load.mockReset();
    moveUserStories.mockReset();
    createUserStories.mockReset();
    getUserStory.mockReset();
    updateUserStory.mockReset();
    uploadAttachment.mockReset();
    listAttachments.mockReset().mockReturnValue(of([]));
    deleteAttachment.mockReset();
    deleteUserStory.mockReset();
    deleteUserStory.mockReturnValue(of(undefined));
    listTaskStatuses.mockReset();
    createTask.mockReset();
    updateTask.mockReset();
    deleteTask.mockReset();
    listTaskStatuses.mockReturnValue(of([
      { id: 1, name: 'Ready', color: '#777', order: 0, is_closed: false },
      { id: 2, name: 'Done', color: '#7d7', order: 1, is_closed: true },
    ]));
    createTask.mockReturnValue(of({ id: 322, subject: 'New task', status: 1, is_closed: false }));
    updateTask.mockReturnValue(of({ id: 321, subject: 'Renamed task', status: 2, is_closed: true }));
    deleteTask.mockReturnValue(of(undefined));
    getStoryHistory.mockReset();
    editStoryHistoryComment.mockReset();
    deleteStoryHistoryComment.mockReset();
    editStoryHistoryComment.mockReturnValue(of(undefined));
    deleteStoryHistoryComment.mockReturnValue(of(undefined));
    addStoryComment.mockReset();
    updateStoryPoints.mockReset();
    updateStoryPoints.mockReturnValue(of(stories()[0]));
    getStoryHistory.mockReturnValue(of([]));
    addStoryComment.mockImplementation((storyId, comment) => of({
      ...stories().find(({ id }) => id === storyId)!,
      total_comments: 1,
    }));
    loadPresets.mockReset();
    savePresets.mockReset();
    load.mockReturnValue(of({ swimlanes: [], userStories: stories() }));
    moveUserStories.mockReturnValue(of([]));
    createUserStories.mockReturnValue(of([]));
    getUserStory.mockImplementation((storyId: number) =>
      of(stories().find(({ id }) => id === storyId)),
    );
    updateUserStory.mockImplementation((request) =>
      of({
        ...stories().find(({ id }) => id === request.storyId)!,
        ...request.changes,
        tags: request.changes.tags.map((name: string) => [name, null] as const),
      }),
    );
    uploadAttachment.mockImplementation((request) =>
      of({
        id: 12,
        name: request.file.name,
        url: `https://files.example.test/${request.file.name}`,
        size: request.file.size,
      }),
    );
    deleteAttachment.mockReturnValue(of(undefined));
    loadPresets.mockReturnValue(of([]));
    savePresets.mockReturnValue(of(undefined));
    readSort.mockReset().mockReturnValue('manual');
    loadRemoteSort.mockReset().mockReturnValue(of(null));
    saveSort.mockReset();
    cacheSort.mockReset();

    await TestBed.configureTestingModule({
      imports: [KanbanBoard],
      providers: [
        {
          provide: KanbanApiService,
          useValue: {
            load,
            moveUserStories,
            createUserStories,
            getUserStory,
            updateUserStory,
            uploadAttachment,
            listAttachments,
            deleteAttachment,
            deleteUserStory,
            listTaskStatuses,
            createTask,
            updateTask,
            deleteTask,
            getStoryHistory,
            editStoryHistoryComment,
            deleteStoryHistoryComment,
            addStoryComment,
            updateStoryPoints,
          },
        },
        {
          provide: KanbanFilterPresetsService,
          useValue: { load: loadPresets, save: savePresets },
        },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 7, full_name_display: 'Ada Lovelace' }),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: 'https://legacy.example.test/' }) },
        },
        {
          provide: StoryEditorLayoutService,
          useValue: { fullscreen: fullscreenPreference.asReadonly() },
        },
        {
          provide: KanbanPointsVisibilityService,
          useValue: { visibleFor: () => pointsVisible(), load: loadPoints },
        },
        {
          provide: KanbanSortPreferenceService,
          useValue: {
            readLocal: readSort,
            loadRemote: loadRemoteSort,
            save: saveSort,
            cacheLocal: cacheSort,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders active columns and filters cards by text, tag, and assignee', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('.search-field input[type="search"]')!;
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(17);
    expect(host.querySelector('.board-heading')).toBeNull();
    expect(host.querySelector('.board-toolbar')).toBeTruthy();
    expect(search.getAttribute('aria-label')).toBe('Search stories');
    expect(search.closest('.search-field')?.textContent?.trim()).toBe('');
    expect(columnNames(host)).toEqual(['Ready', 'Done']);
    expect(cardSubjects(host)).toEqual([
      '#101 Build login',
      '#103 Polish navigation',
      '#102 Fix billing',
    ]);
    setControlValue(search, 'billing', 'input');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#102 Fix billing']);
    expect(host.querySelector('.filter-count-badge')?.textContent?.trim()).toBe('1');
    expect(host.querySelector('button[aria-label^="Sort stories"]')).toBeTruthy();
    expect(host.querySelector('.board-count')?.textContent).toContain('2 open');
    expect(host.querySelector('.board-count')?.textContent).toContain('1 matching');

    setControlValue(search, '#101', 'input');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#101 Build login']);

    clearFilters(host);
    fixture.detectChanges();
    openAdvancedFilters(host, fixture);
    setControlValue(filterSelect(host, 'tags'), 'frontend', 'change');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#101 Build login', '#103 Polish navigation']);

    clearFilters(host);
    fixture.detectChanges();
    setControlValue(filterSelect(host, 'assigned_users'), '8', 'change');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#103 Polish navigation', '#102 Fix billing']);

    clearFilters(host);
    fixture.detectChanges();
    expect(cardSubjects(host)).toHaveLength(3);
  });

  it('keeps assignee names accessible without rendering the hidden label into the card', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const firstCard = host.querySelector<HTMLElement>('.story-card')!;
    const people = firstCard.querySelector<HTMLElement>('.assignees')!;

    expect(people.getAttribute('aria-label')).toBe('Assigned to Ada Lovelace');
    expect(firstCard.textContent).not.toContain('Assigned to');
  });

  it('renders every story tag instead of collapsing tags that still fit', async () => {
    load.mockReturnValue(
      of({
        swimlanes: [],
        userStories: [
          {
            ...stories()[0]!,
            tags: [
              ['frontend', '#6750a4'],
              ['release', '#4caf50'],
              ['desktop', '#2196f3'],
              ['urgent', '#f44336'],
            ],
          },
        ],
      }),
    );
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const tags = [...host.querySelectorAll('.story-tag')].map((tag) => tag.textContent?.trim());
    expect(tags).toEqual(['frontend', 'release', 'desktop', 'urgent']);
    expect(host.querySelector('.story-tag-overflow')).toBeNull();
  });

  it('opens a live story detail panel without leaving the modern board', async () => {
    const detail = {
      ...stories()[0]!,
      description: 'Login work that must ship with the release.',
      created_date: '2026-10-01T10:00:00Z',
      modified_date: '2026-10-08T14:30:00Z',
      milestone_name: 'October release',
      total_points: 8,
      tasks: [
        { id: 1, subject: 'Wire API', is_closed: true },
        { id: 2, subject: 'Polish states', is_closed: false },
      ],
      attachments: [{ id: 7, name: 'login.png', url: 'https://files.example.test/login.png' }],
    } satisfies KanbanUserStory;
    getUserStory.mockReturnValue(of(detail));
    listAttachments.mockReturnValue(of([
      { id: 7, name: 'login.png', url: 'https://files.example.test/login.png',
        preview_url: 'https://files.example.test/login.png', size: 1024 },
    ]));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getUserStory).toHaveBeenCalledWith(101);
    const modal = host.querySelector<HTMLDialogElement>('dialog.story-drawer-backdrop')!;
    expect(modal?.open).toBe(true);
    expect(modal.getAttribute('aria-labelledby')).toBe('story-detail-101');
    expect(host.querySelector('.story-drawer h2')?.textContent).toContain('Build login');
    expect(host.querySelector<HTMLTextAreaElement>('.editor-field textarea')?.value).toContain(
      'Login work that must ship with the release.',
    );
    expect(host.querySelector('.detail-section-heading span')?.textContent).toContain('1/2');
    expect(listAttachments).toHaveBeenCalledWith(17, 101);
    expect(host.querySelector('.detail-attachment-grid')?.textContent).toContain('login.png');
    expect(host.querySelector('.story-drawer-footer a')).toBeNull();

    host.querySelector<HTMLButtonElement>('.drawer-close')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.story-drawer')).toBeNull();
    expect(host.ownerDocument.activeElement).toBe(
      host.querySelector<HTMLButtonElement>('[data-story-details-trigger="101"]'),
    );
  });

  it('switches between side and fullscreen without losing unsaved edits', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = host.querySelector<HTMLDialogElement>('dialog.story-drawer-backdrop')!;
    expect(dialog?.open).toBe(true);
    const aside = host.querySelector<HTMLElement>('.story-drawer')!;
    const title = aside.querySelector<HTMLInputElement>('input[type="text"]')!;
    setControlValue(title, 'Unsaved new title', 'input');
    fixture.detectChanges();

    const resize = aside.querySelector<HTMLButtonElement>('.drawer-resize')!;
    expect(aside.classList.contains('story-drawer-fullscreen')).toBe(false);
    resize.click();
    fixture.detectChanges();

    expect(aside.classList.contains('story-drawer-fullscreen')).toBe(true);
    expect(host.querySelector('dialog.story-drawer-backdrop')).toBe(dialog);
    expect(dialog.open).toBe(true);
    expect(aside.querySelector('input[type="text"]')).toBe(title);
    expect(title.value).toBe('Unsaved new title');
    expect(host.querySelector('.story-drawer-backdrop')?.classList
      .contains('story-editor-fullscreen')).toBe(true);

    resize.click();
    fixture.detectChanges();
    expect(aside.classList.contains('story-drawer-fullscreen')).toBe(false);
    expect(title.value).toBe('Unsaved new title');

    host.querySelector<HTMLButtonElement>('.drawer-close')!.click();
    fixture.detectChanges();
    fullscreenPreference.set(true);
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.story-drawer-fullscreen')).toBeTruthy();
  });

  it('closes a native story dialog on browser cancel without leaving a stale editor', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = host.querySelector<HTMLDialogElement>('dialog.story-drawer-backdrop')!;
    expect(dialog.open).toBe(true);
    const cancel = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancel);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(cancel.defaultPrevented).toBe(true);
    expect(host.querySelector('.story-drawer')).toBeNull();
  });

  it('requires delete_us permission and explicit confirmation before deleting a story', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: ['modify_us'],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.story-delete-button')).toBeNull();
    fixture.destroy();

    const writable = TestBed.createComponent(KanbanBoard);
    writable.componentRef.setInput('project', {
      ...project(), my_permissions: ['delete_us', 'modify_us'],
    });
    writable.detectChanges();
    await writable.whenStable();
    writable.detectChanges();
    const root = writable.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.story-subject')!.click();
    writable.detectChanges();
    await writable.whenStable();
    writable.detectChanges();

    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    try {
      const deleteButton = root.querySelector<HTMLButtonElement>('.story-delete-button')!;
      expect(deleteButton).toBeTruthy();
      deleteButton.click();
      writable.detectChanges();
      expect(deleteUserStory).not.toHaveBeenCalled();
      expect(root.querySelector('.story-drawer')).toBeTruthy();

      deleteButton.click();
      await writable.whenStable();
      writable.detectChanges();
      expect(deleteUserStory).toHaveBeenCalledWith(101);
      expect(root.querySelector('.story-drawer')).toBeNull();
      expect(cardSubjects(root)).not.toContain('#101 Build login');
    } finally {
      confirm.mockRestore();
    }
  });

  it('manages task create, rename, completion and delete from the native story editor', async () => {
    const detail = {
      ...stories()[0]!,
      tasks: [{ id: 321, subject: 'First task', status: 1, is_closed: false, version: 1 }],
    };
    getUserStory.mockReturnValue(of(detail));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: [
        'modify_us', 'add_task', 'modify_task', 'delete_task',
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelectorAll('.detail-task-row')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('.task-add-button')!.click();
    fixture.detectChanges();
    const input = host.querySelector<HTMLInputElement>('.task-new-form input')!;
    setControlValue(input, 'New task', 'input');
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.task-new-form button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(createTask).toHaveBeenCalledWith(17, 101, 'New task');
    expect(host.querySelectorAll('.detail-task-row')).toHaveLength(2);

    const rename = host.querySelector<HTMLButtonElement>('[aria-label="Rename task First task"]')!;
    rename.click();
    fixture.detectChanges();
    const renameInput = host.querySelector<HTMLInputElement>('.detail-task-row .task-edit-form input')!;
    setControlValue(renameInput, 'Renamed task', 'input');
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.detail-task-row .task-edit-form button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(updateTask).toHaveBeenCalledWith(321, { subject: 'Renamed task' }, 1);

    const status = host.querySelector<HTMLSelectElement>('.detail-task-row select')!;
    setControlValue(status, '2', 'change');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(updateTask).toHaveBeenCalledWith(321, { status: 2 }, undefined);

    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    try {
      host.querySelector<HTMLButtonElement>('[aria-label="Delete task Renamed task"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(deleteTask).toHaveBeenCalledWith(321);
      expect(host.querySelectorAll('.detail-task-row')).toHaveLength(1);
    } finally {
      confirm.mockRestore();
    }
  });

  it('hides task mutations without task permissions', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: ['modify_us'],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.task-add-button')).toBeNull();
    expect(host.querySelector('.task-delete-button')).toBeNull();
    expect(host.querySelector('.detail-task-row select')).toBeNull();
  });

  it('hides points everywhere by default, and restores them when the project preference is enabled', async () => {
    const storyWithPoints = {
      ...stories()[0]!,
      total_points: 5,
      points: { '8': 5 },
    };
    load.mockReturnValue(of({ swimlanes: [], userStories: [storyWithPoints] }));
    getUserStory.mockReturnValue(of(storyWithPoints));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(),
      roles: [{ id: 8, name: 'Design', computable: true }],
      points: [
        { id: 4, name: '?', value: null, order: 0 },
        { id: 5, name: '5', value: 5, order: 1 },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(loadPoints).toHaveBeenCalledWith(17);
    expect(host.querySelector('.story-card .points')).toBeNull();
    const board = fixture.componentInstance as unknown as {
      sortOptions: () => readonly { value: string }[];
      selectSort: (mode: string) => void;
      sortMode: () => string;
    };
    expect(board.sortOptions().some(({ value }) => value === 'points')).toBe(false);
    board.selectSort('points');
    expect(board.sortMode()).toBe('manual');

    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.story-estimation')).toBeNull();
    expect(host.querySelector('.points-field')).toBeNull();

    pointsVisible.set(true);
    fixture.detectChanges();
    expect(host.querySelector('.story-estimation')).toBeTruthy();
    expect(host.querySelector('.points-field')).toBeTruthy();
    expect(board.sortOptions().some(({ value }) => value === 'points')).toBe(true);
    expect(host.querySelector('.story-card .points')?.textContent).toContain('5 pts');

    pointsVisible.set(false);
    fixture.detectChanges();
    expect(host.querySelector('.story-estimation')).toBeNull();
    expect(host.querySelector('.points-field')).toBeNull();
    expect(host.querySelector('.story-card .points')).toBeNull();
    expect(board.sortOptions().some(({ value }) => value === 'points')).toBe(false);
  });

  it('edits Taiga story points by computable role and hides non-computable roles', async () => {
    pointsVisible.set(true);
    const detail = {
      ...stories()[0]!,
      points: { '8': 4 },
      total_points: null,
      version: 6,
    };
    getUserStory.mockReturnValue(of(detail));
    updateStoryPoints.mockReturnValue(of({
      ...detail, points: { '8': 5 }, total_points: 3, version: 7,
    }));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(),
      roles: [
        { id: 8, name: 'Frontend', computable: true },
        { id: 9, name: 'Viewer', computable: false },
      ],
      points: [
        { id: 4, name: '?', value: null, order: 0 },
        { id: 5, name: '3', value: 3, order: 1 },
      ],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const selected = host.querySelector<HTMLSelectElement>('[aria-label="Points for Frontend"]')!;
    expect(selected).toBeTruthy();
    expect(selected.value).toBe('4');
    expect(host.querySelector('[aria-label="Points for Viewer"]')).toBeNull();
    setControlValue(selected, '5', 'change');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateStoryPoints).toHaveBeenCalledWith(101, { '8': 5 }, 6);
    expect(host.querySelector('.points-value')?.textContent).toContain('3');
    expect(selected.value).toBe('5');

    fixture.componentRef.setInput('project', {
      ...project(),
      my_permissions: [],
      roles: [{ id: 8, name: 'Frontend', computable: true }],
      points: [
        { id: 4, name: '?', value: null, order: 0 },
        { id: 5, name: '3', value: 3, order: 1 },
      ],
    });
    fixture.detectChanges();
    expect(selected.disabled).toBe(true);
  });

  it('loads and posts comments inside the editor when comment_us is granted', async () => {
    getStoryHistory.mockReturnValueOnce(of([
      { id: 'old', comment: 'Nice work', user: { name: 'Grace' } },
    ])).mockReturnValueOnce(of([
      { id: 'old', comment: 'Nice work', user: { name: 'Grace' } },
      { id: 'new', comment: 'Looks done', user: { name: 'Ada' } },
    ]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: ['modify_us', 'comment_us'],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('.story-comments-list')?.textContent).toContain('Nice work');
    const textarea = host.querySelector<HTMLTextAreaElement>('.story-comment-form textarea')!;
    setControlValue(textarea, 'Looks done', 'input');
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.story-comment-form button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(addStoryComment).toHaveBeenCalledWith(101, 'Looks done', undefined);
    expect(host.querySelector('.story-comments-list')?.textContent).toContain('Looks done');
    expect(textarea.value).toBe('');
  });

  it('shows edit and delete only for own comments and saves changes from the same editor', async () => {
    const own = { id: 'own-1', comment: 'My original', user: { pk: 7, name: 'Ada' } };
    const other = { id: 'other-1', comment: 'Other comment', user: { pk: 8, name: 'Grace' } };
    getStoryHistory.mockReturnValueOnce(of([own, other]))
      .mockReturnValueOnce(of([{ ...own, comment: 'Revised wording' }, other]))
      .mockReturnValueOnce(of([other]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: ['comment_us'],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelectorAll('.story-comment-actions')).toHaveLength(1);
    expect(host.querySelector('[aria-label="Edit comment by Grace"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-label="Edit comment by Ada"]')!.click();
    fixture.detectChanges();
    const textarea = host.querySelector<HTMLTextAreaElement>('.story-comment-edit textarea')!;
    textarea.value = 'Revised wording';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.story-comment-edit-actions button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(editStoryHistoryComment).toHaveBeenCalledWith(101, 'own-1', 'Revised wording');
    expect(host.querySelector('.story-comments-list')?.textContent).toContain('Revised wording');

    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      const del = host.querySelector<HTMLButtonElement>('[aria-label="Delete comment by Ada"]')!;
      del.click();
      fixture.detectChanges();
      expect(deleteStoryHistoryComment).not.toHaveBeenCalled();
      del.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(deleteStoryHistoryComment).toHaveBeenCalledWith(101, 'own-1');
      expect(host.querySelector('.story-comments-list')?.textContent).not.toContain('Revised wording');
      expect(host.querySelector('.story-comments-list')?.textContent).toContain('Other comment');
    } finally {
      confirm.mockRestore();
    }
  });

  it('renders existing comments read-only without comment_us permission', async () => {
    getStoryHistory.mockReturnValue(of([
      { id: 'old', comment: 'Read-only comment', user: { name: 'Grace' } },
    ]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: [],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.story-comments-list')?.textContent).toContain('Read-only comment');
    expect(host.querySelector('.story-comment-form')).toBeNull();
  });

  it('saves story edits from the modern drawer without an external editor', async () => {
    const detail = { ...stories()[0]!, description: 'Old description', version: 3 };
    getUserStory.mockReturnValue(of(detail));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const title = host.querySelector<HTMLInputElement>('.story-drawer input[type="text"]')!;
    setControlValue(title, 'Build secure login', 'input');
    fixture.detectChanges();
    host
      .querySelector<HTMLFormElement>('#story-editor')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateUserStory).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 17,
        storyId: 101,
        version: 3,
        changes: expect.objectContaining({ subject: 'Build secure login' }),
      }),
    );
    expect(host.querySelector('.story-drawer h2')?.textContent).toContain('Build secure login');
    expect(host.querySelector('.story-drawer-footer a')).toBeNull();
  });

  it('renders real image previews and document cards from full attachment metadata', async () => {
    getUserStory.mockReturnValue(of({
      ...stories()[0]!,
      attachments: [
        { id: 10, attached_file: 'attachments/screenshot.png', thumbnail_card_url: '/tiny.png' },
      ],
      total_attachments: 3,
    }));
    listAttachments.mockReturnValue(of([
      {
        id: 10, name: 'screenshot.png',
        url: 'https://files.example.test/screenshot.png',
        preview_url: 'https://files.example.test/screenshot.png',
        thumbnail_card_url: 'https://files.example.test/thumb.png',
        size: 20480,
      },
      {
        id: 11, name: 'specification.pdf',
        url: 'https://files.example.test/specification.pdf',
        size: 4096,
      },
      {
        id: 12, name: 'project.zip',
        url: 'https://files.example.test/project.zip',
        size: 256000,
      },
    ]));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(listAttachments).toHaveBeenCalledWith(17, 101);
    const cards = host.querySelectorAll<HTMLElement>('.detail-attachment-grid .attachment-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]?.querySelector('img')?.getAttribute('src'))
      .toBe('https://files.example.test/thumb.png');
    expect(cards[0]?.querySelector('.attachment-file-meta')?.textContent).toContain('20.0 KB');
    expect(cards[1]?.textContent).toContain('specification.pdf');
    expect(cards[1]?.querySelector('.attachment-type-preview')?.textContent).toContain('PDF');
    expect(cards[2]?.querySelector('.attachment-type-preview')?.textContent).toContain('ZIP');
    expect(cards[2]?.querySelector('a.attachment-open-link')?.getAttribute('href'))
      .toBe('https://files.example.test/project.zip');
    expect(host.querySelector('.file-drop-zone-compact')).toBeTruthy();

    cards[0]!.querySelector<HTMLButtonElement>('.attachment-image-trigger')!.click();
    fixture.detectChanges();
    const preview = host.querySelector<HTMLDialogElement>('.attachment-lightbox')!;
    expect(preview).toBeTruthy();
    expect(preview.querySelector('img')?.getAttribute('src'))
      .toBe('https://files.example.test/screenshot.png');
    expect(preview.querySelector('a')?.getAttribute('href'))
      .toBe('https://files.example.test/screenshot.png');

    preview.querySelector<HTMLButtonElement>('[aria-label="Close attachment preview"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.attachment-lightbox')).toBeNull();
    expect(host.querySelector('dialog.story-drawer-backdrop')?.getAttribute('open')).not.toBeNull();
  });

  it('supports video preview and PDF original links without embedding arbitrary document URLs', async () => {
    listAttachments.mockReturnValue(of([
      { id: 20, name: 'recording.webm', url: 'https://files.example.test/recording.webm' },
      { id: 21, name: 'report.pdf', url: 'https://files.example.test/report.pdf' },
    ]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const gallery = host.querySelector<HTMLElement>('.detail-attachment-grid')!;
    gallery.querySelector<HTMLButtonElement>('.attachment-video-trigger')!.click();
    fixture.detectChanges();
    const preview = host.querySelector<HTMLDialogElement>('.attachment-lightbox')!;
    expect(preview.querySelector('video')?.getAttribute('src'))
      .toBe('https://files.example.test/recording.webm');
    preview.dispatchEvent(new Event('cancel', { cancelable: true }));
    fixture.detectChanges();
    expect(host.querySelector('.attachment-lightbox')).toBeNull();
    expect(host.querySelector('.story-drawer')).toBeTruthy();
    expect(gallery.querySelector('iframe')).toBeNull();
    expect(gallery.querySelector('a[href$=".pdf"]')?.getAttribute('target')).toBe('_blank');
  });

  it('retries failed attachment metadata without hiding the rest of the story editor', async () => {
    listAttachments
      .mockReturnValueOnce(throwError(() => new Error('Network unavailable')))
      .mockReturnValueOnce(of([
        { id: 19, name: 'restored.png', url: 'https://files.example.test/restored.png' },
      ]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('.file-metadata-error')).toBeTruthy();
    expect(host.querySelector('.story-drawer h2')).toBeTruthy();
    host.querySelector<HTMLButtonElement>('.file-metadata-error button')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.file-metadata-error')).toBeNull();
    expect(host.querySelector('.detail-attachment-grid')?.textContent).toContain('restored.png');
  });

  it('keeps the files block visible and uploads an image pasted into the editor', async () => {
    const detail = { ...stories()[0]!, attachments: [], total_attachments: 0 };
    getUserStory.mockReturnValue(of(detail));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.story-subject')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('.files-section')?.textContent).toContain('No files attached yet.');
    expect(host.querySelector('.points-control')).toBeNull();
    const file = new File(['image data'], 'clipboard.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file] } });
    host.querySelector<HTMLFormElement>('#story-editor')!.dispatchEvent(paste);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(paste.defaultPrevented).toBe(true);
    expect(uploadAttachment).toHaveBeenCalledWith({ projectId: 17, storyId: 101, file });
    expect(host.querySelector('.detail-attachment-grid')?.textContent).toContain('clipboard.png');
  });


  it('restores a saved project sort and applies remote account preference on first load', async () => {
    readSort.mockReturnValue('newest');
    loadRemoteSort.mockReturnValue(of('title'));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(readSort).toHaveBeenCalledWith(7, 17);
    expect(loadRemoteSort).toHaveBeenCalledWith(7, 17);
    expect(cacheSort).toHaveBeenCalledWith(7, 17, 'title');
    expect(saveSort).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label^="Sort stories"]')?.getAttribute('aria-label'),
    ).toContain('Title A–Z');
  });

  it('keeps the sort when choosing built-in filter chips and saves explicit changes', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const board = fixture.componentInstance as unknown as {
      selectSort(mode: KanbanSortMode): void;
      applyPreset(preset: KanbanFilterPreset): void;
    };
    const host = fixture.nativeElement as HTMLElement;

    board.selectSort('newest');
    fixture.detectChanges();
    expect(saveSort).toHaveBeenLastCalledWith(7, 17, 'newest');
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label^="Sort stories"]')?.getAttribute('aria-label'),
    ).toContain('Newest created');

    const allWork = [...host.querySelectorAll<HTMLButtonElement>('.preset-chip')].find(
      ({ textContent }) => textContent?.trim() === 'All work',
    )!;
    allWork.click();
    fixture.detectChanges();
    expect(allWork.classList.contains('preset-chip-active')).toBe(true);
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label^="Sort stories"]')?.getAttribute('aria-label'),
    ).toContain('Newest created');
    expect(saveSort).toHaveBeenCalledTimes(1);

    board.applyPreset({
      id: 'saved:deadline',
      name: 'Deadline view',
      query: '',
      sort: 'due',
      filters: [],
    });
    fixture.detectChanges();
    expect(saveSort).toHaveBeenLastCalledWith(7, 17, 'due');
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label^="Sort stories"]')?.getAttribute('aria-label'),
    ).toContain('Due date');
  });

  it('does not overwrite a newer choice with a delayed server response', async () => {
    pointsVisible.set(true);
    const pending = new Subject<KanbanSortMode | null>();
    loadRemoteSort.mockReturnValue(pending);

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    const board = fixture.componentInstance as unknown as {
      selectSort(mode: KanbanSortMode): void;
    };
    board.selectSort('points');
    fixture.detectChanges();

    pending.next('manual');
    pending.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(saveSort).toHaveBeenCalledWith(7, 17, 'points');
    expect(cacheSort).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label^="Sort stories"]')?.getAttribute('aria-label'),
    ).toContain('Highest points');
  });

  it('restores a separate sort when changing projects and ignores stale project responses', async () => {
    const firstResponse = new Subject<KanbanSortMode | null>();
    readSort.mockImplementation((_user: number, projectId: number) =>
      projectId === 17 ? 'newest' : 'updated',
    );
    loadRemoteSort.mockReturnValueOnce(firstResponse).mockReturnValueOnce(of(null));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();

    fixture.componentRef.setInput('project', {
      ...project(),
      id: 18,
      slug: 'beta',
      name: 'Beta',
    });
    fixture.detectChanges();
    firstResponse.next('due');
    firstResponse.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(readSort).toHaveBeenCalledWith(7, 17);
    expect(readSort).toHaveBeenCalledWith(7, 18);
    expect(loadRemoteSort).toHaveBeenCalledWith(7, 18);
    expect(cacheSort).not.toHaveBeenCalled();
    expect(saveSort).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label^="Sort stories"]')?.getAttribute('aria-label'),
    ).toContain('Recently updated');
  });

  it('applies project-specific saved views', async () => {
    loadPresets.mockReturnValue(
      of([
        {
          id: 'backend-view',
          name: 'Backend',
          query: '',
          sort: 'manual',
          filters: [
            {
              category: 'tags',
              value: 'backend',
              label: 'backend',
              mode: 'include',
            },
          ],
        },
      ]),
    );
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const backend = [...host.querySelectorAll<HTMLButtonElement>('.preset-chip')].find(
      ({ textContent }) => textContent?.trim() === 'Backend',
    );
    expect(backend).toBeTruthy();
    backend!.click();
    fixture.detectChanges();

    expect(loadPresets).toHaveBeenCalledWith(17);
    expect(cardSubjects(host)).toEqual(['#102 Fix billing']);
    expect(backend!.classList.contains('preset-chip-active')).toBe(true);
  });

  it('quick-creates one or more stories in the selected column', async () => {
    const createdStories = [
      story(104, 'First new story', 1, 40, 'new'),
      story(105, 'Second new story', 1, 50, 'new'),
    ];
    createUserStories.mockReturnValue(of(createdStories));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    load.mockReturnValueOnce(of({ swimlanes: [], userStories: [...stories(), ...createdStories] }));
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[aria-label="Add story to Ready"]')!.click();
    fixture.detectChanges();

    const textarea = host.querySelector<HTMLTextAreaElement>('.quick-create textarea')!;
    textarea.value = ' First new story \nSecond new story';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    host
      .querySelector<HTMLFormElement>('.quick-create')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 1,
      swimlaneId: null,
      subjects: 'First new story\nSecond new story',
    });
    expect(cardSubjects(host)).toContain('#104 First new story');
    expect(host.querySelector('.quick-create')).toBeNull();
    expect(host.ownerDocument.activeElement).toBe(
      host.querySelector<HTMLButtonElement>('[aria-label="Add story to Ready"]'),
    );
  });

  it('closes and clears quick create after an unconfirmed response to prevent duplicates', async () => {
    const possiblyCreated = story(104, 'Possibly created', 1, 40, 'new');
    createUserStories.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 0, statusText: 'Network error' })),
    );

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    load.mockReturnValueOnce(of({ swimlanes: [], userStories: [...stories(), possiblyCreated] }));

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[aria-label="Add story to Ready"]')!.click();
    fixture.detectChanges();
    const textarea = host.querySelector<HTMLTextAreaElement>('.quick-create textarea')!;
    textarea.value = 'Possibly created';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    host
      .querySelector<HTMLFormElement>('.quick-create')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createUserStories).toHaveBeenCalledOnce();
    expect(host.querySelector('.quick-create')).toBeNull();
    expect(cardSubjects(host)).toContain('#104 Possibly created');
    expect(host.querySelector('[aria-live="polite"]')?.textContent).toContain('did not confirm');
  });

  it('derives open and overdue state from tasks before the story status', async () => {
    load.mockReturnValue(
      of({
        swimlanes: [],
        userStories: [
          {
            ...story(201, 'Closed status with open task', 2, 10, 'tasks'),
            due_date: '2000-01-01',
            tasks: [{ id: 1, is_closed: false }],
          },
          {
            ...story(202, 'Open status with closed tasks', 1, 20, 'tasks'),
            due_date: '2000-01-01',
            tasks: [{ id: 2, is_closed: true }],
            milestone_name: 'Release candidate',
          },
        ],
      }),
    );
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.board-count')?.textContent).toContain('1 open');
    const cards = [...host.querySelectorAll<HTMLElement>('.story-card')];
    const openTaskCard = cards.find((card) => card.textContent?.includes('#201'))!;
    const closedTaskCard = cards.find((card) => card.textContent?.includes('#202'))!;
    expect(openTaskCard.textContent).toContain('Overdue');
    expect(closedTaskCard.textContent).not.toContain('Overdue');
    expect(closedTaskCard.querySelector('.milestone')?.textContent?.trim()).toBe(
      'Release candidate',
    );
  });

  it('keeps drags and drop lists enabled while filters hide board order', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const drags = fixture.debugElement
      .queryAll(By.directive(CdkDrag))
      .map((element) => element.injector.get(CdkDrag));
    const handles = fixture.debugElement.queryAll(By.directive(CdkDragHandle));
    const lists = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .map((element) => element.injector.get(CdkDropList));
    expect(drags.every(({ disabled }) => !disabled)).toBe(true);
    expect(handles).toHaveLength(0);
    expect(lists.every(({ disabled }) => !disabled)).toBe(true);
    expect(
      [...host.querySelectorAll<HTMLElement>('.story-card')].every((card) =>
        card.classList.contains('story-card-draggable'),
      ),
    ).toBe(true);

    setControlValue(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      'login',
      'input',
    );
    fixture.detectChanges();

    expect(drags.every(({ disabled }) => !disabled)).toBe(true);
    expect(lists.every(({ disabled }) => !disabled)).toBe(true);
    expect(host.textContent).not.toContain('Clear filters to drag cards');
  });

  it('keeps automatic sorting after a cross-column drop and uses canonical Taiga anchors', async () => {
    const existing = [
      { ...story(101, 'Move me', 1, 10, 'frontend'), created_date: '2026-10-06' },
      { ...story(102, 'Older done', 2, 30, 'backend'), created_date: '2026-10-01' },
      { ...story(104, 'Newer done', 2, 40, 'frontend'), created_date: '2026-10-10' },
    ];
    const refreshed = existing.map((candidate) =>
      candidate.id === 101 ? { ...candidate, status: 2, kanban_order: 50 } : candidate,
    );
    load.mockReturnValueOnce(of({ swimlanes: [], userStories: existing }))
      .mockReturnValueOnce(of({ swimlanes: [], userStories: refreshed }));
    moveUserStories.mockReturnValue(
      of([{ id: 101, status: 2, swimlane: null, kanban_order: 50 }]),
    );

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const board = fixture.componentInstance as unknown as {
      selectSort(mode: KanbanSortMode): void;
      sortMode(): KanbanSortMode;
      dropStory(
        event: CdkDragDrop<readonly KanbanUserStory[]>,
        lane: KanbanLane,
        status: KanbanStatus,
      ): Promise<void>;
    };
    board.selectSort('newest');
    fixture.detectChanges();
    // Sorted order is 104, 102; the underlying manual order is 102, 104.
    // Dropping on a sorted list must NOT use sorted neighbours as manual anchors.
    await board.dropStory(
      {
        item: { data: existing[0] },
        currentIndex: 0,
        isPointerOverContainer: true,
      } as unknown as CdkDragDrop<readonly KanbanUserStory[]>,
      { id: null, name: null },
      status(2, 'Done', 20),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(moveUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 2,
      swimlaneId: null,
      storyIds: [101],
      afterStoryId: 104,
    } satisfies KanbanMoveRequest);
    expect(board.sortMode()).toBe('newest');
    expect(saveSort).toHaveBeenCalledOnce();
    expect(saveSort).toHaveBeenCalledWith(7, 17, 'newest');
    expect(cardSubjects(fixture.nativeElement as HTMLElement)).toEqual([
      '#104 Newer done',
      '#101 Move me',
      '#102 Older done',
    ]);
  });

  it('disables intra-column reordering under automatic sort without blocking cross-column drags', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const board = fixture.componentInstance as unknown as {
      selectSort(mode: KanbanSortMode): void;
      sortMode(): KanbanSortMode;
      selectStory(story: KanbanUserStory): void;
      moveActiveStory(lane: KanbanLane, status: KanbanStatus): Promise<void>;
      dropStory(
        event: CdkDragDrop<readonly KanbanUserStory[]>,
        lane: KanbanLane,
        status: KanbanStatus,
      ): Promise<void>;
    };

    board.selectSort('title');
    fixture.detectChanges();
    const lists = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .map((element) => element.injector.get(CdkDropList));
    const drags = fixture.debugElement
      .queryAll(By.directive(CdkDrag))
      .map((element) => element.injector.get(CdkDrag));
    expect(lists.every(({ disabled }) => !disabled)).toBe(true);
    expect(lists.every(({ sortingDisabled }) => sortingDisabled)).toBe(true);
    expect(drags.every(({ disabled }) => !disabled)).toBe(true);

    await board.dropStory(
      {
        item: { data: stories()[0] },
        currentIndex: 1,
        isPointerOverContainer: true,
      } as unknown as CdkDragDrop<readonly KanbanUserStory[]>,
      { id: null, name: null },
      status(1, 'Ready', 10),
    );
    board.selectStory(stories()[0]!);
    await board.moveActiveStory({ id: null, name: null }, status(1, 'Ready', 10));
    fixture.detectChanges();
    expect(moveUserStories).not.toHaveBeenCalled();
    expect(board.sortMode()).toBe('title');
    expect(saveSort).toHaveBeenCalledOnce();
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('Choose Manual board order');

    board.selectSort('manual');
    fixture.detectChanges();
    expect(lists.every(({ sortingDisabled }) => !sortingDisabled)).toBe(true);
  });

  it('retains automatic sort when moving from the story actions menu', async () => {
    const before = stories();
    const after = before.map((candidate) =>
      candidate.id === 101 ? { ...candidate, status: 2, kanban_order: 40 } : candidate,
    );
    load.mockReturnValueOnce(of({ swimlanes: [], userStories: before }))
      .mockReturnValueOnce(of({ swimlanes: [], userStories: after }));
    moveUserStories.mockReturnValue(
      of([{ id: 101, status: 2, swimlane: null, kanban_order: 40 }]),
    );

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const board = fixture.componentInstance as unknown as {
      selectSort(mode: KanbanSortMode): void;
      sortMode(): KanbanSortMode;
      selectStory(story: KanbanUserStory): void;
      moveActiveStory(lane: KanbanLane, status: KanbanStatus): Promise<void>;
    };
    board.selectSort('updated');
    board.selectStory(before[0]!);
    await board.moveActiveStory({ id: null, name: null }, status(2, 'Done', 20));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(moveUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 2,
      swimlaneId: null,
      storyIds: [101],
      afterStoryId: 102,
    } satisfies KanbanMoveRequest);
    expect(board.sortMode()).toBe('updated');
    expect(saveSort).toHaveBeenCalledOnce();
    expect(saveSort).toHaveBeenCalledWith(7, 17, 'updated');
  });

  it('uses a stable ID tie breaker in sorted views rather than mutable kanban order', async () => {
    load.mockReturnValue(of({
      swimlanes: [],
      userStories: [
        story(110, 'Shared subject', 1, 10, 'frontend'),
        story(101, 'Shared subject', 1, 20, 'frontend'),
      ],
    }));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const board = fixture.componentInstance as unknown as {
      selectSort(mode: KanbanSortMode): void;
    };
    board.selectSort('title');
    fixture.detectChanges();

    expect(cardSubjects(fixture.nativeElement as HTMLElement)).toEqual([
      '#101 Shared subject',
      '#110 Shared subject',
    ]);
  });

  it('moves a dropped story to the top with the correct relative anchor', async () => {
    const refreshed = stories().map((candidate) =>
      candidate.id === 101 ? { ...candidate, status: 2, kanban_order: 1 } : candidate,
    );
    moveUserStories.mockReturnValue(of([{ id: 101, status: 2, swimlane: null, kanban_order: 1 }]));

    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    load.mockReturnValueOnce(of({ swimlanes: [], userStories: refreshed }));

    const board = fixture.componentInstance as unknown as {
      dropStory(
        event: CdkDragDrop<readonly KanbanUserStory[]>,
        lane: KanbanLane,
        status: KanbanStatus,
      ): Promise<void>;
    };
    await board.dropStory(
      { item: { data: stories()[0] }, currentIndex: 0 } as unknown as CdkDragDrop<
        readonly KanbanUserStory[]
      >,
      { id: null, name: null },
      status(2, 'Done', 20),
    );

    expect(moveUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 2,
      swimlaneId: null,
      storyIds: [101],
      beforeStoryId: 102,
    } satisfies KanbanMoveRequest);
  });

  it('uses visible neighbours as anchors when dragging a filtered board', async () => {
    const filteredStories = [
      story(101, 'Visible first', 1, 10, 'frontend'),
      story(104, 'Hidden middle', 1, 15, 'backend'),
      story(103, 'Visible last', 1, 20, 'frontend'),
    ];
    load.mockReturnValue(of({ swimlanes: [], userStories: filteredStories }));
    moveUserStories.mockReturnValue(of([{ id: 103, status: 1, swimlane: null, kanban_order: 5 }]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    openAdvancedFilters(host, fixture);
    setControlValue(filterSelect(host, 'tags'), 'frontend', 'change');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#101 Visible first', '#103 Visible last']);

    const board = fixture.componentInstance as unknown as {
      dropStory(
        event: CdkDragDrop<readonly KanbanUserStory[]>,
        lane: KanbanLane,
        status: KanbanStatus,
      ): Promise<void>;
    };
    await board.dropStory(
      {
        item: { data: filteredStories[2] },
        currentIndex: 0,
        isPointerOverContainer: true,
      } as unknown as CdkDragDrop<readonly KanbanUserStory[]>,
      { id: null, name: null },
      status(1, 'Ready', 10),
    );

    expect(moveUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 1,
      swimlaneId: null,
      storyIds: [103],
      beforeStoryId: 101,
    } satisfies KanbanMoveRequest);
  });

  it('restores keyboard focus to a story action after a cross-column menu move', async () => {
    const refreshed = stories().map((candidate) =>
      candidate.id === 101 ? { ...candidate, status: 2, kanban_order: 40 } : candidate,
    );
    moveUserStories.mockReturnValue(of([{ id: 101, status: 2, swimlane: null, kanban_order: 40 }]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    load.mockReturnValueOnce(of({ swimlanes: [], userStories: refreshed }));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const originalTrigger = host.querySelector<HTMLButtonElement>(
      '[data-story-menu-trigger="101"]',
    )!;
    originalTrigger.focus();
    const board = fixture.componentInstance as unknown as {
      selectStory(story: KanbanUserStory): void;
      moveActiveStory(lane: KanbanLane, status: KanbanStatus): Promise<void>;
    };
    board.selectStory(stories()[0]!);
    const move = board.moveActiveStory({ id: null, name: null }, status(2, 'Done', 20));
    fixture.detectChanges();
    await move;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const movedTrigger = host.querySelector<HTMLButtonElement>('[data-story-menu-trigger="101"]');
    expect(movedTrigger).toBeTruthy();
    expect(host.ownerDocument.activeElement).toBe(movedTrigger);
  });

  it('excludes the dragged story when deriving a same-column end anchor', async () => {
    const refreshed = stories().map((candidate) =>
      candidate.id === 101 ? { ...candidate, kanban_order: 30 } : candidate,
    );
    moveUserStories.mockReturnValue(of([{ id: 101, status: 1, swimlane: null, kanban_order: 30 }]));
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    load.mockReturnValueOnce(of({ swimlanes: [], userStories: refreshed }));

    const board = fixture.componentInstance as unknown as {
      dropStory(
        event: CdkDragDrop<readonly KanbanUserStory[]>,
        lane: KanbanLane,
        status: KanbanStatus,
      ): Promise<void>;
    };
    await board.dropStory(
      {
        item: { data: stories()[0] },
        currentIndex: 1,
        isPointerOverContainer: true,
      } as unknown as CdkDragDrop<readonly KanbanUserStory[]>,
      { id: null, name: null },
      status(1, 'Ready', 10),
    );

    expect(moveUserStories).toHaveBeenCalledWith({
      projectId: 17,
      statusId: 1,
      swimlaneId: null,
      storyIds: [101],
      afterStoryId: 103,
    } satisfies KanbanMoveRequest);
  });

  it('ignores a same-position drop and a release outside the target list', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();

    const board = fixture.componentInstance as unknown as {
      dropStory(
        event: CdkDragDrop<readonly KanbanUserStory[]>,
        lane: KanbanLane,
        status: KanbanStatus,
      ): Promise<void>;
    };
    const lane = { id: null, name: null };
    const ready = status(1, 'Ready', 10);
    await board.dropStory(
      {
        item: { data: stories()[0] },
        currentIndex: 1,
        isPointerOverContainer: false,
      } as unknown as CdkDragDrop<readonly KanbanUserStory[]>,
      lane,
      ready,
    );
    await board.dropStory(
      {
        item: { data: stories()[0] },
        currentIndex: 0,
        isPointerOverContainer: true,
      } as unknown as CdkDragDrop<readonly KanbanUserStory[]>,
      lane,
      ready,
    );

    expect(moveUserStories).not.toHaveBeenCalled();
  });

  it('keeps the board readable while independently gating create and move permissions', async () => {
    const readOnlyFixture = TestBed.createComponent(KanbanBoard);
    readOnlyFixture.componentRef.setInput('project', {
      ...project(),
      my_permissions: [],
    });
    readOnlyFixture.detectChanges();
    await readOnlyFixture.whenStable();
    readOnlyFixture.detectChanges();

    const readOnlyHost = readOnlyFixture.nativeElement as HTMLElement;
    expect(cardSubjects(readOnlyHost)).toHaveLength(3);
    expect(readOnlyHost.querySelector('.add-story-button')).toBeNull();
    expect(readOnlyHost.querySelector('.drag-handle')).toBeNull();
    expect(readOnlyHost.querySelector('.story-card-draggable')).toBeNull();
    expect(
      readOnlyFixture.debugElement
        .queryAll(By.directive(CdkDrag))
        .every((element) => element.injector.get(CdkDrag).disabled),
    ).toBe(true);

    const createOnlyFixture = TestBed.createComponent(KanbanBoard);
    createOnlyFixture.componentRef.setInput('project', {
      ...project(),
      my_permissions: ['add_us'],
    });
    createOnlyFixture.detectChanges();
    await createOnlyFixture.whenStable();
    createOnlyFixture.detectChanges();

    const createOnlyHost = createOnlyFixture.nativeElement as HTMLElement;
    expect(createOnlyHost.querySelector('.add-story-button')).toBeTruthy();
    expect(createOnlyHost.querySelector('.drag-handle')).toBeNull();
    expect(createOnlyHost.querySelector('.story-card-draggable')).toBeNull();
  });

  it('matches a hash-prefixed reference exactly', async () => {
    load.mockReturnValue(
      of({
        swimlanes: [],
        userStories: [
          story(101, 'Exact reference', 1, 10, 'frontend'),
          story(1010, 'Reference with the same prefix', 1, 20, 'frontend'),
        ],
      }),
    );
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    setControlValue(host.querySelector<HTMLInputElement>('input[type="search"]')!, '#101', 'input');
    fixture.detectChanges();

    expect(cardSubjects(host)).toEqual(['#101 Exact reference']);
  });

  it('keeps WIP violations based on unfiltered stories and renders a zero limit', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', {
      ...project(),
      us_statuses: [status(1, 'Ready', 10, false, 1), status(2, 'Done', 20, false, 0)],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const readyColumn = columnByName(host, 'Ready');
    const doneColumn = columnByName(host, 'Done');
    expect(readyColumn.dataset['overLimit']).toBe('true');
    expect(doneColumn.dataset['overLimit']).toBe('true');
    expect(doneColumn.querySelector('.wip-limit')?.textContent).toContain('/ 0');

    setControlValue(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      'billing',
      'input',
    );
    fixture.detectChanges();

    expect(cardSubjects(host)).toEqual(['#102 Fix billing']);
    expect(columnByName(host, 'Ready').dataset['overLimit']).toBe('true');
  });

  it('preserves filters for the same project and resets them once when the project id changes', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    openAdvancedFilters(host, fixture);
    const tagFilter = filterSelect(host, 'tags');
    const assigneeFilter = filterSelect(host, 'assigned_users');
    setControlValue(search, 'navigation', 'input');
    setControlValue(tagFilter!, 'frontend', 'change');
    setControlValue(assigneeFilter!, '8', 'change');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#103 Polish navigation']);

    fixture.componentRef.setInput('project', { ...project(), name: 'Alpha renamed' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledOnce();
    expect(search.value).toBe('navigation');
    expect(host.querySelectorAll('.active-filter-chip')).toHaveLength(2);

    fixture.componentRef.setInput('project', {
      ...project(),
      id: 18,
      name: 'Beta',
      slug: 'beta',
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(18);
    expect(search.value).toBe('');
    expect(host.querySelectorAll('.active-filter-chip')).toHaveLength(0);
    expect(cardSubjects(host)).toHaveLength(3);
  });
});

function setControlValue(
  control: HTMLInputElement | HTMLSelectElement,
  value: string,
  eventName: 'input' | 'change',
): void {
  control.value = value;
  control.dispatchEvent(new Event(eventName, { bubbles: true }));
}

function clearFilters(host: HTMLElement): void {
  const button = host.querySelector<HTMLButtonElement>('button[aria-label="Clear filters"]');
  expect(button).toBeTruthy();
  button!.click();
}

function openAdvancedFilters(host: HTMLElement, fixture: { detectChanges(): void }): void {
  const button = host.querySelector<HTMLButtonElement>('.filter-toggle');
  expect(button).toBeTruthy();
  if (button!.getAttribute('aria-expanded') !== 'true') {
    button!.click();
    fixture.detectChanges();
  }
}

function filterSelect(
  host: HTMLElement,
  category: string,
  mode: 'include' | 'exclude' = 'include',
): HTMLSelectElement {
  const select = host.querySelector<HTMLSelectElement>(
    `[data-filter-category="${category}"][data-filter-mode="${mode}"]`,
  );
  expect(select).toBeTruthy();
  return select!;
}

function columnNames(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.column-header h3')].map(
    ({ textContent }) => textContent?.trim() ?? '',
  );
}

function columnByName(host: HTMLElement, name: string): HTMLElement {
  const column = [...host.querySelectorAll<HTMLElement>('.board-column')].find(
    (candidate) => candidate.querySelector('h3')?.textContent?.trim() === name,
  );
  expect(column).toBeTruthy();
  return column!;
}

function cardSubjects(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLElement>('.story-subject')].map(
    ({ textContent }) => textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );
}

function project(): KanbanProjectSnapshot {
  return {
    id: 17,
    name: 'Alpha',
    slug: 'alpha',
    members: [assignee(7, 'Ada Lovelace'), assignee(8, 'Grace Hopper')],
    my_permissions: ['modify_us', 'add_us'],
    archived_code: null,
    blocked_code: null,
    us_statuses: [status(2, 'Done', 20), status(3, 'Archived', 30, true), status(1, 'Ready', 10)],
  };
}

function status(
  id: number,
  name: string,
  order: number,
  isArchived = false,
  wipLimit: number | null = null,
): KanbanStatus {
  return {
    id,
    name,
    color: '#6750a4',
    order,
    is_archived: isArchived,
    is_closed: name === 'Done',
    wip_limit: wipLimit,
  };
}

function stories(): readonly KanbanUserStory[] {
  return [
    story(101, 'Build login', 1, 10, 'frontend', 7, 'Ada Lovelace'),
    story(102, 'Fix billing', 2, 30, 'backend', 8, 'Grace Hopper'),
    story(103, 'Polish navigation', 1, 20, 'frontend', 7, 'Ada Lovelace', [7, 8]),
  ];
}

function story(
  id: number,
  subject: string,
  statusId: number,
  kanbanOrder: number,
  tag: string,
  assigneeId: number | null = null,
  assigneeName = '',
  assignedUsers: readonly number[] = assigneeId === null ? [] : [assigneeId],
): KanbanUserStory {
  return {
    id,
    ref: id,
    subject,
    project: 17,
    status: statusId,
    swimlane: null,
    kanban_order: kanbanOrder,
    is_closed: false,
    assigned_to: assigneeId,
    assigned_users: assignedUsers,
    assigned_to_extra_info:
      assigneeId === null
        ? null
        : {
            id: assigneeId,
            username: assigneeName.toLocaleLowerCase().replace(/\s+/g, '.'),
            full_name_display: assigneeName,
            photo: null,
          },
    tags: [[tag, '#6750a4']],
  };
}

function assignee(id: number, name: string) {
  return {
    id,
    username: name.toLocaleLowerCase().replace(/\s+/g, '.'),
    full_name_display: name,
    photo: null,
  };
}
