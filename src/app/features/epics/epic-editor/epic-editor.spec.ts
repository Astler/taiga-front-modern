import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaigaProjectDetail } from '../../projects/data';
import type { EpicChanges, EpicFiltersData, TaigaEpic } from '../data';
import { EpicEditor } from './epic-editor';

const filters: EpicFiltersData = {
  statuses: [{ id: 2, name: 'In progress', color: '#8de7d0' }],
  assigned_to: [],
  owners: [],
  tags: [],
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

function epic(): TaigaEpic {
  return {
    id: 38,
    ref: 38,
    project: 17,
    project_extra_info: { name: 'Alpha', slug: 'alpha', logo_small_url: null },
    created_date: '2026-10-01T09:00:00Z',
    modified_date: '2026-10-08T10:00:00Z',
    subject: 'Roadmap',
    description: 'Roadmap details',
    color: '#6750a4',
    epics_order: 1,
    client_requirement: false,
    team_requirement: true,
    version: 3,
    watchers: [],
    is_blocked: false,
    blocked_note: '',
    is_closed: false,
    user_stories_counts: { total: 10, progress: 4, opened: 6, closed: 4 },
    owner: 7,
    owner_extra_info: null,
    assigned_to: null,
    assigned_to_extra_info: null,
    status: 2,
    status_extra_info: { name: 'In progress', color: '#8de7d0', is_closed: false },
    tags: [['release', null]],
    total_attachments: 0,
    total_voters: 0,
    is_voter: false,
    is_watcher: false,
  };
}

describe('EpicEditor', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [EpicEditor] }).compileComponents();
  });

  it('emits a Taiga create draft containing the chosen color and title', () => {
    const fixture = TestBed.createComponent(EpicEditor);
    fixture.componentRef.setInput('mode', 'create');
    fixture.componentRef.setInput('project', project(['add_epic']));
    fixture.componentRef.setInput('filters', filters);
    const save = vi.fn<(change: EpicChanges) => void>();
    fixture.componentInstance.saved.subscribe(save);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLDialogElement>('dialog.epic-editor-backdrop')?.open).toBe(true);

    const title = host.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Release preparation';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.epic-save')!.click();

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Release preparation', color: '#6750a4', status: null,
    }));
  });

  it('retains existing values and separates modification and deletion permissions', () => {
    const fixture = TestBed.createComponent(EpicEditor);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('project', project(['delete_epic']));
    fixture.componentRef.setInput('epic', epic());
    fixture.componentRef.setInput('filters', filters);
    const remove = vi.fn();
    fixture.componentInstance.deleteRequested.subscribe(remove);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Roadmap details');
    expect(host.querySelector<HTMLInputElement>('input[maxlength="500"]')?.disabled).toBe(true);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Epic status"]')?.value).toBe('2');
    expect(host.querySelector('.epic-save')).toBeNull();
    host.querySelector<HTMLButtonElement>('.epic-delete')!.click();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('requires confirmation before discarding user changes', () => {
    const fixture = TestBed.createComponent(EpicEditor);
    fixture.componentRef.setInput('mode', 'edit');
    fixture.componentRef.setInput('project', project(['modify_epic']));
    fixture.componentRef.setInput('epic', epic());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const title = host.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Modified title';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    const close = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(close);
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    try {
      const dialog = host.querySelector<HTMLDialogElement>('dialog.epic-editor-backdrop')!;
      const cancel = new Event('cancel', { cancelable: true });
      dialog.dispatchEvent(cancel);
      expect(cancel.defaultPrevented).toBe(true);
      expect(close).not.toHaveBeenCalled();
      expect(dialog.open).toBe(true);
      host.querySelector<HTMLButtonElement>('.epic-cancel')!.click();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      confirm.mockRestore();
    }
  });
});
