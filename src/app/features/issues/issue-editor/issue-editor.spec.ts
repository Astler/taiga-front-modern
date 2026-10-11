import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaigaProjectDetail } from '../../projects/data';
import type { IssueChanges, IssueFiltersData, TaigaIssue } from '../data';
import { IssueEditor } from './issue-editor';

const filters: IssueFiltersData = {
  statuses: [{ id: 1, name: 'Open', color: '#8de7d0' }],
  types: [{ id: 2, name: 'Bug' }],
  severities: [{ id: 3, name: 'Important' }],
  priorities: [{ id: 4, name: 'High' }],
  tags: [{ name: 'frontend' }],
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
    members: [{
      id: 7, username: 'ada', full_name_display: 'Ada Lovelace', photo: null,
    }],
    us_statuses: [],
    tags: [],
    tags_colors: {},
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

describe('IssueEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [IssueEditor] }).compileComponents();
  });

  it('creates a typed form with status, type, severity and priority from project facets', () => {
    const fixture = TestBed.createComponent(IssueEditor);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('project', project(['add_issue']));
    fixture.componentRef.setInput('filters', filters);
    const saved = vi.fn<(changes: IssueChanges) => void>();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLDialogElement>('dialog.issue-editor-backdrop')?.open).toBe(true);
    const title = host.querySelector<HTMLInputElement>('input[type="text"][maxlength="500"]')!;
    title.value = 'Login error';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Issue status"]')?.value).toBe('1');
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Issue type"]')?.value).toBe('2');
    host.querySelector<HTMLButtonElement>('.issue-save')!.click();
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Login error', status: 1, type: 2, severity: 3, priority: 4,
    }));
  });

  it('keeps editing permissions and deletion independent', () => {
    const fixture = TestBed.createComponent(IssueEditor);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('issue', issue());
    fixture.componentRef.setInput('project', project(['delete_issue']));
    fixture.componentRef.setInput('filters', filters);
    const deletion = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(deletion);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLInputElement>('input[maxlength="500"]')?.disabled).toBe(true);
    expect(host.querySelector('.issue-save')).toBeNull();
    host.querySelector<HTMLButtonElement>('.issue-delete')!.click();
    expect(deletion).toHaveBeenCalledOnce();
  });

  it('asks before discarding an unsaved draft', () => {
    const fixture = TestBed.createComponent(IssueEditor);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('issue', issue());
    fixture.componentRef.setInput('project', project(['modify_issue']));
    fixture.componentRef.setInput('filters', filters);
    const close = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const subject = host.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    subject.value = 'Modified';
    subject.dispatchEvent(new Event('input', { bubbles: true }));
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    try {
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
});
