import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { IssuesApiService } from './issues-api.service';
import {
  DEFAULT_ISSUE_QUERY,
  type IssueChanges,
  type IssueCreateRequest,
  type IssueMutationResult,
  type IssueFilterCategory,
  type IssueFilterMode,
  type IssueFiltersData,
  type IssueListPage,
  type IssueListQuery,
  type TaigaIssue,
} from './issues.models';

export type IssuesLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type IssueDetailStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type IssueMutationKind = 'create' | 'update' | 'delete';

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
  private readonly selectedIssueState = signal<TaigaIssue | null>(null);
  private readonly lastCreatedIssueState = signal<TaigaIssue | null>(null);
  private readonly detailStatusState = signal<IssueDetailStatus>('idle');
  private readonly detailErrorState = signal<string | null>(null);
  private readonly mutationState = signal<IssueMutationKind | null>(null);
  private readonly mutationErrorState = signal<string | null>(null);
  private readonly requiresReconciliationState = signal(false);
  private requestRevision = 0;
  private detailRevision = 0;
  private mutationRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly issues = this.issuesState.asReadonly();
  readonly filtersData = this.filtersDataState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly selectedIssue = this.selectedIssueState.asReadonly();
  readonly lastCreatedIssue = this.lastCreatedIssueState.asReadonly();
  readonly detailStatus = this.detailStatusState.asReadonly();
  readonly detailError = this.detailErrorState.asReadonly();
  readonly mutation = this.mutationState.asReadonly();
  readonly mutationError = this.mutationErrorState.asReadonly();
  readonly requiresReconciliation = this.requiresReconciliationState.asReadonly();
  readonly isMutating = computed(() => this.mutationState() !== null);
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
    this.lastCreatedIssueState.set(null);
    ++this.mutationRevision;
    this.mutationState.set(null);
    this.mutationErrorState.set(null);
    this.requiresReconciliationState.set(false);
    this.closeIssue();
    this.queryState.set(DEFAULT_ISSUE_QUERY);
    this.issuesState.set([]);
    this.pageState.set(null);
    this.filtersDataState.set(null);
    this.startRequest();
    const revision = ++this.requestRevision;

    forkJoin({
      page: this.api.list(projectId, DEFAULT_ISSUE_QUERY),
      filters: this.api.filters(projectId, DEFAULT_ISSUE_QUERY),
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


  openIssue(issue: TaigaIssue): void {
    if (issue.project !== this.projectIdState()) return;
    const projectId = this.projectIdState();
    const revision = ++this.detailRevision;
    this.selectedIssueState.set(issue);
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);
    this.api.get(issue.id).subscribe({
      next: (detail) => {
        if (revision !== this.detailRevision ||
          projectId !== this.projectIdState() ||
          this.selectedIssueState()?.id !== issue.id) return;
        this.selectedIssueState.set(detail);
        this.detailStatusState.set('loaded');
      },
      error: () => {
        if (revision !== this.detailRevision ||
          projectId !== this.projectIdState() ||
          this.selectedIssueState()?.id !== issue.id) return;
        this.detailStatusState.set('error');
        this.detailErrorState.set('This issue could not be loaded. Try reopening it.');
      },
    });
  }

  closeIssue(): void {
    ++this.detailRevision;
    this.selectedIssueState.set(null);
    this.detailStatusState.set('idle');
    this.detailErrorState.set(null);
  }

  dismissMutationError(): void {
    if (!this.requiresReconciliationState()) this.mutationErrorState.set(null);
  }

  refreshAfterMutation(): void {
    if (this.projectIdState() === null) return;
    this.fetchPage(this.queryState(), true);
  }

  async createIssue(request: IssueCreateRequest): Promise<IssueMutationResult> {
    if (!this.canWrite(request.project) || !request.subject.trim()) return 'failed';
    this.lastCreatedIssueState.set(null);
    const revision = ++this.mutationRevision;
    this.mutationState.set('create');
    this.mutationErrorState.set(null);
    try {
      const created = await firstValueFrom(this.api.create(request));
      if (!this.isCurrentMutation(revision, request.project)) return 'failed';
      this.lastCreatedIssueState.set(created);
      this.issuesState.update((issues) => [created, ...issues]);
      this.mutationState.set(null);
      this.queryState.update((query) => ({ ...query, page: 1 }));
      this.refreshAfterMutation();
      return 'created';
    } catch (error: unknown) {
      return this.onMutationError(error, revision, request.project, 'create');
    }
  }

  async updateIssue(issueId: TaigaId, changes: IssueChanges): Promise<IssueMutationResult> {
    const projectId = this.projectIdState();
    const detail = this.selectedIssueState();
    if (projectId === null || !this.canWrite(projectId) ||
      !detail || detail.id !== issueId || !changes.subject.trim()) return 'failed';

    const revision = ++this.mutationRevision;
    this.mutationState.set('update');
    this.mutationErrorState.set(null);
    try {
      const updated = await firstValueFrom(this.api.update(issueId, changes, detail.version));
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.selectedIssueState.set(updated);
      this.issuesState.update((issues) =>
        issues.map((issue) => issue.id === issueId ? updated : issue),
      );
      this.mutationState.set(null);
      this.refreshAfterMutation();
      return 'updated';
    } catch (error: unknown) {
      return this.onMutationError(error, revision, projectId, 'update');
    }
  }

  async deleteIssue(issueId: TaigaId): Promise<IssueMutationResult> {
    const projectId = this.projectIdState();
    const detail = this.selectedIssueState();
    if (projectId === null || !this.canWrite(projectId) ||
      !detail || detail.id !== issueId) return 'failed';

    const revision = ++this.mutationRevision;
    this.mutationState.set('delete');
    this.mutationErrorState.set(null);
    try {
      await firstValueFrom(this.api.delete(issueId));
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.issuesState.update((issues) => issues.filter(({ id }) => id !== issueId));
      this.closeIssue();
      this.mutationState.set(null);
      const page = this.pageState();
      if (page && page.page > 1 && this.issuesState().length === 0) {
        this.queryState.update((query) => ({ ...query, page: page.page - 1 }));
      }
      this.refreshAfterMutation();
      return 'deleted';
    } catch (error: unknown) {
      return this.onMutationError(error, revision, projectId, 'delete');
    }
  }

  private canWrite(projectId: TaigaId): boolean {
    return this.projectIdState() === projectId &&
      this.statusState() === 'loaded' &&
      !this.isMutating() &&
      !this.requiresReconciliationState();
  }

  private isCurrentMutation(revision: number, projectId: TaigaId): boolean {
    return revision === this.mutationRevision && projectId === this.projectIdState();
  }

  private onMutationError(
    error: unknown,
    revision: number,
    projectId: TaigaId,
    kind: IssueMutationKind,
  ): IssueMutationResult {
    if (!this.isCurrentMutation(revision, projectId)) return 'failed';
    this.mutationState.set(null);
    if (isAmbiguousFailure(error)) {
      this.requiresReconciliationState.set(true);
      this.mutationErrorState.set(
        'Taiga did not confirm the issue ' + kind +
        '. Refreshing to verify the result before another change.',
      );
      this.refreshAfterMutation();
      return 'uncertain';
    }
    this.mutationErrorState.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your project role does not permit that issue action.'
        : error instanceof HttpErrorResponse && error.status === 409
          ? 'This issue changed elsewhere. Reopen it before saving again.'
          : 'The issue could not be ' +
            (kind === 'create' ? 'created' : kind === 'update' ? 'updated' : 'deleted') + '.',
    );
    return 'failed';
  }

  setSearch(q: string): void {
    const normalized = q.trim();
    if (normalized === this.queryState().q) {
      return;
    }
    this.updateQuery({ ...this.queryState(), q: normalized, page: 1 }, true);
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
    this.updateQuery({ ...this.queryState(), filters, page: 1 }, true);
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
    this.updateQuery({ ...current, q: '', filters: {}, page: 1 }, true);
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
    this.fetchPage(this.queryState(), true);
  }

  private updateQuery(query: IssueListQuery, refreshFilters = false): void {
    if (this.isMutating() || this.requiresReconciliationState()) return;
    this.queryState.set(query);
    this.fetchPage(query, refreshFilters);
  }

  private fetchPage(query: IssueListQuery, refreshFilters = false): void {
    const projectId = this.projectIdState();
    if (projectId === null) {
      return;
    }
    this.startRequest();
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

  private startRequest(): void {
    this.statusState.set('loading');
    this.errorState.set(null);
  }

  private applyPage(page: IssueListPage): void {
    this.requiresReconciliationState.set(false);
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

function isAmbiguousFailure(error: unknown): boolean {
  return !(error instanceof HttpErrorResponse) ||
    error.status < 400 || error.status === 408 || error.status >= 500;
}
