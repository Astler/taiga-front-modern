import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectApiService, type TaigaProjectDetail } from '../../projects/data';
import { SettingsApiService, type ConfigurationValue } from '../data/settings-api.service';
import { SettingsEditor, type SettingsEditorMode } from './settings-editor';

const status: ConfigurationValue = {
  id: 10,
  name: 'Ready',
  color: '#123456',
  order: 1,
  is_closed: false,
  is_archived: false,
  wip_limit: null,
};
const project = {
  id: 7,
  name: 'Project',
  description: 'Original',
  is_private: true,
  i_am_admin: true,
  i_am_owner: false,
  archived_code: null,
  blocked_code: null,
  is_kanban_activated: true,
  is_backlog_activated: true,
  is_epics_activated: false,
  is_issues_activated: true,
  is_wiki_activated: false,
  tags: ['old'],
  tags_colors: { old: '#123456' },
} as unknown as TaigaProjectDetail;

describe('SettingsEditor', () => {
  const api = {
    list: vi.fn(() => of([status])),
    updateProject: vi.fn(() => of({})),
    update: vi.fn(() => of({ ...status, name: 'Changed' })),
    create: vi.fn(() => of(status)),
    createTag: vi.fn(() => of({})),
    editTag: vi.fn(() => of({})),
  };
  const getById = vi.fn(() => of(project));
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockReturnValue(of([status]));
    api.updateProject.mockReturnValue(of({}));
    api.update.mockReturnValue(of({ ...status, name: 'Changed' }));
    api.create.mockReturnValue(of(status));
    getById.mockReturnValue(of(project));
    TestBed.configureTestingModule({
      imports: [SettingsEditor],
      providers: [
        { provide: SettingsApiService, useValue: api },
        { provide: ProjectApiService, useValue: { getById } },
      ],
    });
  });
  async function setup(mode: SettingsEditorMode, selected = project) {
    const f = TestBed.createComponent(SettingsEditor);
    f.componentRef.setInput('project', selected);
    f.componentRef.setInput('mode', mode);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  }
  async function fill(f: ComponentFixture<SettingsEditor>, name: string, value: string) {
    const el = f.nativeElement.querySelector(`[name="${name}"]`) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  }
  async function submit(f: ComponentFixture<SettingsEditor>) {
    f.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  }
  it('saves only changed profile fields and emits freshly read project data', async () => {
    const f = await setup('profile'),
      saved = vi.fn();
    f.componentInstance.projectSaved.subscribe(saved);
    await fill(f, 'name', ' Changed ');
    await submit(f);
    expect(api.updateProject).toHaveBeenCalledWith(7, { name: 'Changed' });
    expect(getById).toHaveBeenCalledWith(7);
    expect(saved).toHaveBeenCalledWith(project);
    expect(f.nativeElement.textContent).toContain('Saved to Taiga');
  });
  it('keeps a draft after a failed write and does not announce success', async () => {
    api.updateProject.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    const f = await setup('profile');
    await fill(f, 'name', 'Changed');
    await submit(f);
    expect(f.nativeElement.querySelector('[name=name]').value).toBe('Changed');
    expect(f.nativeElement.querySelector('[role=alert]').textContent).toContain('permission');
    expect(f.nativeElement.textContent).not.toContain('Saved to Taiga');
    expect(getById).not.toHaveBeenCalled();
  });
  it('prevents read-only and archived projects from sending mutations', async () => {
    for (const p of [
      { ...project, i_am_admin: false },
      { ...project, archived_code: 'archived' },
    ]) {
      const f = await setup('profile', p);
      await fill(f, 'name', 'Changed');
      await submit(f);
      f.destroy();
    }
    expect(api.updateProject).not.toHaveBeenCalled();
  });
  it('patches an existing workflow value without recreating it', async () => {
    const f = await setup('workflow');
    f.nativeElement.querySelector('[aria-label="Edit Ready"]').click();
    f.detectChanges();
    await f.whenStable();
    await fill(f, 'valueName', 'Changed');
    await submit(f);
    expect(api.update).toHaveBeenCalledWith('userstory-statuses', 10, { name: 'Changed' });
    expect(api.create).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('Changed');
  });
  it('switches taxonomy requests to the selected workflow resource', async () => {
    const f = await setup('workflow'),
      select = f.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'issue-types';
    select.dispatchEvent(new Event('change'));
    f.detectChanges();
    await f.whenStable();
    expect(api.list).toHaveBeenLastCalledWith(7, 'issue-types');
  });
  it('preserves unknown role permissions when changing the role name', async () => {
    api.list.mockReturnValue(
      of([
        {
          id: 10,
          name: 'Ready',
          order: 1,
          computable: true,
          permissions: ['view_project', 'custom_permission'],
        },
      ]),
    );
    const f = await setup('roles');
    f.nativeElement.querySelector('[aria-label="Edit Ready"]').click();
    f.detectChanges();
    await f.whenStable();
    await fill(f, 'valueName', 'Changed');
    await submit(f);
    expect(api.update).toHaveBeenCalledWith('roles', 10, { name: 'Changed' });
  });
  it('renames a tag through its project-wide action', async () => {
    const f = await setup('tags');
    f.nativeElement.querySelector('.config-row button').click();
    f.detectChanges();
    await f.whenStable();
    await fill(f, 'tagName', 'NEW');
    await submit(f);
    expect(api.editTag).toHaveBeenCalledWith(7, 'old', 'new', '#123456');
  });
  it('does not repeat a successful write when summary refresh fails', async () => {
    getById.mockReturnValue(throwError(() => new Error('offline')));
    const f = await setup('profile');
    await fill(f, 'name', 'Changed');
    await submit(f);
    await submit(f);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    expect(f.nativeElement.textContent).toContain(
      'Saved to Taiga. The project summary could not be refreshed',
    );
  });
  it('blocks duplicate submissions while a write is pending', async () => {
    const pending = new Subject<{}>();
    api.updateProject.mockReturnValue(pending);
    const f = await setup('profile');
    await fill(f, 'name', 'Changed');
    await submit(f);
    await submit(f);
    expect(api.updateProject).toHaveBeenCalledTimes(1);
    pending.next({});
    pending.complete();
    await f.whenStable();
  });
});
