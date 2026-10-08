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
  EpicsStore,
  type EpicFilterCategory,
  type EpicFilterMode,
  type EpicFilterOption,
  type EpicFiltersData,
  type EpicPersonExtraInfo,
  type EpicTag,
  type TaigaEpic,
} from '../data';

interface FilterDefinition {
  readonly category: EpicFilterCategory;
  readonly label: string;
  readonly dataKey: keyof EpicFiltersData;
}

const FILTERS: readonly FilterDefinition[] = [
  { category: 'status', label: 'Status', dataKey: 'statuses' },
  { category: 'assigned_to', label: 'Assignee', dataKey: 'assigned_to' },
  { category: 'owner', label: 'Owner', dataKey: 'owners' },
  { category: 'tags', label: 'Tag', dataKey: 'tags' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, MatTooltipModule],
  providers: [EpicsStore],
  selector: 'pf-epics-workspace',
  styleUrl: './epics-workspace.scss',
  templateUrl: './epics-workspace.html',
})
export class EpicsWorkspace implements OnDestroy {
  readonly project = input.required<TaigaProjectDetail>();

  protected readonly store = inject(EpicsStore);
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

  private readonly config = inject(RuntimeConfigService);
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

  protected updateFilter(definition: FilterDefinition, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const mode = this.store.query().filters[definition.category]?.mode ?? 'include';
    this.store.setFilter(definition.category, value, mode);
  }

  protected updateFilterMode(category: EpicFilterCategory, mode: EpicFilterMode): void {
    this.store.setFilterMode(category, mode);
  }

  protected optionsFor(definition: FilterDefinition): readonly EpicFilterOption[] {
    return this.store.filtersData()?.[definition.dataKey] ?? [];
  }

  protected selectedValue(category: EpicFilterCategory): string {
    return this.store.query().filters[category]?.value ?? '';
  }

  protected selectedMode(category: EpicFilterCategory): EpicFilterMode {
    return this.store.query().filters[category]?.mode ?? 'include';
  }

  protected optionValue(category: EpicFilterCategory, option: EpicFilterOption): string {
    return category === 'tags' ? (option.name ?? '') : String(option.id ?? 'null');
  }

  protected optionLabel(option: EpicFilterOption): string {
    return option.full_name || option.name || 'Unassigned';
  }

  protected epicUrl(epic: TaigaEpic): string {
    const base = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return `${base}/project/${encodeURIComponent(this.project().slug)}/epic/${epic.ref}`;
  }

  protected classicEpicsUrl(): string {
    const base = this.config.snapshot().legacyUrl.replace(/\/+$/, '');
    return `${base}/project/${encodeURIComponent(this.project().slug)}/epics`;
  }

  protected progressPercent(epic: TaigaEpic): number {
    if (epic.is_closed || epic.status_extra_info?.is_closed) {
      return 100;
    }
    const { progress, total } = epic.user_stories_counts;
    return total > 0 ? Math.max(0, Math.min(100, Math.round((progress * 100) / total))) : 0;
  }

  protected personName(person: EpicPersonExtraInfo | null): string {
    return person?.full_name_display || person?.username || 'Unassigned';
  }

  protected personInitials(person: EpicPersonExtraInfo): string {
    return this.personName(person)
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  protected tagOverflowTooltip(tags: readonly EpicTag[]): string {
    return tags
      .slice(2)
      .map(([name]) => name)
      .join(', ');
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
