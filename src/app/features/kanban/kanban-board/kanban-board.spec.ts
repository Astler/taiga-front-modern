import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import {
  KanbanApiService,
  type KanbanProjectSnapshot,
  type KanbanStatus,
  type KanbanUserStory,
} from '../data';
import { KanbanBoard } from './kanban-board';

describe('KanbanBoard', () => {
  const load = vi.fn();

  beforeEach(async () => {
    load.mockReset();
    load.mockReturnValue(of({ swimlanes: [], userStories: stories() }));

    await TestBed.configureTestingModule({
      imports: [KanbanBoard],
      providers: [
        { provide: KanbanApiService, useValue: { load } },
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
    expect(host.querySelector<HTMLAnchorElement>('.story-card')?.href).toBe(
      'https://legacy.example.test/project/alpha/us/101',
    );

    setControlValue(
      host.querySelector<HTMLInputElement>('input[type="search"]')!,
      'billing',
      'input',
    );
    fixture.detectChanges();
    expect(cardSubjects(host)).toEqual(['#102 Fix billing']);
    expect(host.querySelector('.board-heading p')?.textContent).toContain('1 of 3 open stories');

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
