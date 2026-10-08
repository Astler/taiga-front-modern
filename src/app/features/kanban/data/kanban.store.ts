import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { KanbanApiService } from './kanban-api.service';
import type { KanbanSwimlane, KanbanUserStory } from './kanban.models';

export type KanbanLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

@Injectable()
export class KanbanStore {
  private readonly api = inject(KanbanApiService);
  private readonly projectIdState = signal<TaigaId | null>(null);
  private readonly statusState = signal<KanbanLoadStatus>('idle');
  private readonly userStoriesState = signal<readonly KanbanUserStory[]>([]);
  private readonly swimlanesState = signal<readonly KanbanSwimlane[]>([]);
  private readonly errorState = signal<string | null>(null);
  private requestRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly userStories = this.userStoriesState.asReadonly();
  readonly swimlanes = this.swimlanesState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');

  load(projectId: TaigaId, force = false): void {
    if (!force && this.projectIdState() === projectId && this.statusState() !== 'error') {
      return;
    }

    const revision = ++this.requestRevision;
    this.projectIdState.set(projectId);
    this.statusState.set('loading');
    this.errorState.set(null);
    this.userStoriesState.set([]);
    this.swimlanesState.set([]);

    this.api
      .load(projectId)
      .pipe(
        finalize(() => {
          if (revision === this.requestRevision && this.statusState() === 'loading') {
            this.statusState.set('loaded');
          }
        }),
      )
      .subscribe({
        next: ({ swimlanes, userStories }) => {
          if (revision !== this.requestRevision) {
            return;
          }
          this.swimlanesState.set([...swimlanes].sort((a, b) => a.order - b.order));
          this.userStoriesState.set(
            [...userStories].sort((a, b) => a.kanban_order - b.kanban_order),
          );
          this.statusState.set('loaded');
        },
        error: () => {
          if (revision !== this.requestRevision) {
            return;
          }
          this.errorState.set('The board could not be loaded. Check the connection and try again.');
          this.statusState.set('error');
        },
      });
  }

  retry(): void {
    const projectId = this.projectIdState();
    if (projectId !== null) {
      this.load(projectId, true);
    }
  }
}
