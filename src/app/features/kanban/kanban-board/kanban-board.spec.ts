import { HttpErrorResponse } from '@angular/common/http';
import { CdkDrag, CdkDropList, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import {
  KanbanApiService,
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

  beforeEach(async () => {
    load.mockReset();
    moveUserStories.mockReset();
    createUserStories.mockReset();
    load.mockReturnValue(of({ swimlanes: [], userStories: stories() }));
    moveUserStories.mockReturnValue(of([]));
    createUserStories.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [KanbanBoard],
      providers: [
        {
          provide: KanbanApiService,
          useValue: { load, moveUserStories, createUserStories },
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
    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(17);
    expect(columnNames(host)).toEqual(['Ready', 'Done']);
    expect(cardSubjects(host)).toEqual([
      '#101 Build login',
      '#103 Polish navigation',
      '#102 Fix billing',
    ]);
    expect(host.querySelector<HTMLAnchorElement>('.story-subject')?.href).toBe(
      'https://legacy.example.test/project/alpha/us/101',
    );

    setControlValue(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      'billing',
      'input',
    );
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#102 Fix billing']);
    expect(host.querySelector('.board-heading p')?.textContent).toContain('2 open');
    expect(host.querySelector('.board-heading p')?.textContent).toContain('1 matching');

    setControlValue(host.querySelector<HTMLInputElement>('input[type="search"]')!, '#101', 'input');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#101 Build login']);

    clearFilters(host);
    fixture.detectChanges();
    const [tagFilter, assigneeFilter] = host.querySelectorAll<HTMLSelectElement>('select');
    setControlValue(tagFilter!, 'frontend', 'change');
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#101 Build login', '#103 Polish navigation']);

    clearFilters(host);
    fixture.detectChanges();
    setControlValue(assigneeFilter!, '8', 'change');
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
    expect(host.querySelector('.board-heading p')?.textContent).toContain('1 open');
    const cards = [...host.querySelectorAll<HTMLElement>('.story-card')];
    const openTaskCard = cards.find((card) => card.textContent?.includes('#201'))!;
    const closedTaskCard = cards.find((card) => card.textContent?.includes('#202'))!;
    expect(openTaskCard.textContent).toContain('Overdue');
    expect(closedTaskCard.textContent).not.toContain('Overdue');
    expect(closedTaskCard.querySelector('.milestone')?.textContent?.trim()).toBe(
      'Release candidate',
    );
  });

  it('disables both drags and drop lists while filters hide board order', async () => {
    const fixture = TestBed.createComponent(KanbanBoard);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const drags = fixture.debugElement
      .queryAll(By.directive(CdkDrag))
      .map((element) => element.injector.get(CdkDrag));
    const lists = fixture.debugElement
      .queryAll(By.directive(CdkDropList))
      .map((element) => element.injector.get(CdkDropList));
    expect(drags.every(({ disabled }) => !disabled)).toBe(true);
    expect(lists.every(({ disabled }) => !disabled)).toBe(true);

    const host = fixture.nativeElement as HTMLElement;
    setControlValue(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      'login',
      'input',
    );
    fixture.detectChanges();

    expect(drags.every(({ disabled }) => disabled)).toBe(true);
    expect(lists.every(({ disabled }) => disabled)).toBe(true);
    expect(host.textContent).toContain('Clear filters to drag cards');
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
    const [tagFilter, assigneeFilter] = host.querySelectorAll<HTMLSelectElement>('select');
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
    expect(tagFilter!.value).toBe('frontend');
    expect(assigneeFilter!.value).toBe('8');

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
    expect(tagFilter!.value).toBe('');
    expect(assigneeFilter!.value).toBe('');
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
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes('Clear filters'),
  );
  expect(button).toBeTruthy();
  button!.click();
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
