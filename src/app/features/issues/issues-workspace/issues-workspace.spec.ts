import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaigaProjectDetail } from '../../projects/data';
import { IssuesApiService, type IssueFiltersData, type IssueListPage } from '../data';
import { IssuesWorkspace } from './issues-workspace';

describe('IssuesWorkspace', () => {
  const list = vi.fn();
  const filters = vi.fn();
  const get = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const deleteIssue = vi.fn();
  const listAttachments = vi.fn();
  const uploadAttachment = vi.fn();
  const deleteAttachment = vi.fn();

  beforeEach(async () => {
    list.mockReset().mockReturnValue(of(issuePage()));
    filters.mockReset().mockReturnValue(of(filtersData()));
    get.mockReset().mockReturnValue(of({
      ...issuePage().items[0]!, description: 'Crash details', version: 4,
    }));
    create.mockReset().mockReturnValue(of(issuePage().items[0]!));
    update.mockReset().mockReturnValue(of(issuePage().items[0]!));
    deleteIssue.mockReset().mockReturnValue(of(undefined));
    listAttachments.mockReset().mockReturnValue(of([]));
    uploadAttachment.mockReset().mockReturnValue(of({
      id: 99, name: 'screenshot.png', url: '/media/screenshot.png', size: 4,
    }));
    deleteAttachment.mockReset().mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [IssuesWorkspace],
      providers: [{
        provide: IssuesApiService,
        useValue: {
          list, filters, get, create, update, delete: deleteIssue,
          listAttachments, uploadAttachment, deleteAttachment,
        },
      }],
    }).compileComponents();
  });

  it('renders a dense real issue row without leaving the workspace', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(list).toHaveBeenCalledWith(17, expect.objectContaining({ orderBy: '-modified_date' }));
    expect(filters).toHaveBeenCalledWith(17, expect.objectContaining({ page: 1 }));
    expect(host.querySelector('.issue-main-cell')?.textContent).toContain('#38');
    expect(host.querySelector('.issue-main-cell')?.textContent).toContain('Fix sign-in crash');
    expect(host.querySelector('[data-label="Status"]')?.textContent).toContain('Open');
    expect(host.querySelector('[data-label="Type"]')?.textContent).toContain('Bug');
    expect(host.querySelector('[data-label="Severity"]')?.textContent).toContain('Important');
    expect(host.querySelector('[data-label="Priority"]')?.textContent).toContain('High');
    expect(host.querySelector('.issue-tags')?.textContent).toContain('frontend');
    expect(host.querySelector('.assignee-name')?.textContent).toContain('Ada Lovelace');
    expect(host.querySelector('.issue-main-cell a')).toBeNull();
  });

  it('keeps search, sorting and filters on one compact toolbar without a repeated page title', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['add_issue'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const toolbar = host.querySelector<HTMLElement>('.issues-toolbar')!;
    expect(toolbar).toBeTruthy();
    expect(host.querySelector('.issues-header')).toBeNull();
    expect(host.querySelector('#issues-title')).toBeNull();
    expect(toolbar.querySelector('form.search-field')).toBeTruthy();
    expect(toolbar.querySelector('.issues-count')?.textContent).toContain('38 issues');
    expect(toolbar.querySelector('[aria-label^="Sort issues"]')).toBeTruthy();
    expect(toolbar.querySelector('.issue-filter-toggle')).toBeTruthy();
    expect(toolbar.querySelector('.issue-create-button')).toBeTruthy();
    expect(host.querySelector('.filter-rail')).toBeNull();

    const toggle = toolbar.querySelector<HTMLButtonElement>('.issue-filter-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelectorAll('.filter-rail select')).toHaveLength(6);

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.filter-rail')).toBeNull();
  });

  it('sorts issues through the Kanban-style menu, not a permanent wide dropdown', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.sort-field')).toBeNull();
    const sort = host.querySelector<HTMLButtonElement>('[aria-label^="Sort issues"]')!;
    expect(sort.getAttribute('aria-label')).toContain('Recently updated');
    sort.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const priority = [...document.querySelectorAll<HTMLButtonElement>('.mat-mdc-menu-item')]
      .find((item) => item.textContent?.trim() === 'Priority')!;
    expect(priority).toBeTruthy();
    priority.click();
    fixture.detectChanges();
    expect(list).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({ orderBy: 'priority' }),
    );
    expect(sort.getAttribute('aria-label')).toContain('Priority');
  });

  it('creates an issue in the native editor with project metadata and permission checks', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', {
      ...project(),
      my_permissions: ['add_issue'],
      issue_statuses: [{ id: 1, name: 'Open' }],
      members: [{
        id: 7, username: 'ada', full_name_display: 'Ada Lovelace', photo: null,
      }],
      tags: ['frontend'],
      tags_colors: { frontend: '#6750a4' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.issue-create-button')!.click();
    fixture.detectChanges();
    const editor = host.querySelector<HTMLElement>('pf-issue-editor')!;
    expect(editor).toBeTruthy();
    const title = editor.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Create login alert';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    editor.querySelector<HTMLButtonElement>('[aria-label="Assign to Ada Lovelace"]')!.click();
    const tagSuggestion = [...editor.querySelectorAll<HTMLButtonElement>(
      '.issue-tag-suggestions button',
    )].find((button) => button.textContent?.includes('frontend'))!;
    tagSuggestion.click();
    editor.querySelectorAll<HTMLButtonElement>('.issue-date-quick button')[1]!.click();
    fixture.detectChanges();

    expect(editor.querySelectorAll('select')).toHaveLength(0);
    expect(editor.querySelector('[aria-label="Assign to Ada Lovelace"]')?.getAttribute('aria-pressed'))
      .toBe('true');
    editor.querySelector<HTMLButtonElement>('.issue-save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      project: 17, subject: 'Create login alert', status: 1,
      type: 2, severity: 3, priority: 4,
      assigned_to: 7, tags: ['frontend'], due_date: expect.any(String),
    }));
    expect(host.querySelector('pf-issue-editor')).toBeNull();
  });

  it('creates the issue before uploading clipboard screenshots staged in the create form', async () => {
    const created = { ...issuePage().items[0]!, id: 55, ref: 55, subject: 'Screenshot report' };
    create.mockReturnValue(of(created));
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['add_issue'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.issue-create-button')!.click();
    fixture.detectChanges();
    const editor = host.querySelector<HTMLElement>('pf-issue-editor')!;

    const file = new File(['screenshot'], 'image.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [file], items: [] },
    });
    editor.querySelector('.issue-editor-panel')!.dispatchEvent(paste);
    fixture.detectChanges();
    expect(uploadAttachment).not.toHaveBeenCalled();

    const title = editor.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Screenshot report';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.querySelector<HTMLButtonElement>('.issue-save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledTimes(1);
    expect(uploadAttachment).toHaveBeenCalledWith(17, 55, expect.any(File));
    expect(host.querySelector('pf-issue-editor')).toBeNull();
    expect(host.querySelector('.issue-upload-notice')).toBeNull();
  });

  it('keeps failed new-issue file uploads retryable without creating the issue twice', async () => {
    create.mockReturnValue(of({ ...issuePage().items[0]!, id: 56, ref: 56 }));
    uploadAttachment
      .mockReturnValueOnce(throwError(() => new Error('Upload failed')))
      .mockReturnValueOnce(of({
        id: 99, name: 'report.png', url: '/media/report.png', size: 4,
      }));

    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['add_issue'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.issue-create-button')!.click();
    fixture.detectChanges();
    const editor = host.querySelector<HTMLElement>('pf-issue-editor')!;
    const picker = editor.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['image'], 'report.png', { type: 'image/png' });
    Object.defineProperty(picker, 'files', { configurable: true, value: [file] });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    const title = editor.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Something failed';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.querySelector<HTMLButtonElement>('.issue-save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.issue-upload-notice')?.textContent).toContain('could not be uploaded');
    expect(host.querySelector<HTMLButtonElement>('.issue-create-button')?.disabled).toBe(true);

    host.querySelector<HTMLButtonElement>('.issue-upload-actions button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(uploadAttachment).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.issue-upload-notice')).toBeNull();
  });

  it('uploads screenshots pasted directly into existing issue details', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['modify_issue'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('.issue-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const panel = host.querySelector<HTMLElement>('.issue-editor-panel')!;
    const file = new File(['clipboard image'], 'image.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [file], items: [] },
    });
    panel.dispatchEvent(paste);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(paste.defaultPrevented).toBe(true);
    expect(uploadAttachment).toHaveBeenCalledWith(17, 38, expect.any(File));
    expect(create).not.toHaveBeenCalled();
  });

  it('opens details and saves versioned changes without leaving the issue list', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: ['modify_issue', 'delete_issue'],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.issue-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(get).toHaveBeenCalledWith(38);
    const editor = host.querySelector<HTMLElement>('pf-issue-editor')!;
    expect(editor.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Crash details');
    const title = editor.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Fix login crash completely';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.querySelector<HTMLButtonElement>('.issue-save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(update).toHaveBeenCalledWith(38, expect.objectContaining({
      subject: 'Fix login crash completely',
    }), 4);
    expect(host.querySelector('pf-issue-editor')).toBeNull();
  });

  it('requires delete permission and confirmation before removing an issue', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', {
      ...project(), my_permissions: ['delete_issue'],
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.issue-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const editor = host.querySelector<HTMLElement>('pf-issue-editor')!;
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    try {
      const deleteButton = editor.querySelector<HTMLButtonElement>('.issue-delete')!;
      deleteButton.click();
      fixture.detectChanges();
      expect(deleteIssue).not.toHaveBeenCalled();
      deleteButton.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(deleteIssue).toHaveBeenCalledWith(38);
      expect(host.querySelector('pf-issue-editor')).toBeNull();
    } finally {
      confirm.mockRestore();
    }
  });

  it('shows only tag names in the overflow tooltip', async () => {
    list.mockReturnValue(
      of({
        ...issuePage(),
        items: [
          {
            ...issuePage().items[0]!,
            tags: [
              ['frontend', '#6750a4'],
              ['urgent', '#ff0000'],
              ['customer', '#00ff00'],
              ['release', null],
            ],
          },
        ],
      }),
    );
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const tooltip = fixture.debugElement.query(By.css('.tag-overflow')).injector.get(MatTooltip);
    expect(tooltip.message).toBe('customer, release');
  });

  it('sends selected status and exclude mode to the server store', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.issue-filter-toggle')!.click();
    fixture.detectChanges();
    const status = host.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
    status.value = '1';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const exclude = [...host.querySelectorAll<HTMLButtonElement>('.filter-mode button')].find(
      (button) => button.textContent?.trim() === 'Exclude',
    )!;
    exclude.click();
    fixture.detectChanges();

    expect(list).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({
        filters: { status: { value: '1', mode: 'exclude' } },
      }),
    );
    expect(exclude.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.issue-filter-badge')?.textContent).toBe('1');

    const clear = [...host.querySelectorAll<HTMLButtonElement>('.issue-filter-actions button')]
      .find((button) => button.textContent?.trim() === 'Clear all')!;
    clear.click();
    fixture.detectChanges();
    expect(host.querySelector('.issue-filter-badge')).toBeNull();
    expect(list).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({ filters: {} }),
    );
  });
});

function issuePage(): IssueListPage {
  return {
    items: [
      {
        id: 38,
        ref: 38,
        subject: 'Fix sign-in crash',
        project: 17,
        status: 1,
        status_extra_info: { name: 'Open', color: '#8de7d0', is_closed: false },
        type: 2,
        severity: 3,
        priority: 4,
        assigned_to: 7,
        assigned_to_extra_info: {
          id: 7,
          username: 'ada',
          full_name_display: 'Ada Lovelace',
          photo: null,
        },
        tags: [['frontend', '#6750a4']],
        modified_date: '2026-10-08T10:00:00Z',
      },
    ],
    total: 38,
    page: 1,
    pageSize: 20,
    totalPages: 2,
  };
}

function filtersData(): IssueFiltersData {
  return {
    statuses: [{ id: 1, name: 'Open', color: '#8de7d0', count: 38 }],
    types: [{ id: 2, name: 'Bug', color: '#ffb4ab' }],
    severities: [{ id: 3, name: 'Important', color: '#ffca86' }],
    priorities: [{ id: 4, name: 'High', color: '#c9b6ff' }],
    tags: [{ name: 'frontend', color: '#6750a4' }],
    assigned_to: [{ id: 7, full_name: 'Ada Lovelace' }],
  };
}

function project(): TaigaProjectDetail {
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
    my_permissions: [],
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
    members: [],
    us_statuses: [],
    tags: [],
    tags_colors: {},
  };
}
