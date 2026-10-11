import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, forkJoin } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { EpicsApiService } from './epics-api.service';
import {
  DEFAULT_EPIC_QUERY,
  type EpicChanges,
  type EpicCreateRequest,
  type EpicMutationResult,
  type EpicFilterCategory,
  type EpicFilterMode,
  type EpicFiltersData,
  type EpicListPage,
  type EpicListQuery,
  type TaigaEpic,
} from './epics.models';

export type EpicsLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type EpicDetailStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type EpicMutationKind = 'create' | 'update' | 'delete';

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
  private readonly selectedEpicState = signal<TaigaEpic | null>(null);
  private readonly detailStatusState = signal<EpicDetailStatus>('idle');
  private readonly detailErrorState = signal<string | null>(null);
  private readonly mutationState = signal<EpicMutationKind | null>(null);
  private readonly mutationErrorState = signal<string | null>(null);
  private readonly reconciliationState = signal(false);
  private requestRevision = 0;
  private detailRevision = 0;
  private mutationRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly epics = this.epicsState.asReadonly();
  readonly filtersData = this.filtersDataState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly selectedEpic = this.selectedEpicState.asReadonly();
  readonly detailStatus = this.detailStatusState.asReadonly();
  readonly detailError = this.detailErrorState.asReadonly();
  readonly mutation = this.mutationState.asReadonly();
  readonly mutationError = this.mutationErrorState.asReadonly();
  readonly requiresReconciliation = this.reconciliationState.asReadonly();
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
    ++this.mutationRevision;
    this.mutationState.set(null);
    this.mutationErrorState.set(null);
    this.reconciliationState.set(false);
    this.closeEpic();
    this.queryState.set(DEFAULT_EPIC_QUERY);
    this.epicsState.set([]);
    this.pageState.set(null);
    this.filtersDataState.set(null);
    this.fetch(DEFAULT_EPIC_QUERY, true);
  }


  openEpic(epic: TaigaEpic): void {
    if (epic.project !== this.projectIdState()) return;
    const projectId = this.projectIdState();
    const revision = ++this.detailRevision;
    this.selectedEpicState.set(epic);
    this.detailStatusState.set('loading');
    this.detailErrorState.set(null);
    this.api.get(epic.id).subscribe({
      next: (detail) => {
        if (revision !== this.detailRevision ||
          projectId !== this.projectIdState() ||
          this.selectedEpicState()?.id !== epic.id) return;
        this.selectedEpicState.set(detail);
        this.detailStatusState.set('loaded');
      },
      error: () => {
        if (revision !== this.detailRevision ||
          projectId !== this.projectIdState() ||
          this.selectedEpicState()?.id !== epic.id) return;
        this.detailStatusState.set('error');
        this.detailErrorState.set('Epic details could not be loaded. Reopen the epic to retry.');
      },
    });
  }

  closeEpic(): void {
    ++this.detailRevision;
    this.selectedEpicState.set(null);
    this.detailStatusState.set('idle');
    this.detailErrorState.set(null);
  }

  dismissMutationError(): void {
    if (!this.reconciliationState()) this.mutationErrorState.set(null);
  }

  private refreshAfterMutation(): void {
    if (this.projectIdState() !== null) this.fetch(this.queryState(), true);
  }

  async createEpic(request: EpicCreateRequest): Promise<EpicMutationResult> {
    if (!this.canWrite(request.project) || !request.subject.trim()) return 'failed';
    const revision = ++this.mutationRevision;
    this.mutationState.set('create');
    this.mutationErrorState.set(null);
    try {
      const created = await firstValueFrom(this.api.create(request));
      if (!this.isCurrentMutation(revision, request.project)) return 'failed';
      this.epicsState.update((epics) => [created, ...epics]);
      this.mutationState.set(null);
      this.queryState.update((query) => ({ ...query, page: 1 }));
      this.refreshAfterMutation();
      return 'created';
    } catch (error: unknown) {
      return this.onMutationError(error, revision, request.project, 'create');
    }
  }

  async updateEpic(epicId: TaigaId, changes: EpicChanges): Promise<EpicMutationResult> {
    const projectId = this.projectIdState();
    const detail = this.selectedEpicState();
    if (projectId === null || !this.canWrite(projectId) ||
      !detail || detail.id !== epicId || !changes.subject.trim()) return 'failed';
    const revision = ++this.mutationRevision;
    this.mutationState.set('update');
    this.mutationErrorState.set(null);
    try {
      const updated = await firstValueFrom(this.api.update(epicId, changes, detail.version));
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.selectedEpicState.set(updated);
      this.epicsState.update((epics) =>
        epics.map((epic) => epic.id === epicId ? updated : epic),
      );
      this.mutationState.set(null);
      this.refreshAfterMutation();
      return 'updated';
    } catch (error: unknown) {
      return this.onMutationError(error, revision, projectId, 'update');
    }
  }

  async deleteEpic(epicId: TaigaId): Promise<EpicMutationResult> {
    const projectId = this.projectIdState();
    const detail = this.selectedEpicState();
    if (projectId === null || !this.canWrite(projectId) ||
      !detail || detail.id !== epicId) return 'failed';
    const revision = ++this.mutationRevision;
    this.mutationState.set('delete');
    this.mutationErrorState.set(null);
    try {
      await firstValueFrom(this.api.delete(epicId));
      if (!this.isCurrentMutation(revision, projectId)) return 'failed';
      this.epicsState.update((epics) => epics.filter(({ id }) => id !== epicId));
      this.closeEpic();
      this.mutationState.set(null);
      const page = this.pageState();
      if (page && page.page > 1 && this.epicsState().length === 0) {
        this.queryState.update((query) => ({ ...query, page: page.page - 1 }));
      }
      this.refreshAfterMutation();
      return 'deleted';
    } catch (error: unknown) {
      return this.onMutationError(error, revision, projectId, 'delete');
    }
  }

  private canWrite(projectId: TaigaId): boolean {
    return projectId === this.projectIdState() &&
      this.statusState() === 'loaded' &&
      !this.isMutating() &&
      !this.reconciliationState();
  }

  private isCurrentMutation(revision: number, projectId: TaigaId): boolean {
    return revision === this.mutationRevision && projectId === this.projectIdState();
  }

  private onMutationError(
    error: unknown,
    revision: number,
    projectId: TaigaId,
    kind: EpicMutationKind,
  ): EpicMutationResult {
    if (!this.isCurrentMutation(revision, projectId)) return 'failed';
    this.mutationState.set(null);
    if (isAmbiguousFailure(error)) {
      this.reconciliationState.set(true);
      this.mutationErrorState.set(
        'Taiga did not confirm the epic ' + kind +
        '. Refreshing before another change; check the result before retrying.',
      );
      this.refreshAfterMutation();
      return 'uncertain';
    }
    this.mutationErrorState.set(
      error instanceof HttpErrorResponse && error.status === 403
        ? 'Your project role does not permit that epic action.'
        : error instanceof HttpErrorResponse && error.status === 409
          ? 'This epic changed elsewhere. Reopen it before saving again.'
          : 'The epic could not be ' +
            (kind === 'create' ? 'created' : kind === 'update' ? 'updated' : 'deleted') + '.',
    );
    return 'failed';
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
    if (this.isMutating() || this.reconciliationState()) return;
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
    this.reconciliationState.set(false);
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

function isAmbiguousFailure(error: unknown): boolean {
  return !(error instanceof HttpErrorResponse) ||
    error.status < 400 || error.status === 408 || error.status >= 500;
}
