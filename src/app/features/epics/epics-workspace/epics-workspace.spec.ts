import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaigaProjectDetail } from '../../projects/data';
import { EpicsApiService, type EpicFiltersData, type EpicListPage, type TaigaEpic } from '../data';
import { EpicsWorkspace } from './epics-workspace';

describe('EpicsWorkspace', () => {
  const list = vi.fn();
  const filters = vi.fn();
  const get = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const deleteEpic = vi.fn();

  beforeEach(async () => {
    list.mockReset().mockReturnValue(of(epicPage()));
    filters.mockReset().mockReturnValue(of(filtersData()));
    get.mockReset().mockReturnValue(of({ ...epicPage().items[0]!, description: 'Details' }));
    create.mockReset().mockReturnValue(of(epicPage().items[0]!));
    update.mockReset().mockReturnValue(of(epicPage().items[0]!));
    deleteEpic.mockReset().mockReturnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [EpicsWorkspace],
      providers: [{
        provide: EpicsApiService,
        useValue: { list, filters, get, create, update, delete: deleteEpic },
      }],
    }).compileComponents();
  });

  it('renders real epic status, story progress, and people without leaving the workspace', async () => {
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(list).toHaveBeenCalledWith(17, expect.objectContaining({ page: 1 }));
    expect(host.querySelector('.epic-main-cell')?.textContent).toContain('#38');
    expect(host.querySelector('.epic-main-cell')?.textContent).toContain('Modern navigation');
    expect(host.querySelector('[data-label="Status"]')?.textContent).toContain('In progress');
    expect(host.querySelector('[data-label="Progress"]')?.textContent).toContain('40%');
    expect(host.querySelector('[data-label="Progress"]')?.textContent).toContain('4/10 stories');
    expect(host.querySelector('[data-label="Owner"]')?.textContent).toContain('Ada Lovelace');
    expect(host.querySelector('.epic-main-cell a')).toBeNull();
  });

  it('shows compact search and actions without repeating the epic page heading', async () => {
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['add_epic'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const toolbar = host.querySelector<HTMLElement>('.epics-toolbar')!;
    expect(toolbar).toBeTruthy();
    expect(host.querySelector('.epics-header')).toBeNull();
    expect(host.querySelector('#epics-title')).toBeNull();
    expect(toolbar.querySelector('form.search-field')).toBeTruthy();
    expect(toolbar.querySelector('.epics-count')?.textContent).toContain('38 epics');
    expect(toolbar.querySelector('[aria-label^="Sort epics"]')).toBeNull();
    expect(toolbar.querySelector('.epic-filter-toggle')).toBeTruthy();
    expect(toolbar.querySelector('.epic-create-button')).toBeTruthy();
    expect(host.querySelector('.filter-rail')).toBeNull();

    const toggle = toolbar.querySelector<HTMLButtonElement>('.epic-filter-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelectorAll('.filter-rail select')).toHaveLength(4);

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(host.querySelector('.filter-rail')).toBeNull();
  });

  it('creates a new epic from the native editor with permission-gated controls', async () => {
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['add_epic'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.epic-create-button')!.click();
    fixture.detectChanges();

    const editor = host.querySelector<HTMLElement>('pf-epic-editor')!;
    expect(editor).toBeTruthy();
    const title = editor.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Big launch';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.querySelector<HTMLButtonElement>('.epic-save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      project: 17, subject: 'Big launch', color: '#6750a4',
    }));
    expect(host.querySelector('pf-epic-editor')).toBeNull();
  });

  it('loads an epic detail and submits edits using the version', async () => {
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['modify_epic'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.epic-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(get).toHaveBeenCalledWith(38);

    const editor = host.querySelector<HTMLElement>('pf-epic-editor')!;
    expect(editor.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Details');
    const title = editor.querySelector<HTMLInputElement>('input[maxlength="500"]')!;
    title.value = 'Updated roadmap';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.querySelector<HTMLButtonElement>('.epic-save')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(update).toHaveBeenCalledWith(
      38, expect.objectContaining({ subject: 'Updated roadmap' }), 1,
    );
    expect(host.querySelector('pf-epic-editor')).toBeNull();
  });

  it('requires confirmation before deleting and keeps delete permissions independent', async () => {
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', { ...project(), my_permissions: ['delete_epic'] });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.epic-create-button')).toBeNull();
    host.querySelector<HTMLButtonElement>('.epic-open')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const editor = host.querySelector<HTMLElement>('pf-epic-editor')!;
    expect(editor.querySelector('.epic-save')).toBeNull();
    const confirm = vi.spyOn(globalThis, 'confirm').mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    try {
      const del = editor.querySelector<HTMLButtonElement>('.epic-delete')!;
      del.click();
      fixture.detectChanges();
      expect(deleteEpic).not.toHaveBeenCalled();
      del.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(deleteEpic).toHaveBeenCalledWith(38);
      expect(host.querySelector('pf-epic-editor')).toBeNull();
    } finally {
      confirm.mockRestore();
    }
  });

  it('shows remaining tag names in an accessible overflow tooltip', async () => {
    list.mockReturnValue(
      of({
        ...epicPage(),
        items: [
          {
            ...epicPage().items[0]!,
            tags: [
              ['product', '#6750a4'],
              ['navigation', '#00aa88'],
              ['release', '#aa8800'],
            ],
          },
        ],
      }),
    );
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const tooltip = fixture.debugElement.query(By.css('.tag-overflow')).injector.get(MatTooltip);
    expect(tooltip.message).toBe('release');
  });

  it('sends status exclusion to the server-backed store', async () => {
    const fixture = TestBed.createComponent(EpicsWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.epic-filter-toggle')!.click();
    fixture.detectChanges();
    const status = host.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
    status.value = '2';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const exclude = [...host.querySelectorAll<HTMLButtonElement>('.filter-mode button')].find(
      (button) => button.textContent?.trim() === 'Exclude',
    )!;
    exclude.click();
    fixture.detectChanges();

    expect(list).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({ filters: { status: { value: '2', mode: 'exclude' } } }),
    );
    expect(exclude.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.epic-filter-badge')?.textContent).toBe('1');

    const clear = [...host.querySelectorAll<HTMLButtonElement>('.epic-filter-actions button')]
      .find((button) => button.textContent?.trim() === 'Clear all')!;
    clear.click();
    fixture.detectChanges();
    expect(host.querySelector('.epic-filter-badge')).toBeNull();
    expect(list).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({ filters: {} }),
    );
  });
});

function epicPage(): EpicListPage {
  return {
    items: [{ ...epic(38), subject: 'Modern navigation' }],
    total: 38,
    page: 1,
    pageSize: 20,
    totalPages: 2,
  };
}

function epic(id: number): TaigaEpic {
  return {
    id,
    ref: id,
    project: 17,
    project_extra_info: { name: 'Alpha', slug: 'alpha', logo_small_url: null },
    created_date: '2026-10-01T09:00:00Z',
    modified_date: '2026-10-08T10:00:00Z',
    subject: `Epic ${id}`,
    color: '#6750a4',
    epics_order: id,
    client_requirement: false,
    team_requirement: true,
    version: 1,
    watchers: [],
    is_blocked: false,
    blocked_note: '',
    is_closed: false,
    user_stories_counts: { total: 10, progress: 4, opened: 6, closed: 4 },
    owner: 7,
    owner_extra_info: {
      id: 7,
      username: 'ada',
      full_name_display: 'Ada Lovelace',
      photo: null,
    },
    assigned_to: null,
    assigned_to_extra_info: null,
    status: 2,
    status_extra_info: { name: 'In progress', color: '#8de7d0', is_closed: false },
    tags: [['product', '#6750a4']],
    total_attachments: 0,
    total_voters: 0,
    is_voter: false,
    is_watcher: false,
  };
}

function filtersData(): EpicFiltersData {
  return {
    statuses: [{ id: 2, name: 'In progress', color: '#8de7d0', count: 1 }],
    assigned_to: [{ id: null, full_name: '', count: 1 }],
    owners: [{ id: 7, full_name: 'Ada Lovelace', count: 1 }],
    tags: [{ name: 'product', color: '#6750a4', count: 1 }],
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
