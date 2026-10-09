import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import type { KanbanUserStory } from '../../features/kanban/data';
import type { TaigaId } from '../../shared/models';
import { DashboardOverviewApiService } from './dashboard-overview-api.service';
import type { DashboardOverviewStatus, OverviewMilestone } from './dashboard-overview.models';

@Injectable()
export class DashboardOverviewStore {
  private readonly api = inject(DashboardOverviewApiService);
  private readonly projectIdState = signal<TaigaId | null>(null);
  private readonly statusState = signal<DashboardOverviewStatus>('idle');
  private readonly storiesState = signal<readonly KanbanUserStory[]>([]);
  private readonly milestonesState = signal<readonly OverviewMilestone[]>([]);
  private readonly refreshingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private revision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly stories = this.storiesState.asReadonly();
  readonly milestones = this.milestonesState.asReadonly();
  readonly refreshing = this.refreshingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly loading = computed(() => this.statusState() === 'loading');

  load(projectId: TaigaId, force = false): void {
    if (!force && this.projectIdState() === projectId && this.statusState() !== 'error') {
      return;
    }

    const revision = ++this.revision;
    const background = force && this.statusState() === 'loaded';
    this.projectIdState.set(projectId);
    this.errorState.set(null);
    if (background) {
      this.refreshingState.set(true);
    } else {
      this.statusState.set('loading');
      this.storiesState.set([]);
      this.milestonesState.set([]);
    }

    this.api
      .load(projectId)
      .pipe(
        finalize(() => {
          if (revision === this.revision) {
            this.refreshingState.set(false);
          }
        }),
      )
      .subscribe({
        next: ({ milestones, stories }) => {
          if (revision !== this.revision || this.projectIdState() !== projectId) {
            return;
          }
          this.storiesState.set(stories);
          this.milestonesState.set(milestones);
          this.statusState.set('loaded');
        },
        error: () => {
          if (revision !== this.revision || this.projectIdState() !== projectId) {
            return;
          }
          if (background) {
            this.errorState.set('The latest project snapshot could not be loaded.');
            return;
          }
          this.errorState.set(
            'Project overview could not be loaded. Check the connection and retry.',
          );
          this.statusState.set('error');
        },
      });
  }

  refresh(): void {
    const projectId = this.projectIdState();
    if (projectId !== null && !this.loading() && !this.refreshingState()) {
      this.load(projectId, true);
    }
  }
}
