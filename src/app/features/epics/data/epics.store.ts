import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { EpicsApiService } from './epics-api.service';
import {
  DEFAULT_EPIC_QUERY,
  type EpicFilterCategory,
  type EpicFilterMode,
  type EpicFiltersData,
  type EpicListPage,
  type EpicListQuery,
  type TaigaEpic,
} from './epics.models';

export type EpicsLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

@Injectable()
export class EpicsStore {
  private readonly api = inject(EpicsApiService);
  private readonly projectIdState = signal<TaigaId | null>(null);
  private readonly statusState = signal<EpicsLoadStatus>('idle');
  private readonly epicsState = signal<readonly TaigaEpic[]>([]);
  private readonly filtersDataState = signal<EpicFiltersData | null>(null);
  private readonly queryState = signal<EpicListQuery>(DEFAULT_EPIC_QUERY);
  private readonly pageState = signal<EpicListPage | null>(null);
  private readonly errorState = signal<string | null>(null);
  private requestRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly epics = this.epicsState.asReadonly();
  readonly filtersData = this.filtersDataState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly hasActiveFilters = computed(
    () =>
      this.queryState().q.trim().length > 0 || Object.keys(this.queryState().filters).length > 0,
  );

  loadProject(projectId: TaigaId): void {
    if (this.projectIdState() === projectId && this.statusState() !== 'error') {
      return;
    }

    this.projectIdState.set(projectId);
    this.queryState.set(DEFAULT_EPIC_QUERY);
    this.epicsState.set([]);
    this.pageState.set(null);
    this.filtersDataState.set(null);
    this.fetch(DEFAULT_EPIC_QUERY, true);
  }

  setSearch(q: string): void {
    const normalized = q.trim();
    if (normalized !== this.queryState().q) {
      this.updateQuery({ ...this.queryState(), q: normalized, page: 1 }, true);
    }
  }

  setFilter(category: EpicFilterCategory, value: string, mode: EpicFilterMode): void {
    const filters = { ...this.queryState().filters };
    if (value) {
      filters[category] = { value, mode };
    } else {
      delete filters[category];
    }
    this.updateQuery({ ...this.queryState(), filters, page: 1 }, true);
  }

  setFilterMode(category: EpicFilterCategory, mode: EpicFilterMode): void {
    const current = this.queryState().filters[category];
    if (current && current.mode !== mode) {
      this.setFilter(category, current.value, mode);
    }
  }

  setPage(page: number): void {
    const metadata = this.pageState();
    const nextPage = Math.max(1, Math.min(page, metadata?.totalPages ?? page));
    if (nextPage !== this.queryState().page) {
      this.updateQuery({ ...this.queryState(), page: nextPage });
    }
  }

  clearFilters(): void {
    if (this.hasActiveFilters()) {
      this.updateQuery({ ...this.queryState(), q: '', filters: {}, page: 1 }, true);
    }
  }

  retry(): void {
    if (this.projectIdState() !== null) {
      this.fetch(this.queryState(), this.filtersDataState() === null);
    }
  }

  private updateQuery(query: EpicListQuery, refreshFilters = false): void {
    this.queryState.set(query);
    this.fetch(query, refreshFilters);
  }

  private fetch(query: EpicListQuery, refreshFilters = false): void {
    const projectId = this.projectIdState();
    if (projectId === null) {
      return;
    }

    this.statusState.set('loading');
    this.errorState.set(null);
    const revision = ++this.requestRevision;

    if (refreshFilters) {
      forkJoin({
        page: this.api.list(projectId, query),
        filters: this.api.filters(projectId, query),
      }).subscribe({
        next: ({ page, filters }) => {
          if (revision !== this.requestRevision) {
            return;
          }
          this.applyPage(page);
          this.filtersDataState.set(filters);
          this.statusState.set('loaded');
        },
        error: () => this.fail(revision),
      });
      return;
    }

    this.api.list(projectId, query).subscribe({
      next: (page) => {
        if (revision !== this.requestRevision) {
          return;
        }
        this.applyPage(page);
        this.statusState.set('loaded');
      },
      error: () => this.fail(revision),
    });
  }

  private applyPage(page: EpicListPage): void {
    this.epicsState.set(page.items);
    this.pageState.set(page);
    this.errorState.set(null);
  }

  private fail(revision: number): void {
    if (revision !== this.requestRevision) {
      return;
    }
    this.statusState.set('error');
    this.errorState.set('Epics could not be loaded. Check the connection and try again.');
  }
}
