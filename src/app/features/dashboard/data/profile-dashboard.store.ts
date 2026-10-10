import { Injectable, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ProfileDashboardApiService } from './profile-dashboard-api.service';
import type {
  ProfileDashboardPayload,
  ProfileDashboardStatus,
  ProfileWorkItem,
} from './profile-dashboard.models';

@Injectable()
export class ProfileDashboardStore {
  private readonly api = inject(ProfileDashboardApiService);
  private readonly userIdState = signal<number | null>(null);
  private readonly statusState = signal<ProfileDashboardStatus>('idle');
  private readonly assignedState = signal<readonly ProfileWorkItem[]>([]);
  private readonly watchingState = signal<readonly ProfileWorkItem[]>([]);
  private readonly warningsState = signal<readonly string[]>([]);
  private readonly errorState = signal<string | null>(null);
  private readonly refreshingState = signal(false);
  private revision = 0;

  readonly userId = this.userIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly assigned = this.assignedState.asReadonly();
  readonly watching = this.watchingState.asReadonly();
  readonly warnings = this.warningsState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly refreshing = this.refreshingState.asReadonly();
  readonly loading = computed(() => this.statusState() === 'loading');

  load(userId: number, force = false): void {
    if (!force && this.userIdState() === userId && this.statusState() !== 'error') {
      return;
    }

    const revision = ++this.revision;
    const background = force && this.userIdState() === userId && this.statusState() === 'loaded';
    this.userIdState.set(userId);
    this.errorState.set(null);
    if (background) {
      this.refreshingState.set(true);
    } else {
      this.statusState.set('loading');
      this.assignedState.set([]);
      this.watchingState.set([]);
      this.warningsState.set([]);
    }

    this.api.load(userId).pipe(
      finalize(() => {
        if (revision === this.revision) this.refreshingState.set(false);
      }),
    ).subscribe({
      next: ({ assigned, watching, warnings }: ProfileDashboardPayload) => {
        if (revision !== this.revision || this.userIdState() !== userId) return;
        this.assignedState.set(assigned);
        this.watchingState.set(watching);
        this.warningsState.set(warnings);
        this.statusState.set('loaded');
      },
      error: () => {
        if (revision !== this.revision || this.userIdState() !== userId) return;
        this.errorState.set(
          background
            ? 'The latest account snapshot could not be loaded. Previous data was kept.'
            : 'Your dashboard could not be loaded. Check the connection and try again.',
        );
        if (!background) this.statusState.set('error');
      },
    });
  }

  refresh(): void {
    const userId = this.userIdState();
    if (userId !== null && !this.loading() && !this.refreshingState()) {
      this.load(userId, true);
    }
  }

  clear(): void {
    ++this.revision;
    this.userIdState.set(null);
    this.statusState.set('idle');
    this.assignedState.set([]);
    this.watchingState.set([]);
    this.warningsState.set([]);
    this.errorState.set(null);
    this.refreshingState.set(false);
  }
}
