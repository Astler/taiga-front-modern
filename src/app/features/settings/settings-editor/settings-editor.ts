import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, type Observable } from 'rxjs';
import { ProjectApiService, type TaigaProjectDetail } from '../../projects/data';
import { ModalTopLayerDirective } from '../../../shared/modal-top-layer.directive';
import {
  SettingsApiService,
  WORKFLOW_KINDS,
  type ConfigurationChanges,
  type ConfigurationValue,
  type ProjectChanges,
  type SettingsResource,
  type WorkflowKind,
} from '../data/settings-api.service';

export type SettingsEditorMode = 'profile' | 'modules' | 'workflow' | 'tags' | 'roles';
interface Draft {
  name: string;
  color: string;
  order: number;
  closed: boolean;
  archived: boolean;
  wip: number | null;
  value: number | null;
  computable: boolean;
  permissions: string[];
}
const emptyDraft = (): Draft => ({
  name: '',
  color: '#8f8a99',
  order: 1,
  closed: false,
  archived: false,
  wip: null,
  value: null,
  computable: false,
  permissions: [],
});
const PERMISSION_GROUPS = [
  { label: 'Project', values: ['view_project'] },
  {
    label: 'Sprints',
    values: ['view_milestones', 'add_milestone', 'modify_milestone', 'delete_milestone'],
  },
  {
    label: 'Epics',
    values: ['view_epics', 'add_epic', 'modify_epic', 'comment_epic', 'delete_epic'],
  },
  { label: 'Stories', values: ['view_us', 'add_us', 'modify_us', 'comment_us', 'delete_us'] },
  {
    label: 'Tasks',
    values: ['view_tasks', 'add_task', 'modify_task', 'comment_task', 'delete_task'],
  },
  {
    label: 'Issues',
    values: ['view_issues', 'add_issue', 'modify_issue', 'comment_issue', 'delete_issue'],
  },
  {
    label: 'Wiki pages',
    values: [
      'view_wiki_pages',
      'add_wiki_page',
      'modify_wiki_page',
      'comment_wiki_page',
      'delete_wiki_page',
    ],
  },
  {
    label: 'Wiki links',
    values: ['view_wiki_links', 'add_wiki_link', 'modify_wiki_link', 'delete_wiki_link'],
  },
] as const;

@Component({
  selector: 'pf-settings-editor',
  imports: [FormsModule, ModalTopLayerDirective],
  templateUrl: './settings-editor.html',
  styleUrl: './settings-editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsEditor {
  readonly project = input.required<TaigaProjectDetail>();
  readonly mode = input.required<SettingsEditorMode>();
  readonly projectSaved = output<TaigaProjectDetail>();
  readonly closeRequested = output<void>();
  private readonly api = inject(SettingsApiService);
  private readonly projects = inject(ProjectApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly draftName = viewChild<ElementRef<HTMLInputElement>>('draftName');
  private readonly feedback = viewChild<ElementRef<HTMLElement>>('feedback');
  protected readonly kinds = WORKFLOW_KINDS;
  protected readonly permissionGroups = PERMISSION_GROUPS;
  protected readonly kind = signal<WorkflowKind>('userstory-statuses');
  protected readonly values = signal<readonly ConfigurationValue[]>([]);
  protected readonly tags = signal<readonly { name: string; color: string | null }[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly dirty = signal(false);
  protected readonly editing = signal<number | string | null>(null);
  protected draft = emptyDraft();
  protected profile = { name: '', description: '', is_private: true };
  protected modules = {
    is_backlog_activated: false,
    is_kanban_activated: false,
    is_issues_activated: false,
    is_epics_activated: false,
    is_wiki_activated: false,
  };
  protected readonly moduleFields = [
    { key: 'is_backlog_activated', label: 'Backlog' },
    { key: 'is_kanban_activated', label: 'Kanban' },
    { key: 'is_issues_activated', label: 'Issues' },
    { key: 'is_epics_activated', label: 'Epics' },
    { key: 'is_wiki_activated', label: 'Wiki' },
  ] as const;
  protected readonly title = computed(
    () =>
      ({
        profile: 'Project profile',
        modules: 'Modules',
        workflow: 'Workflow',
        tags: 'Project tags',
        roles: 'Roles and permissions',
      })[this.mode()],
  );
  protected readonly canEdit = computed(
    () =>
      (this.project().i_am_admin || this.project().i_am_owner) &&
      !this.project().archived_code &&
      !this.project().blocked_code,
  );
  protected readonly definition = computed(() =>
    WORKFLOW_KINDS.find((k) => k.key === this.kind())!,
  );
  protected readonly resource = computed<SettingsResource>(() =>
    this.mode() === 'roles' ? 'roles' : this.kind(),
  );
  protected readonly canSave = computed(
    () => this.canEdit() && !this.busy() && !this.loading() && this.dirty(),
  );
  private loadRevision = 0;
  private initializedId: number | undefined;

  constructor() {
    effect(() => {
      if (this.error())
        afterNextRender(() => this.feedback()?.nativeElement.focus(), { injector: this.injector });
    });
    effect(() => {
      const project = this.project();
      const mode = this.mode();
      untracked(() => {
        if (this.initializedId === project.id) return;
        this.initializedId = project.id;
        this.profile = {
          name: project.name,
          description: project.description,
          is_private: project.is_private,
        };
        this.modules = {
          is_backlog_activated: project.is_backlog_activated,
          is_kanban_activated: project.is_kanban_activated,
          is_issues_activated: project.is_issues_activated,
          is_epics_activated: project.is_epics_activated,
          is_wiki_activated: project.is_wiki_activated,
        };
        this.tags.set(
          Object.keys(project.tags_colors).map((name) => ({
            name,
            color: project.tags_colors[name] ?? null,
          })),
        );
        if (mode === 'workflow' || mode === 'roles') void this.loadValues();
      });
    });
  }

  protected changed(): void {
    this.dirty.set(true);
    this.notice.set(null);
  }

  protected async loadValues(): Promise<void> {
    const revision = ++this.loadRevision;
    this.loading.set(true);
    this.error.set(null);
    try {
      const values = await firstValueFrom(this.api.list(this.project().id, this.resource()));
      if (!this.destroyRef.destroyed && revision === this.loadRevision)
        this.values.set([...values].sort((a, b) => a.order - b.order));
    } catch (cause) {
      if (!this.destroyRef.destroyed && revision === this.loadRevision)
        this.error.set(settingsError(cause));
    } finally {
      if (!this.destroyRef.destroyed && revision === this.loadRevision) this.loading.set(false);
    }
  }

  protected switchKind(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (this.dirty() && !globalThis.confirm('Discard unsaved changes?')) {
      select.value = this.kind();
      return;
    }
    this.kind.set(select.value as WorkflowKind);
    this.cancelDraft();
    this.notice.set(null);
    this.values.set([]);
    void this.loadValues();
  }

  protected edit(value?: ConfigurationValue): void {
    if (this.busy() || (this.dirty() && !globalThis.confirm('Discard unsaved changes?'))) return;
    this.draft = value
      ? {
          name: value.name,
          color: value.color || '#8f8a99',
          order: value.order,
          closed: value.is_closed ?? false,
          archived: value.is_archived ?? false,
          wip: value.wip_limit ?? null,
          value: value.value ?? null,
          computable: value.computable ?? false,
          permissions: [...(value.permissions ?? [])],
        }
      : { ...emptyDraft(), order: Math.max(0, ...this.values().map((v) => v.order)) + 1 };
    this.editing.set(value?.id ?? 'new');
    this.dirty.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.focusDraft();
  }

  protected editTag(tag?: { name: string; color: string | null }): void {
    if (this.busy() || (this.dirty() && !globalThis.confirm('Discard unsaved changes?'))) return;
    this.draft = { ...emptyDraft(), name: tag?.name ?? '', color: tag?.color ?? '' };
    this.editing.set(tag?.name ?? '');
    this.dirty.set(false);
    this.error.set(null);
    this.notice.set(null);
    this.focusDraft();
  }

  protected togglePermission(permission: string, event: Event): void {
    this.draft.permissions = (event.target as HTMLInputElement).checked
      ? [...new Set([...this.draft.permissions, permission])]
      : this.draft.permissions.filter((p) => p !== permission);
    this.changed();
  }

  protected permissionLabel(permission: string): string {
    return permission.split('_')[0]!.replace(/^./, (letter) => letter.toUpperCase());
  }
  private focusDraft(): void {
    afterNextRender(() => this.draftName()?.nativeElement.focus(), { injector: this.injector });
  }
  protected cancelDraft(): void {
    this.editing.set(null);
    this.dirty.set(false);
    this.error.set(null);
  }
  protected requestClose(event?: Event): void {
    event?.preventDefault();
    if (this.busy()) return;
    if (this.dirty() && !globalThis.confirm('Discard unsaved changes?')) return;
    this.closeRequested.emit();
  }

  protected async saveProject(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSave()) return;
    const p = this.project();
    const changes: Record<string, unknown> = {};
    const fields =
      this.mode() === 'profile'
        ? { ...this.profile, name: this.profile.name.trim() }
        : this.modules;
    if (this.mode() === 'profile' && !this.profile.name.trim()) {
      this.error.set('Project name is required.');
      return;
    }
    for (const [key, value] of Object.entries(fields))
      if (value !== p[key as keyof TaigaProjectDetail]) changes[key] = value;
    if (!Object.keys(changes).length) {
      this.dirty.set(false);
      return;
    }
    await this.perform(this.api.updateProject(p.id, changes as ProjectChanges), () =>
      this.dirty.set(false),
    );
  }

  protected async saveValue(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSave() || this.editing() === null) return;
    const d = this.draft,
      id = this.editing();
    if (!d.name.trim()) {
      this.error.set('Name is required.');
      return;
    }
    if (!Number.isFinite(d.order) || !Number.isInteger(d.order)) {
      this.error.set('Order must be an integer.');
      return;
    }
    if (this.mode() !== 'roles' && this.definition().color && !/^#[a-f0-9]{6}$/i.test(d.color)) {
      this.error.set('Use a six-digit HEX color.');
      return;
    }
    if (
      this.kind() === 'userstory-statuses' &&
      d.wip !== null &&
      (!Number.isInteger(d.wip) || d.wip < 0)
    ) {
      this.error.set('WIP limit must be a non-negative integer, or empty.');
      return;
    }
    if (this.kind() === 'points' && d.value !== null && !Number.isFinite(d.value)) {
      this.error.set('Point value must be a number, or empty.');
      return;
    }
    let changes: ConfigurationChanges = { name: d.name.trim(), order: d.order };
    if (this.mode() === 'roles')
      changes = { ...changes, computable: d.computable, permissions: d.permissions };
    else {
      if (this.definition().color) changes = { ...changes, color: d.color };
      if (this.definition().closed) changes = { ...changes, is_closed: d.closed };
      if (this.kind() === 'userstory-statuses')
        changes = { ...changes, is_archived: d.archived, wip_limit: d.wip };
      if (this.kind() === 'points') changes = { ...changes, value: d.value };
    }
    // PATCH only changed fields, preserving server values outside this form.
    const original = typeof id === 'number' ? this.values().find((v) => v.id === id) : null;
    if (original)
      changes = Object.fromEntries(
        Object.entries(changes).filter(
          ([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(original[key as keyof ConfigurationValue]),
        ),
      ) as ConfigurationChanges;
    if (!Object.keys(changes).length) {
      this.cancelDraft();
      return;
    }
    await this.perform(
      typeof id === 'number'
        ? this.api.update(this.resource(), id, changes)
        : this.api.create(this.project().id, this.resource(), changes),
      (saved) => {
        this.values.update((current) =>
          [...current.filter((v) => v.id !== saved.id), saved].sort((a, b) => a.order - b.order),
        );
        this.cancelDraft();
      },
    );
  }

  protected async saveTag(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canSave() || typeof this.editing() !== 'string') return;
    const original = this.editing() as string,
      name = this.draft.name.trim().toLowerCase(),
      color = this.draft.color.trim() || null;
    if (!name) {
      this.error.set('Tag name is required.');
      return;
    }
    if (color && !/^#[a-f0-9]{6}$/i.test(color)) {
      this.error.set('Use a six-digit HEX color, or leave it empty.');
      return;
    }
    if (name !== original && this.tags().some((t) => t.name === name)) {
      this.error.set('This tag already exists. Choose another name.');
      return;
    }
    await this.perform(
      original
        ? this.api.editTag(this.project().id, original, name, color)
        : this.api.createTag(this.project().id, name, color),
      () => {
        this.tags.update((current) =>
          [...current.filter((t) => t.name !== original), { name, color }].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
        this.cancelDraft();
      },
    );
  }

  private async perform<T>(request: Observable<T>, apply: (saved: T) => void): Promise<void> {
    if (!this.canEdit() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const saved = await firstValueFrom(request);
      if (this.destroyRef.destroyed) return;
      apply(saved);
      this.notice.set('Saved to Taiga.');
      try {
        const project = await firstValueFrom(this.projects.getById(this.project().id));
        if (!this.destroyRef.destroyed) this.projectSaved.emit(project);
      } catch {
        if (!this.destroyRef.destroyed)
          this.notice.set(
            'Saved to Taiga. The project summary could not be refreshed; reload this page to update it.',
          );
      }
    } catch (cause) {
      if (!this.destroyRef.destroyed) this.error.set(settingsError(cause));
    } finally {
      if (!this.destroyRef.destroyed) this.busy.set(false);
    }
  }
}

export function settingsError(cause: unknown): string {
  if (cause instanceof HttpErrorResponse) {
    if (cause.status === 403)
      return 'You no longer have permission to change this project. Your changes have not been saved.';
    if (cause.status === 0)
      return 'Cannot reach Taiga. Check your connection and try again; your draft is kept here.';
    if (cause.status === 409)
      return 'This configuration changed on the server. Reload it before trying again.';
    if (cause.error && typeof cause.error === 'object') {
      const messages = Object.entries(cause.error).flatMap(([key, value]) =>
        (Array.isArray(value) ? value : [value])
          .filter((v) => typeof v === 'string')
          .map((v) => `${key.startsWith('_') ? '' : key.replaceAll('_', ' ') + ': '}${v}`),
      );
      if (messages.length) return messages.join(' ');
    }
  }
  return 'Could not save or load these settings. Please try again.';
}
