import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { IssuesApiService } from './issues-api.service';
import {
  DEFAULT_ISSUE_QUERY,
  type IssueFilterCategory,
  type IssueFilterMode,
  type IssueFiltersData,
  type IssueListPage,
  type IssueListQuery,
  type TaigaIssue,
} from './issues.models';

export type IssuesLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

@Injectable()
export class IssuesStore {
  private readonly api = inject(IssuesApiService);
  private readonly projectIdState = signal<TaigaId | null>(null);
  private readonly statusState = signal<IssuesLoadStatus>('idle');
  private readonly issuesState = signal<readonly TaigaIssue[]>([]);
  private readonly filtersDataState = signal<IssueFiltersData | null>(null);
  private readonly queryState = signal<IssueListQuery>(DEFAULT_ISSUE_QUERY);
  private readonly pageState = signal<IssueListPage | null>(null);
  private readonly errorState = signal<string | null>(null);
  private requestRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly issues = this.issuesState.asReadonly();
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
    this.queryState.set(DEFAULT_ISSUE_QUERY);
    this.issuesState.set([]);
    this.pageState.set(null);
    this.filtersDataState.set(null);
    this.startRequest();
    const revision = ++this.requestRevision;

    forkJoin({
      page: this.api.list(projectId, DEFAULT_ISSUE_QUERY),
      filters: this.api.filters(projectId),
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
  }

  setSearch(q: string): void {
    const normalized = q.trim();
    if (normalized === this.queryState().q) {
      return;
    }
    this.updateQuery({ ...this.queryState(), q: normalized, page: 1 });
  }

  setSort(orderBy: string): void {
    if (!orderBy || orderBy === this.queryState().orderBy) {
      return;
    }
    this.updateQuery({ ...this.queryState(), orderBy, page: 1 });
  }

  setFilter(category: IssueFilterCategory, value: string, mode: IssueFilterMode): void {
    const filters = { ...this.queryState().filters };
    if (value) {
      filters[category] = { value, mode };
    } else {
      delete filters[category];
    }
    this.updateQuery({ ...this.queryState(), filters, page: 1 });
  }

  setFilterMode(category: IssueFilterCategory, mode: IssueFilterMode): void {
    const current = this.queryState().filters[category];
    if (!current || current.mode === mode) {
      return;
    }
    this.setFilter(category, current.value, mode);
  }

  setPage(page: number): void {
    const metadata = this.pageState();
    const nextPage = Math.max(1, Math.min(page, metadata?.totalPages ?? page));
    if (nextPage !== this.queryState().page) {
      this.updateQuery({ ...this.queryState(), page: nextPage });
    }
  }

  clearFilters(): void {
    const current = this.queryState();
    if (!this.hasActiveFilters()) {
      return;
    }
    this.updateQuery({ ...current, q: '', filters: {}, page: 1 });
  }

  retry(): void {
    const projectId = this.projectIdState();
    if (projectId === null) {
      return;
    }
    if (this.filtersDataState() === null) {
      this.projectIdState.set(null);
      this.loadProject(projectId);
      return;
    }
    this.fetchPage(this.queryState());
  }

  private updateQuery(query: IssueListQuery): void {
    this.queryState.set(query);
    this.fetchPage(query);
  }

  private fetchPage(query: IssueListQuery): void {
    const projectId = this.projectIdState();
    if (projectId === null) {
      return;
    }
    this.startRequest();
    const revision = ++this.requestRevision;
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

  private startRequest(): void {
    this.statusState.set('loading');
    this.errorState.set(null);
  }

  private applyPage(page: IssueListPage): void {
    this.issuesState.set(page.items);
    this.pageState.set(page);
    this.errorState.set(null);
  }

  private fail(revision: number): void {
    if (revision !== this.requestRevision) {
      return;
    }
    this.statusState.set('error');
    this.errorState.set('Issues could not be loaded. Check the connection and try again.');
  }
}
