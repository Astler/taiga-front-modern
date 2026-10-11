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
import type { IssueChanges, IssueFilterOption, IssueFiltersData, TaigaIssue } from '../data';

export type IssueEditorMode = 'create' | 'edit';

export interface IssueEditorDraft {
  readonly subject: string;
  readonly description: string;
  readonly status: number | null;
  readonly type: number | null;
  readonly severity: number | null;
  readonly priority: number | null;
  readonly assignedTo: number | null;
  readonly dueDate: string;
  readonly tags: string;
  readonly isBlocked: boolean;
  readonly blockedNote: string;
}

const EMPTY_DRAFT: IssueEditorDraft = {
  subject: '',
  description: '',
  status: null,
  type: null,
  severity: null,
  priority: null,
  assignedTo: null,
  dueDate: '',
  tags: '',
  isBlocked: false,
  blockedNote: '',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pf-issue-editor',
  templateUrl: './issue-editor.html',
  styleUrl: './issue-editor.scss',
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
    issueOptions(this.project().issue_statuses, this.filters()?.statuses, this.issue()?.status,
      this.issue()?.status_extra_info?.name),
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
  protected readonly assigneeOptions = computed(() => {
    const members: IssueFilterOption[] = this.project().members.map((member) => ({
      id: member.id,
      name: member.full_name_display || member.username,
    }));
    const current = this.issue()?.assigned_to_extra_info;
    if (current && !members.some(({ id }) => id === current.id)) {
      members.push({
        id: current.id,
        name: current.full_name_display || current.username || 'Team member',
      });
    }
    return members;
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
      // Initialize once per instance; user input must not reset when filters refresh.
      const status = this.statusOptions()[0]?.id ?? null;
      const type = this.typeOptions()[0]?.id ?? null;
      const severity = this.severityOptions()[0]?.id ?? null;
      const priority = this.priorityOptions()[0]?.id ?? null;

      untracked(() => {
        if (this.initialized()) return;
        this.initialized.set(true);
        this.draft.set(mode === 'create' ? {
          ...EMPTY_DRAFT,
          status,
          type,
          severity,
          priority,
        } : {
          subject: issue?.subject ?? '',
          description: issue?.description ?? '',
          status: issue?.status ?? status,
          type: issue?.type ?? type,
          severity: issue?.severity ?? severity,
          priority: issue?.priority ?? priority,
          assignedTo: issue?.assigned_to ?? null,
          dueDate: issue?.due_date ?? '',
          tags: (issue?.tags ?? []).map(([name]) => name).join(', '),
          isBlocked: issue?.is_blocked ?? false,
          blockedNote: issue?.blocked_note ?? '',
        });
      });
    });
  }

  protected updateText(
    key: 'subject' | 'description' | 'dueDate' | 'tags' | 'blockedNote',
    event: Event,
  ): void {
    this.patch({ [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  protected updateSelect(
    key: 'status' | 'type' | 'severity' | 'priority' | 'assignedTo',
    event: Event,
  ): void {
    const value = (event.target as HTMLSelectElement).value;
    this.patch({ [key]: value ? Number(value) : null });
  }

  protected updateBlocked(event: Event): void {
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
    this.saved.emit({
      subject: draft.subject.trim(),
      description: draft.description,
      status: draft.status,
      type: draft.type,
      severity: draft.severity,
      priority: draft.priority,
      assigned_to: draft.assignedTo,
      due_date: draft.dueDate || null,
      tags: [...new Set(draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
      is_blocked: draft.isBlocked,
      blocked_note: draft.isBlocked ? draft.blockedNote : '',
    });
  }

  protected requestClose(): void {
    if (this.dirty() && this.canEdit() &&
      !globalThis.confirm('Discard unsaved issue changes?')) return;
    this.closeRequested.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
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

function issueOptions(
  projectOptions: readonly { id: number; name: string; color?: string }[] | undefined,
  filterOptions: readonly IssueFilterOption[] | undefined,
  selectedId: number | undefined,
  selectedLabel?: string,
): readonly IssueFilterOption[] {
  const options: IssueFilterOption[] = projectOptions?.length
    ? projectOptions.map(({ id, name, color }) => ({
        id, name, ...(color ? { color } : {}),
      }))
    : [...(filterOptions ?? [])].filter((option) => option.id !== null && option.id !== undefined);
  if (selectedId !== undefined && !options.some(({ id }) => id === selectedId)) {
    options.unshift({ id: selectedId, name: selectedLabel ?? 'Value ' + selectedId });
  }
  return options;
}
