import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import type { TaigaProjectDetail } from '../../projects/data';
import { IssuesApiService, type IssueChanges, type IssueFiltersData, type TaigaIssue } from '../data';
import { IssueEditor, issueDateAfterDays } from './issue-editor';

const filters: IssueFiltersData = {
  statuses: [
    { id: 1, name: 'Open', color: '#8de7d0' },
    { id: 5, name: 'In progress', color: '#bda4ff' },
  ],
  types: [{ id: 2, name: 'Bug' }, { id: 7, name: 'Enhancement' }],
  severities: [
    { id: 3, name: 'Important' },
    { id: 8, name: 'Critical' },
  ],
  priorities: [
    { id: 4, name: 'High' },
    { id: 6, name: 'Low' },
  ],
  tags: [{ name: 'frontend' }, { name: 'release' }],
  assigned_to: [],
};

function project(permissions: readonly string[]): TaigaProjectDetail {
  return {
    id: 17,
    slug: 'alpha',
    name: 'Alpha',
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
    my_permissions: permissions,
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
    members: [
      { id: 7, username: 'ada', full_name_display: 'Ada Lovelace', photo: null },
      {
        id: 8,
        username: 'grace',
        full_name_display: 'Grace Hopper',
        photo: 'https://example.test/avatars/grace.png',
      },
    ],
    us_statuses: [],
    tags: ['frontend', 'design'],
    tags_colors: { frontend: '#6750a4', design: '#70b0a3' },
  };
}

function issue(): TaigaIssue {
  return {
    id: 38, ref: 38, project: 17, subject: 'Original title',
    status: 1, type: 2, severity: 3, priority: 4,
    status_extra_info: { name: 'Open', color: '#8de7d0', is_closed: false },
    assigned_to: 7, assigned_to_extra_info: {
      id: 7, username: 'ada', full_name_display: 'Ada Lovelace', photo: null,
    },
    tags: [['frontend', null]],
    modified_date: '2026-10-08T10:00:00Z',
    description: 'Original details',
    version: 4,
  };
}

function createEditor(
  permissions: readonly string[],
  options?: { project?: TaigaProjectDetail; current?: TaigaIssue; filters?: IssueFiltersData },
) {
  const fixture = TestBed.createComponent(IssueEditor);
  fixture.componentRef.setInput('mode', options?.current ? 'edit' : 'create');
  fixture.componentRef.setInput('project', options?.project ?? project(permissions));
  fixture.componentRef.setInput('filters', options?.filters ?? filters);
  if (options?.current) fixture.componentRef.setInput('issue', options.current);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

function enterTitle(host: HTMLElement, title: string): void {
  const input = host.querySelector<HTMLInputElement>('input[type="text"][maxlength="500"]')!;
  input.value = title;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('IssueEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IssueEditor],
      providers: [{
        provide: IssuesApiService,
        useValue: {
          listAttachments: () => of([]),
          uploadAttachment: () => of({ id: 1, name: 'image.png', url: '/media/image.png', size: 5 }),
          deleteAttachment: () => of(undefined),
        },
      }],
    }).compileComponents();
  });

  it('keeps title, description and tags on the left, with workflow and classification on the right', () => {
    const { host } = createEditor(['add_issue']);
    const layout = host.querySelector<HTMLElement>('.issue-editor-layout')!;
    const primary = layout.querySelector<HTMLElement>('.issue-editor-primary')!;
    const secondary = layout.querySelector<HTMLElement>('.issue-editor-secondary')!;

    expect(layout).toBeTruthy();
    expect([...primary.children].map((child) => child.classList[1])).toEqual([
      'issue-basics',
      'issue-tags-section',
      'issue-attachments-section',
      'issue-blocked-section',
    ]);
    expect(primary.querySelector('input[maxlength="500"]')).toBeTruthy();
    expect(primary.querySelector('.issue-basics textarea')).toBeTruthy();
    expect(primary.querySelector('.issue-tag-composer')).toBeTruthy();

    expect(secondary.querySelectorAll('.issue-editor-section')).toHaveLength(2);
    expect(secondary.querySelector('.issue-workflow')).toBeTruthy();
    expect(secondary.querySelector('.issue-classification')).toBeTruthy();
    expect(secondary.querySelector('.issue-assignee-list')).toBeTruthy();
    expect(secondary.querySelector('.issue-date-quick')).toBeTruthy();
    expect(secondary.querySelector('[aria-label="Issue priority"]')).toBeTruthy();
    expect(secondary.querySelector('[aria-label="Issue severity"]')).toBeTruthy();

    expect(host.querySelectorAll('.issue-section-header p')).toHaveLength(0);
    expect(host.querySelector('.issue-save')).toBeTruthy();
    expect(host.querySelector('dialog.issue-editor-backdrop')).toBeTruthy();
  });

  it('shows attachments before issue creation and stages pasted clipboard screenshots', () => {
    const { fixture, host } = createEditor(['add_issue']);
    const queued = vi.fn<(files: readonly File[]) => void>();
    fixture.componentInstance.stagedFilesChanged.subscribe(queued);

    const section = host.querySelector<HTMLElement>('.issue-attachments-section')!;
    expect(section).toBeTruthy();
    expect(section.textContent).toContain('Ctrl+V');

    const image = new File(['fake image'], 'image.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: {
        files: [],
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => image }],
      },
    });
    host.querySelector('.issue-editor-panel')!.dispatchEvent(paste);
    fixture.detectChanges();

    expect(paste.defaultPrevented).toBe(true);
    expect(queued).toHaveBeenCalledOnce();
    expect(queued.mock.calls[0]?.[0][0]?.type).toBe('image/png');
    expect(section.querySelectorAll('.issue-attachment')).toHaveLength(1);
    expect(section.textContent).toContain('Uploads when issue is created');

    section.querySelector<HTMLButtonElement>('.issue-attachment-remove')!.click();
    fixture.detectChanges();
    expect(queued.mock.calls.at(-1)?.[0]).toEqual([]);
  });

  it('does not intercept a normal text paste', () => {
    const { host } = createEditor(['add_issue']);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [], items: [{ kind: 'string', type: 'text/plain' }] },
    });
    host.querySelector('.issue-basics textarea')!.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(false);
  });

  it('replaces dropdowns with selected accessible chips while keeping Taiga values', () => {
    const { fixture, host } = createEditor(['add_issue']);
    const saved = vi.fn<(changes: IssueChanges) => void>();
    fixture.componentInstance.saved.subscribe(saved);

    expect(host.querySelector('dialog.issue-editor-backdrop')?.getAttribute('open')).not.toBeNull();
    expect(host.querySelector('.issue-editor-columns')).toBeTruthy();
    expect(host.querySelectorAll('select')).toHaveLength(0);

    const initial = host.querySelector<HTMLButtonElement>('[aria-label="Status: Open"]')!;
    expect(initial.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Type: Bug"]')?.getAttribute('aria-pressed'))
      .toBe('true');

    enterTitle(host, 'Login error');
    host.querySelector<HTMLButtonElement>('[aria-label="Status: In progress"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Type: Enhancement"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Priority: Low"]')!.click();
    host.querySelector<HTMLButtonElement>('[aria-label="Severity: Critical"]')!.click();
    fixture.detectChanges();

    expect(host.querySelector<HTMLButtonElement>('[aria-label="Status: In progress"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Status: Open"]')?.getAttribute('aria-pressed'))
      .toBe('false');
    host.querySelector<HTMLButtonElement>('.issue-save')!.click();

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Login error', status: 5, type: 7, severity: 8, priority: 6,
      assigned_to: null, tags: [],
    }));
  });

  it('shows project member avatars, supports search, and keeps only one assignee selected', () => {
    const extraMembers = Array.from({ length: 7 }, (_, index) => ({
      id: 20 + index,
      username: 'member' + index,
      full_name_display: 'Member ' + index,
      photo: null,
    }));
    const p = project(['add_issue']);
    const { fixture, host } = createEditor(['add_issue'], {
      project: { ...p, members: [...p.members, ...extraMembers] },
    });
    const saved = vi.fn<(changes: IssueChanges) => void>();
    fixture.componentInstance.saved.subscribe(saved);

    expect(host.querySelectorAll('.issue-assignee-chip')).toHaveLength(7);
    const grace = host.querySelector<HTMLButtonElement>('[aria-label="Assign to Grace Hopper"]')!;
    expect(grace.querySelector('img')?.getAttribute('src')).toContain('/avatars/grace.png');
    grace.click();
    fixture.detectChanges();
    expect(grace.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[aria-label="Assign to Ada Lovelace"]')?.getAttribute('aria-pressed'))
      .toBe('false');

    const more = host.querySelector<HTMLButtonElement>('.issue-more-assignees')!;
    expect(more).toBeTruthy();
    more.click();
    fixture.detectChanges();

    const search = host.querySelector<HTMLInputElement>('.issue-assignee-search input')!;
    search.value = 'Member 6';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    const filtered = host.querySelector<HTMLButtonElement>('[aria-label="Assign to Member 6"]')!;
    expect(filtered).toBeTruthy();
    filtered.click();
    fixture.detectChanges();
    expect(filtered.getAttribute('aria-pressed')).toBe('true');

    enterTitle(host, 'Contact owner');
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.issue-save')!.click();
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ assigned_to: 26 }));
  });

  it('uses a compact unified tag composer without redundant empty-state labels', () => {
    const { fixture, host } = createEditor(['add_issue']);
    const tagsSection = host.querySelector<HTMLElement>('.issue-tags-section')!;

    expect(tagsSection.textContent).not.toContain('No tags selected');
    expect(tagsSection.textContent).not.toContain('Suggested');
    expect(tagsSection.querySelector('.issue-tag-empty')).toBeNull();
    expect(tagsSection.querySelector('.issue-tag-entry')).toBeNull();

    const composer = tagsSection.querySelector<HTMLElement>('.issue-tag-composer')!;
    const input = composer.querySelector<HTMLInputElement>('input[aria-label="Add a tag"]')!;
    const addButton = composer.querySelector<HTMLButtonElement>('.issue-tag-add')!;
    expect(input.placeholder).toContain('Enter');
    expect(composer.querySelector('.issue-tag-compose-icon')).toBeTruthy();
    expect(addButton.disabled).toBe(true);
    expect(tagsSection.querySelector('.issue-tag-suggestions-label')?.textContent).toBe('Quick add');
    expect(tagsSection.querySelector('.issue-tag-suggestions button .issue-tag-dot')).toBeTruthy();

    input.value = 'urgent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(addButton.disabled).toBe(false);
    addButton.click();
    fixture.detectChanges();

    expect(tagsSection.querySelector('.issue-selected-tags')?.textContent).toContain('urgent');
    expect(tagsSection.querySelector('.issue-tag-count')?.textContent).toContain('1 selected');
    expect(input.value).toBe('');
    expect(tagsSection.querySelector('.issue-tag-composer')).toBe(composer);
    expect(addButton.disabled).toBe(true);

    tagsSection.querySelector<HTMLButtonElement>('[aria-label="Remove tag urgent"]')!.click();
    fixture.detectChanges();
    expect(tagsSection.querySelector('.issue-selected-tags')).toBeNull();
    expect(tagsSection.querySelector('.issue-tag-count')).toBeNull();
    expect(tagsSection.textContent).not.toContain('No tags selected');
  });

  it('supports suggested tags, Enter-to-chip, removal, and uncommitted tags at save time', () => {
    const { fixture, host } = createEditor(['add_issue']);
    const saved = vi.fn<(changes: IssueChanges) => void>();
    fixture.componentInstance.saved.subscribe(saved);
    enterTitle(host, 'New issue');
    fixture.detectChanges();

    const suggestion = [...host.querySelectorAll<HTMLButtonElement>('.issue-tag-suggestions button')]
      .find((button) => button.textContent?.includes('frontend'))!;
    expect(suggestion).toBeTruthy();
    suggestion.click();
    fixture.detectChanges();
    expect(host.querySelector('.issue-selected-tags')?.textContent).toContain('frontend');

    const tagInput = host.querySelector<HTMLInputElement>('[aria-label="Add a tag"]')!;
    tagInput.value = 'Design, ui, design';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    tagInput.dispatchEvent(enter);
    fixture.detectChanges();

    expect(enter.defaultPrevented).toBe(true);
    expect(saved).not.toHaveBeenCalled();
    expect(host.querySelectorAll('.issue-selected-tag')).toHaveLength(3);

    host.querySelector<HTMLButtonElement>('[aria-label="Remove tag ui"]')!.click();
    fixture.detectChanges();
    expect(host.querySelectorAll('.issue-selected-tag')).toHaveLength(2);

    tagInput.value = 'urgent';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.issue-save')!.click();

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({
      tags: ['frontend', 'Design', 'urgent'],
    }));
  });

  it('provides local-date quick actions and allows clearing the due date', () => {
    const { fixture, host } = createEditor(['add_issue']);
    const date = host.querySelector<HTMLInputElement>('[aria-label="Issue due date"]')!;
    const quick = [...host.querySelectorAll<HTMLButtonElement>('.issue-date-quick button')];
    expect(quick.map(({ textContent }) => textContent?.trim())).toEqual([
      'Today', 'Tomorrow', 'In 7 days',
    ]);

    quick[1]!.click();
    fixture.detectChanges();
    expect(date.value).toBe(issueDateAfterDays(new Date(), 1));
    expect(quick[1]!.getAttribute('aria-pressed')).toBe('true');

    host.querySelector<HTMLButtonElement>('.issue-date-quick .issue-date-clear')!.click();
    fixture.detectChanges();
    expect(date.value).toBe('');
    expect(host.querySelector('.issue-date-clear')).toBeNull();
  });

  it('keeps an edited issue read-only if only delete permission is granted', () => {
    const { host, fixture } = createEditor(['delete_issue'], { current: issue() });
    const deletion = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(deletion);
    expect(host.querySelector<HTMLTextAreaElement>('.issue-basics textarea')?.value)
      .toBe('Original details');
    expect(host.querySelector<HTMLInputElement>('input[maxlength="500"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Status: Open"]')?.disabled)
      .toBe(true);
    expect(host.querySelectorAll('.issue-selected-tag')).toHaveLength(1);
    expect(host.querySelector('.issue-save')).toBeNull();

    host.querySelector<HTMLButtonElement>('.issue-delete')!.click();
    expect(deletion).toHaveBeenCalledOnce();
  });

  it('preserves a dirty draft when filters change asynchronously', () => {
    const { fixture, host } = createEditor(['add_issue']);
    enterTitle(host, 'Keep this text');
    fixture.detectChanges();

    fixture.componentRef.setInput('filters', {
      ...filters, statuses: [
        ...filters.statuses, { id: 15, name: 'Ready for QA', color: '#80cbc4' },
      ],
    } satisfies IssueFiltersData);
    fixture.detectChanges();

    expect(host.querySelector<HTMLInputElement>('input[maxlength="500"]')?.value)
      .toBe('Keep this text');
    expect(host.querySelector('[aria-label="Status: Ready for QA"]')).toBeTruthy();
  });

  it('keeps blocked state visible and sends the reason without changing the API contract', () => {
    const { fixture, host } = createEditor(['add_issue']);
    const saved = vi.fn<(changes: IssueChanges) => void>();
    fixture.componentInstance.saved.subscribe(saved);
    enterTitle(host, 'Cannot reproduce');

    const blocked = host.querySelector<HTMLInputElement>(
      '[aria-label="Mark issue as blocked"]',
    )!;
    blocked.click();
    fixture.detectChanges();
    expect(host.querySelector('.issue-blocked-active')).toBeTruthy();
    const reason = host.querySelector<HTMLTextAreaElement>('.issue-blocked-section textarea')!;
    reason.value = 'Waiting on the API';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    host.querySelector<HTMLButtonElement>('.issue-save')!.click();
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({
      is_blocked: true, blocked_note: 'Waiting on the API',
    }));
  });

  it('asks before discarding an unsaved draft on Cancel or native dialog cancel', () => {
    const { fixture, host } = createEditor(['modify_issue'], { current: issue() });
    const close = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    enterTitle(host, 'Modified');
    fixture.detectChanges();

    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false)
      .mockReturnValueOnce(false).mockReturnValueOnce(true);
    try {
      host.querySelector<HTMLButtonElement>('.issue-cancel')!.click();
      expect(close).not.toHaveBeenCalled();

      const dialog = host.querySelector<HTMLDialogElement>('dialog.issue-editor-backdrop')!;
      const cancel = new Event('cancel', { cancelable: true });
      dialog.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(close).not.toHaveBeenCalled();
      expect(dialog.open).toBe(true);

      host.querySelector<HTMLButtonElement>('.issue-cancel')!.click();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      confirm.mockRestore();
    }
  });

  it('fills late-loading facet defaults without resetting already typed content', () => {
    const blank: IssueFiltersData = {
      statuses: [], types: [], severities: [], priorities: [], assigned_to: [], tags: [],
    };
    const { fixture, host } = createEditor(['add_issue'], {
      project: project(['add_issue']), filters: blank,
    });
    enterTitle(host, 'Typed before metadata arrived');
    fixture.detectChanges();
    expect(host.querySelector<HTMLButtonElement>('.issue-save')?.disabled).toBe(true);

    fixture.componentRef.setInput('filters', filters);
    fixture.detectChanges();
    expect(host.querySelector<HTMLInputElement>('input[maxlength="500"]')?.value)
      .toBe('Typed before metadata arrived');
    expect(host.querySelector<HTMLButtonElement>('[aria-label="Status: Open"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    expect(host.querySelector<HTMLButtonElement>('.issue-save')?.disabled).toBe(false);
  });

  it('does not submit when required project facets are missing', () => {
    const blankFilters: IssueFiltersData = {
      statuses: [], types: [], severities: [], priorities: [], assigned_to: [], tags: [],
    };
    const { fixture, host } = createEditor(['add_issue'], {
      project: { ...project(['add_issue']), issue_statuses: [] }, filters: blankFilters,
    });
    enterTitle(host, 'No options');
    fixture.detectChanges();
    expect(host.querySelector('.issue-editor-note')?.textContent)
      .toContain('Configure them in Taiga');
    expect(host.querySelector<HTMLButtonElement>('.issue-save')?.disabled).toBe(true);
  });
});

describe('issueDateAfterDays', () => {
  it('handles local midnight and month or year boundaries without UTC shifts', () => {
    expect(issueDateAfterDays(new Date(2026, 11, 31, 23, 59), 1)).toBe('2027-01-01');
    expect(issueDateAfterDays(new Date(2026, 1, 27, 0, 1), 7)).toBe('2026-03-06');
  });
});
