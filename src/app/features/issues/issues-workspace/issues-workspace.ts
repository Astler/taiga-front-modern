import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import type { TaigaProjectDetail } from '../../projects/data';
import { IssueEditor, type IssueEditorMode } from '../issue-editor/issue-editor';
import {
  IssuesApiService,
  IssuesStore,
  type IssueAssignee,
  type IssueFilterCategory,
  type IssueFilterMode,
  type IssueChanges,
  type IssueFilterOption,
  type IssueFiltersData,
  type TaigaIssue,
} from '../data';

interface FilterDefinition {
  readonly category: IssueFilterCategory;
  readonly label: string;
  readonly dataKey: keyof IssueFiltersData;
}

type IssueAttributeDataKey = 'types' | 'severities' | 'priorities';

interface NewIssueAttachmentUpload {
  readonly projectId: number;
  readonly issue: TaigaIssue;
  readonly files: readonly File[];
  readonly processing: boolean;
  readonly error: string | null;
}

const FILTERS: readonly FilterDefinition[] = [
  { category: 'status', label: 'Status', dataKey: 'statuses' },
  { category: 'type', label: 'Type', dataKey: 'types' },
  { category: 'severity', label: 'Severity', dataKey: 'severities' },
  { category: 'priority', label: 'Priority', dataKey: 'priorities' },
  { category: 'tags', label: 'Tag', dataKey: 'tags' },
  { category: 'assigned_to', label: 'Assignee', dataKey: 'assigned_to' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IssueEditor, MatButtonModule, MatProgressBarModule, MatTooltipModule],
  providers: [IssuesStore],
  selector: 'pf-issues-workspace',
  styleUrl: './issues-workspace.scss',
  templateUrl: './issues-workspace.html',
})
export class IssuesWorkspace implements OnDestroy {
  readonly project = input.required<TaigaProjectDetail>();
  readonly initialSearch = input('');

  protected readonly store = inject(IssuesStore);
  private readonly issuesApi = inject(IssuesApiService);
  protected readonly pendingFiles = signal<readonly File[]>([]);
  protected readonly newIssueUpload = signal<NewIssueAttachmentUpload | null>(null);
  protected readonly filterDefinitions = FILTERS;
  protected readonly searchValue = signal('');
  protected readonly editorMode = signal<IssueEditorMode | null>(null);
  protected readonly canCreateIssues = computed(() => this.canDo('add_issue'));
  protected readonly canModifyIssues = computed(() => this.canDo('modify_issue'));
  protected readonly canDeleteIssues = computed(() => this.canDo('delete_issue'));
  protected readonly visiblePageNumbers = computed(() => {
    const page = this.store.page();
    if (!page) {
      return [];
    }
    const start = Math.max(1, Math.min(page.page - 2, page.totalPages - 4));
    const end = Math.min(page.totalPages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  private loadedProjectId: number | undefined;
  private appliedInitialSearch = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const projectId = this.project().id;
      const initialSearch = this.initialSearch().trim();
      untracked(() => {
        if (projectId === this.loadedProjectId && initialSearch === this.appliedInitialSearch) {
          return;
        }
        const projectChanged = projectId !== this.loadedProjectId;
        this.loadedProjectId = projectId;
        this.appliedInitialSearch = initialSearch;
        this.searchValue.set(initialSearch);
        if (projectChanged) {
          this.pendingFiles.set([]);
          this.newIssueUpload.set(null);
          this.editorMode.set(null);
          this.store.closeIssue();
          this.store.loadProject(projectId);
        }
        if (initialSearch) {
          this.store.setSearch(initialSearch);
        } else if (!projectChanged) {
          this.store.setSearch('');
        }
      });
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
  }

  protected openNewIssue(): void {
    if (!this.canCreateIssues() || this.newIssueUpload()) return;
    this.pendingFiles.set([]);
    this.store.dismissMutationError();
    this.store.closeIssue();
    this.editorMode.set('create');
  }

  protected openIssue(issue: TaigaIssue): void {
    this.pendingFiles.set([]);
    this.store.dismissMutationError();
    this.editorMode.set('edit');
    this.store.openIssue(issue);
  }

  protected closeEditor(): void {
    this.pendingFiles.set([]);
    this.editorMode.set(null);
    this.store.closeIssue();
  }

  protected async saveIssue(changes: IssueChanges): Promise<void> {
    const mode = this.editorMode();
    const projectId = this.project().id;
    if (!mode) return;

    if (mode === 'create') {
      if (!this.canCreateIssues() || this.newIssueUpload()) return;
      const files = [...this.pendingFiles()];
      const result = await this.store.createIssue({ ...changes, project: projectId });

      if (projectId !== this.project().id || this.editorMode() !== mode) return;
      if (result === 'created') {
        const created = this.store.lastCreatedIssue();
        this.closeEditor();
        if (created && files.length) {
          this.newIssueUpload.set({
            projectId,
            issue: created,
            files,
            processing: false,
            error: null,
          });
          void this.retryNewIssueUpload();
        }
      }
      return;
    }

    const issueId = this.store.selectedIssue()?.id;
    if (!this.canModifyIssues() || issueId === undefined || issueId === null) return;
    const result = await this.store.updateIssue(issueId, changes);
    if (projectId !== this.project().id || this.editorMode() !== mode) return;
    if (result === 'updated') this.closeEditor();
  }

  protected async retryNewIssueUpload(): Promise<void> {
    const upload = this.newIssueUpload();
    if (!upload || upload.processing || upload.projectId !== this.project().id) return;

    this.newIssueUpload.set({ ...upload, processing: true, error: null });
    const failed: File[] = [];
    for (const file of upload.files) {
      try {
        await firstValueFrom(this.issuesApi.uploadAttachment(upload.projectId, upload.issue.id, file));
      } catch {
        failed.push(file);
      }
      // Navigation must not restore another project's upload banner.
      if (this.project().id !== upload.projectId) return;
    }

    if (failed.length) {
      this.newIssueUpload.set({
        ...upload,
        files: failed,
        processing: false,
        error: 'Issue #' + upload.issue.ref + ' was created, but ' +
          failed.length + ' attachment(s) could not be uploaded.',
      });
    } else {
      this.newIssueUpload.set(null);
    }
  }

  protected async deleteIssue(): Promise<void> {
    const issue = this.store.selectedIssue();
    if (!issue || !this.canDeleteIssues()) return;
    if (!globalThis.confirm(
      'Permanently delete issue #' + issue.ref + ' "' + issue.subject + '"?\n\n' +
      'Its comments and attachments may be removed as well. This cannot be undone.',
    )) return;

    const projectId = this.project().id;
    const result = await this.store.deleteIssue(issue.id);
    if (projectId !== this.project().id) return;
    if (result === 'deleted') this.closeEditor();
  }

  private canDo(permission: string): boolean {
    const project = this.project();
    return !project.archived_code && !project.blocked_code &&
      (project.my_permissions ?? []).includes(permission);
  }

  protected updateSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchValue.set(value);
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.store.setSearch(value);
    }, 300);
  }

  protected submitSearch(event: Event): void {
    event.preventDefault();
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.store.setSearch(this.searchValue());
  }

  protected updateSort(event: Event): void {
    this.store.setSort((event.target as HTMLSelectElement).value);
  }

  protected updateFilter(definition: FilterDefinition, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const mode = this.store.query().filters[definition.category]?.mode ?? 'include';
    this.store.setFilter(definition.category, value, mode);
  }

  protected updateFilterMode(category: IssueFilterCategory, mode: IssueFilterMode): void {
    this.store.setFilterMode(category, mode);
  }

  protected optionsFor(definition: FilterDefinition): readonly IssueFilterOption[] {
    return this.store.filtersData()?.[definition.dataKey] ?? [];
  }

  protected selectedValue(category: IssueFilterCategory): string {
    return this.store.query().filters[category]?.value ?? '';
  }

  protected selectedMode(category: IssueFilterCategory): IssueFilterMode {
    return this.store.query().filters[category]?.mode ?? 'include';
  }

  protected optionValue(category: IssueFilterCategory, option: IssueFilterOption): string {
    return category === 'tags' ? (option.name ?? '') : String(option.id ?? 'null');
  }

  protected optionLabel(option: IssueFilterOption): string {
    return option.full_name || option.name || 'Unassigned';
  }

  protected issueAttribute(dataKey: IssueAttributeDataKey, id: number): IssueFilterOption | null {
    return this.store.filtersData()?.[dataKey].find((option) => option.id === id) ?? null;
  }

  protected tagOverflowTooltip(tags: readonly (readonly [string, string | null])[]): string {
    return tags
      .slice(2)
      .map(([name]) => name)
      .join(', ');
  }

  protected assigneeName(assignee: IssueAssignee | null): string {
    return assignee?.full_name_display || assignee?.full_name || assignee?.username || 'Unassigned';
  }

  protected assigneeInitials(assignee: IssueAssignee): string {
    return this.assigneeName(assignee)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  protected formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    }).format(date);
  }

  protected clearFilters(): void {
    this.searchValue.set('');
    this.store.clearFilters();
  }

  protected minimum(left: number, right: number): number {
    return Math.min(left, right);
  }
}
