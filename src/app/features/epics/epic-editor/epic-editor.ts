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
import type { EpicChanges, EpicFilterOption, EpicFiltersData, TaigaEpic } from '../data';

export type EpicEditorMode = 'create' | 'edit';

interface EpicDraft {
  readonly subject: string;
  readonly description: string;
  readonly color: string;
  readonly status: number | null;
  readonly assignedTo: number | null;
  readonly tags: string;
  readonly isBlocked: boolean;
  readonly blockedNote: string;
}

const EMPTY_DRAFT: EpicDraft = {
  subject: '',
  description: '',
  color: '#6750a4',
  status: null,
  assignedTo: null,
  tags: '',
  isBlocked: false,
  blockedNote: '',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pf-epic-editor',
  templateUrl: './epic-editor.html',
  styleUrl: './epic-editor.scss',
})
export class EpicEditor {
  readonly mode = input.required<EpicEditorMode>();
  readonly project = input.required<TaigaProjectDetail>();
  readonly epic = input<TaigaEpic | null>(null);
  readonly filters = input<EpicFiltersData | null>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  readonly saved = output<EpicChanges>();
  readonly deleteRequested = output<void>();
  readonly closeRequested = output<void>();

  protected readonly draft = signal<EpicDraft>(EMPTY_DRAFT);
  protected readonly dirty = signal(false);
  private readonly initialized = signal(false);

  protected readonly canEdit = computed(() =>
    !this.project().archived_code && !this.project().blocked_code &&
    (this.project().my_permissions ?? []).includes(
      this.mode() === 'create' ? 'add_epic' : 'modify_epic',
    ),
  );
  protected readonly canDelete = computed(() =>
    this.mode() === 'edit' &&
    !this.project().archived_code && !this.project().blocked_code &&
    (this.project().my_permissions ?? []).includes('delete_epic'),
  );

  protected readonly statusOptions = computed<readonly EpicFilterOption[]>(() => {
    const projectValues = this.project().epic_statuses ?? [];
    const options: EpicFilterOption[] = projectValues.length
      ? projectValues.map(({ id, name, color }) => ({
          id, name, ...(color ? { color } : {}),
        }))
      : [...(this.filters()?.statuses ?? [])].filter(({ id }) =>
          id !== null && id !== undefined,
        );
    const epic = this.epic();
    if (epic?.status !== null && epic?.status !== undefined &&
        !options.some(({ id }) => id === epic.status)) {
      options.unshift({
        id: epic.status,
        name: epic.status_extra_info?.name || 'Status ' + epic.status,
      });
    }
    return options;
  });

  protected readonly assignees = computed(() => {
    const members: EpicFilterOption[] = this.project().members.map((member) => ({
      id: member.id,
      name: member.full_name_display || member.username,
    }));
    const current = this.epic()?.assigned_to_extra_info;
    if (current && !members.some(({ id }) => id === current.id)) {
      members.push({
        id: current.id,
        name: current.full_name_display || current.username,
      });
    }
    return members;
  });

  protected readonly canSubmit = computed(() => {
    const draft = this.draft();
    return this.canEdit() && !this.busy() && this.dirty() &&
      !!draft.subject.trim() && /^#[a-f0-9]{6}$/i.test(draft.color);
  });

  constructor() {
    effect(() => {
      const mode = this.mode();
      const epic = this.epic();
      untracked(() => {
        if (this.initialized()) return;
        this.initialized.set(true);
        this.draft.set(mode === 'create' ? EMPTY_DRAFT : {
          subject: epic?.subject ?? '',
          description: epic?.description ?? '',
          color: /^#[a-f0-9]{6}$/i.test(epic?.color ?? '') ? epic!.color : '#6750a4',
          status: epic?.status ?? null,
          assignedTo: epic?.assigned_to ?? null,
          tags: (epic?.tags ?? []).map(([tag]) => tag).join(', '),
          isBlocked: epic?.is_blocked ?? false,
          blockedNote: epic?.blocked_note ?? '',
        });
      });
    });
  }

  protected updateText(
    key: 'subject' | 'description' | 'tags' | 'blockedNote' | 'color',
    event: Event,
  ): void {
    this.patch({ [key]: (event.target as HTMLInputElement | HTMLTextAreaElement).value });
  }

  protected updateSelect(key: 'status' | 'assignedTo', event: Event): void {
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
    this.saved.emit({
      subject: draft.subject.trim(),
      description: draft.description,
      color: draft.color,
      status: draft.status,
      assigned_to: draft.assignedTo,
      tags: [...new Set(draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean))],
      is_blocked: draft.isBlocked,
      blocked_note: draft.isBlocked ? draft.blockedNote : '',
    });
  }

  protected requestClose(): void {
    if (this.dirty() && this.canEdit() &&
      !globalThis.confirm('Discard unsaved epic changes?')) return;
    this.closeRequested.emit();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.requestClose();
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      this.submit(event);
    }
  }

  private patch(changes: Partial<EpicDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }));
    this.dirty.set(true);
  }
}
