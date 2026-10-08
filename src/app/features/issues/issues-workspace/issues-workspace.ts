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
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaProjectDetail } from '../../projects/data';
import {
  IssuesStore,
  type IssueAssignee,
  type IssueFilterCategory,
  type IssueFilterMode,
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
  imports: [MatButtonModule, MatProgressBarModule, MatTooltipModule],
  providers: [IssuesStore],
  selector: 'pf-issues-workspace',
  styleUrl: './issues-workspace.scss',
  templateUrl: './issues-workspace.html',
})
export class IssuesWorkspace implements OnDestroy {
  readonly project = input.required<TaigaProjectDetail>();

  protected readonly store = inject(IssuesStore);
  protected readonly config = inject(RuntimeConfigService);
  protected readonly filterDefinitions = FILTERS;
  protected readonly searchValue = signal('');
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
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const projectId = this.project().id;
      untracked(() => {
        if (projectId === this.loadedProjectId) {
          return;
        }
        this.loadedProjectId = projectId;
        this.searchValue.set('');
        this.store.loadProject(projectId);
      });
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
    }
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

  protected issueUrl(issue: TaigaIssue): string {
    const base = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return base + '/project/' + encodeURIComponent(this.project().slug) + '/issue/' + issue.ref;
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
