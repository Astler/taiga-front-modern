import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { TaigaProjectDetail } from '../../projects/data';
import { IssueAttachments } from './issue-attachments';
import { ModalTopLayerDirective } from '../../../shared/modal-top-layer.directive';
import type { IssueChanges, IssueFilterOption, IssueFiltersData, TaigaIssue } from '../data';

export type IssueEditorMode = 'create' | 'edit';
type IssueChoiceField = 'status' | 'type' | 'severity' | 'priority';
type IssueTypeIcon = 'bug' | 'feature' | 'question' | 'task';

interface IssueMemberChoice {
  readonly id: number;
  readonly name: string;
  readonly photo: string | null;
}

export interface IssueEditorDraft {
  readonly subject: string;
  readonly description: string;
  readonly status: number | null;
  readonly type: number | null;
  readonly severity: number | null;
  readonly priority: number | null;
  readonly assignedTo: number | null;
  readonly dueDate: string;
  readonly tags: readonly string[];
  readonly isBlocked: boolean;
  readonly blockedNote: string;
}

const MAX_VISIBLE_ASSIGNEES = 6;
const EMPTY_DRAFT: IssueEditorDraft = {
  subject: '',
  description: '',
  status: null,
  type: null,
  severity: null,
  priority: null,
  assignedTo: null,
  dueDate: '',
  tags: [],
  isBlocked: false,
  blockedNote: '',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalTopLayerDirective, IssueAttachments],
  selector: 'pf-issue-editor',
  templateUrl: './issue-editor.html',
  styleUrls: ['./issue-editor.scss', './issue-editor-controls.scss'],
})
export class IssueEditor {
  readonly mode = input.required<IssueEditorMode>();
  readonly project = input.required<TaigaProjectDetail>();
  readonly issue = input<TaigaIssue | null>(null);
  readonly filters = input<IssueFiltersData | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly saved = output<IssueChanges>();
  readonly deleteRequested = output<void>();
  readonly closeRequested = output<void>();

  protected readonly draft = signal<IssueEditorDraft>(EMPTY_DRAFT);
  protected readonly dirty = signal(false);
  protected readonly tagInput = signal('');
  protected readonly assigneesExpanded = signal(false);
  protected readonly assigneeSearch = signal('');
  private readonly initialized = signal(false);

  protected readonly canEdit = computed(() =>
    !this.project().archived_code &&
    !this.project().blocked_code &&
    (this.project().my_permissions ?? []).includes(
      this.mode() === 'create' ? 'add_issue' : 'modify_issue',
    ),
  );
  protected readonly canDelete = computed(() =>
    this.mode() === 'edit' &&
    !this.project().archived_code &&
    !this.project().blocked_code &&
    (this.project().my_permissions ?? []).includes('delete_issue'),
  );

  protected readonly statusOptions = computed(() =>
    issueOptions(
      this.project().issue_statuses,
      this.filters()?.statuses,
      this.issue()?.status,
      this.issue()?.status_extra_info?.name,
    ),
  );
  protected readonly typeOptions = computed(() =>
    issueOptions(this.project().issue_types, this.filters()?.types, this.issue()?.type),
  );
  protected readonly severityOptions = computed(() =>
    issueOptions(this.project().severities, this.filters()?.severities, this.issue()?.severity),
  );
  protected readonly priorityOptions = computed(() =>
    issueOptions(this.project().priorities, this.filters()?.priorities, this.issue()?.priority),
  );

  protected readonly assigneeOptions = computed<readonly IssueMemberChoice[]>(() => {
    const members: IssueMemberChoice[] = this.project().members.map((member) => ({
      id: member.id,
      name: member.full_name_display || member.username,
      photo: member.photo ?? null,
    }));
    const current = this.issue()?.assigned_to_extra_info;
    if (current && !members.some(({ id }) => id === current.id)) {
      members.push({
        id: current.id,
        name: current.full_name_display || current.full_name || current.username || 'Team member',
        photo: current.photo ?? null,
      });
    }
    return members.sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly visibleAssignees = computed(() => {
    const all = this.assigneeOptions();
    const query = this.assigneeSearch().trim().toLocaleLowerCase();
    if (this.assigneesExpanded()) {
      return query
        ? all.filter(({ name }) => name.toLocaleLowerCase().includes(query))
        : all;
    }
    // Keep an already assigned person visible even if they are outside the first six.
    const selected = all.find(({ id }) => id === this.draft().assignedTo);
    const head = all.slice(0, MAX_VISIBLE_ASSIGNEES);
    return selected && !head.some(({ id }) => id === selected.id)
      ? [selected, ...head.slice(0, MAX_VISIBLE_ASSIGNEES - 1)]
      : head;
  });

  protected readonly hiddenAssigneeCount = computed(() =>
    Math.max(0, this.assigneeOptions().length - this.visibleAssignees().length),
  );

  protected readonly selectedTags = computed(() => this.draft().tags);
  protected readonly suggestedTags = computed(() => {
    const known = new Map<string, string>();
    for (const name of this.project().tags) {
      if (name.trim()) known.set(name.toLocaleLowerCase(), name);
    }
    for (const { name } of this.filters()?.tags ?? []) {
      if (name.trim()) known.set(name.toLocaleLowerCase(), name);
    }
    const selected = new Set(this.draft().tags.map((tag) => tag.toLocaleLowerCase()));
    const query = this.tagInput().trim().toLocaleLowerCase();
    return [...known.values()]
      .filter((name) =>
        !selected.has(name.toLocaleLowerCase()) &&
        (!query || name.toLocaleLowerCase().includes(query)),
      )
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 8);
  });

  protected readonly canSubmit = computed(() => {
    const draft = this.draft();
    return this.canEdit() && !this.busy() && this.dirty() &&
      !!draft.subject.trim() &&
      draft.status !== null && draft.type !== null &&
      draft.severity !== null && draft.priority !== null;
  });

  constructor() {
    effect(() => {
      const mode = this.mode();
      const issue = this.issue();
      // Initial values come from the project. Subsequent async filter updates
      // must never discard a partially edited form.
      const status = this.statusOptions()[0]?.id ?? null;
      const type = this.typeOptions()[0]?.id ?? null;
      const severity = this.severityOptions()[0]?.id ?? null;
      const priority = this.priorityOptions()[0]?.id ?? null;

      untracked(() => {
        if (this.initialized()) {
          // Filters may arrive after the create dialog appears. Populate only
          // still-missing facet defaults without erasing anything already typed.
          if (mode === 'create') {
            const current = this.draft();
            const fields = {
              ...(current.status === null && status !== null ? { status } : {}),
              ...(current.type === null && type !== null ? { type } : {}),
              ...(current.severity === null && severity !== null ? { severity } : {}),
              ...(current.priority === null && priority !== null ? { priority } : {}),
            };
            if (Object.keys(fields).length > 0) this.draft.update((draft) => ({ ...draft, ...fields }));
          }
          return;
        }
        this.initialized.set(true);
        this.draft.set(mode === 'create' ? {
          ...EMPTY_DRAFT,
          status, type, severity, priority,
        } : {
          subject: issue?.subject ?? '',
          description: issue?.description ?? '',
          status: issue?.status ?? status,
          type: issue?.type ?? type,
          severity: issue?.severity ?? severity,
          priority: issue?.priority ?? priority,
          assignedTo: issue?.assigned_to ?? null,
          dueDate: issue?.due_date ?? '',
          tags: [...new Set((issue?.tags ?? []).map(([name]) => name))],
          isBlocked: issue?.is_blocked ?? false,
          blockedNote: issue?.blocked_note ?? '',
        });
      });
    });
  }

  protected updateText(
    key: 'subject' | 'description' | 'dueDate' | 'blockedNote',
    event: Event,
  ): void {
    this.patch({ [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  protected chooseValue(field: IssueChoiceField, value: number | null | undefined): void {
    if (!this.canEdit() || this.busy() || value == null) return;
    if (this.draft()[field] !== value) this.patch({ [field]: value });
  }

  protected chooseAssignee(id: number | null): void {
    if (!this.canEdit() || this.busy()) return;
    if (this.draft().assignedTo !== id) this.patch({ assignedTo: id });
  }

  protected toggleAssignees(): void {
    this.assigneesExpanded.update((expanded) => !expanded);
    this.assigneeSearch.set('');
  }

  protected updateAssigneeSearch(event: Event): void {
    this.assigneeSearch.set((event.target as HTMLInputElement).value);
  }

  protected memberInitials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('')
      || '?';
  }

  protected issueTypeIcon(name: string | undefined): IssueTypeIcon {
    const value = (name ?? '').toLocaleLowerCase();
    if (/bug|defect|ошибк|баг/.test(value)) return 'bug';
    if (/question|вопрос|help|support/.test(value)) return 'question';
    if (/enhance|feature|improv|улучш|фич|предлож/.test(value)) return 'feature';
    return 'task';
  }

  protected optionAccent(name: string | undefined, color?: string | null): string {
    if (color) return color;
    const label = (name ?? '').toLocaleLowerCase();
    if (/critical|blocker|urgent|критич|блокир/.test(label)) return '#ff8a80';
    if (/high|major|important|важн|высок/.test(label)) return '#ffbd72';
    if (/low|minor|wishlist|низк|незнач/.test(label)) return '#8ac6b7';
    return '#b9a7ee';
  }

  protected setQuickDueDate(offsetDays: 0 | 1 | 7 | null): void {
    if (!this.canEdit() || this.busy()) return;
    const newValue = offsetDays === null ? '' : issueDateAfterDays(new Date(), offsetDays);
    if (this.draft().dueDate !== newValue) this.patch({ dueDate: newValue });
  }

  protected dateMatchesOffset(offsetDays: 0 | 1 | 7): boolean {
    return this.draft().dueDate === issueDateAfterDays(new Date(), offsetDays);
  }

  protected updateTagInput(event: Event): void {
    this.tagInput.set((event.target as HTMLInputElement).value);
  }

  protected tagInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      if (this.canEdit() && !this.busy()) this.commitTagInput();
    }
  }

  protected commitTagInput(): void {
    if (!this.canEdit() || this.busy()) return;
    const tags = this.tagInput().split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length === 0) return;
    const next = [...this.draft().tags];
    const known = new Set(next.map((tag) => tag.toLocaleLowerCase()));
    for (const tag of tags) {
      if (!known.has(tag.toLocaleLowerCase())) {
        next.push(tag);
        known.add(tag.toLocaleLowerCase());
      }
    }
    if (next.length !== this.draft().tags.length) this.patch({ tags: next });
    this.tagInput.set('');
  }

  protected addKnownTag(name: string): void {
    if (!this.canEdit() || this.busy()) return;
    if (!this.draft().tags.some((tag) => tag.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      this.patch({ tags: [...this.draft().tags, name] });
    }
    this.tagInput.set('');
  }

  protected removeTag(name: string): void {
    if (!this.canEdit() || this.busy()) return;
    this.patch({ tags: this.draft().tags.filter((tag) => tag !== name) });
  }

  protected tagColor(name: string): string {
    return this.project().tags_colors[name] || '#a697c4';
  }

  protected updateBlocked(event: Event): void {
    if (!this.canEdit() || this.busy()) return;
    this.patch({ isBlocked: (event.target as HTMLInputElement).checked });
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) return;
    const draft = this.draft();
    if (
      draft.status === null || draft.type === null ||
      draft.severity === null || draft.priority === null
    ) return;
    // Commit any pending typed tags, even if the user didn't press Add.
    const pending = this.tagInput().split(/[,\n]/).map((tag) => tag.trim()).filter(Boolean);
    const tags = [...draft.tags];
    const seen = new Set(tags.map((tag) => tag.toLocaleLowerCase()));
    for (const tag of pending) {
      if (!seen.has(tag.toLocaleLowerCase())) {
        tags.push(tag);
        seen.add(tag.toLocaleLowerCase());
      }
    }
    this.saved.emit({
      subject: draft.subject.trim(),
      description: draft.description,
      status: draft.status,
      type: draft.type,
      severity: draft.severity,
      priority: draft.priority,
      assigned_to: draft.assignedTo,
      due_date: draft.dueDate || null,
      tags,
      is_blocked: draft.isBlocked,
      blocked_note: draft.isBlocked ? draft.blockedNote : '',
    });
  }

  protected requestClose(): void {
    if (this.dirty() && this.canEdit() &&
      !globalThis.confirm('Discard unsaved issue changes?')) return;
    this.closeRequested.emit();
  }

  protected onDialogCancel(event: Event): void {
    event.preventDefault();
    this.requestClose();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.requestClose();
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      this.submit(event);
    }
  }

  private patch(changes: Partial<IssueEditorDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
    this.dirty.set(true);
  }
}

/** Local-date arithmetic avoids the UTC offset shifting quick due dates. */
export function issueDateAfterDays(today: Date, offsetDays: number): string {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function issueOptions(
  projectOptions: readonly { id: number; name: string; color?: string; order?: number }[] | undefined,
  filterOptions: readonly IssueFilterOption[] | undefined,
  selectedId: number | undefined,
  selectedLabel?: string,
): readonly IssueFilterOption[] {
  const options: IssueFilterOption[] = projectOptions?.length
    ? [...projectOptions]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(({ id, name, color }) => ({
          id, name, ...(color ? { color } : {}),
        }))
    : [...(filterOptions ?? [])].filter(({ id }) => id != null);
  if (selectedId !== undefined && !options.some(({ id }) => id === selectedId)) {
    options.unshift({ id: selectedId, name: selectedLabel ?? 'Value ' + selectedId });
  }
  return options;
}
