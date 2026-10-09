import { HttpErrorResponse } from '@angular/common/http';
import { CdkDrag, CdkDragHandle, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import {
  KanbanApiService,
  KanbanFilterPresetsService,
  type KanbanLane,
  type KanbanMoveRequest,
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
  const deleteAttachment = vi.fn();
  const loadPresets = vi.fn();
  const savePresets = vi.fn();

  beforeEach(async () => {
    load.mockReset();
    moveUserStories.mockReset();
    createUserStories.mockReset();
    getUserStory.mockReset();
    updateUserStory.mockReset();
    uploadAttachment.mockReset();
    deleteAttachment.mockReset();
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
            deleteAttachment,
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
    expect(host.querySelector('.story-drawer h2')?.textContent).toContain('Build login');
    expect(host.querySelector<HTMLTextAreaElement>('.editor-field textarea')?.value).toContain(
      'Login work that must ship with the release.',
    );
    expect(host.querySelector('.detail-section-heading span')?.textContent).toContain('1/2');
    expect(host.querySelector('.detail-attachment-list')?.textContent).toContain('login.png');
    expect(host.querySelector('.story-drawer-footer a')).toBeNull();

    host.querySelector<HTMLButtonElement>('.drawer-close')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('.story-drawer')).toBeNull();
    expect(host.ownerDocument.activeElement).toBe(
      host.querySelector<HTMLButtonElement>('[data-story-details-trigger="101"]'),
    );
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
    expect(host.querySelector('.points-control')).toBeTruthy();
    const file = new File(['image data'], 'clipboard.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { files: [file] } });
    host.querySelector<HTMLFormElement>('#story-editor')!.dispatchEvent(paste);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(paste.defaultPrevented).toBe(true);
    expect(uploadAttachment).toHaveBeenCalledWith({ projectId: 17, storyId: 101, file });
    expect(host.querySelector('.detail-attachment-list')?.textContent).toContain('clipboard.png');
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
