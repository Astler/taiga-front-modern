import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { catchError, firstValueFrom, throwError } from 'rxjs';
import { AuthService, AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';

export type KanbanPointsSyncState = 'local' | 'loading' | 'saving' | 'synced';

const LOCAL_PREFIX = 'taiga-modern:kanban-points-visible:';
const REMOTE_PREFIX = 'pressf-kanban-points-visible-';

interface UserStorageResponse {
  readonly key: string;
  readonly value: unknown;
}

export const KANBAN_POINTS_STORAGE = new InjectionToken<Storage | null>(
  'KANBAN_POINTS_STORAGE',
  {
    providedIn: 'root',
    factory: () => {
      try {
        return globalThis.localStorage ?? null;
      } catch {
        return null;
      }
    },
  },
);

export function pointsVisibilityStorageKey(projectId: TaigaId): string {
  return `${REMOTE_PREFIX}${projectId}`;
}

/**
 * Personal, project-scoped visibility preference.
 *
 * Stable Taiga has role-based estimates but no dedicated project-wide switch
 * for removing that feature. Keep all stored estimates untouched and let each
 * user opt in separately through their Taiga user-storage.
 */
@Injectable({ providedIn: 'root' })
export class KanbanPointsVisibilityService {
  private readonly auth = inject(AuthService);
  private readonly tokens = inject(AuthTokenStorage);
  private readonly config = inject(RuntimeConfigService);
  private readonly http = inject(HttpClient);
  private readonly storage = inject(KANBAN_POINTS_STORAGE);

  private readonly visibilityState = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly syncState = signal<ReadonlyMap<string, KanbanPointsSyncState>>(new Map());
  private readonly loaded = new Set<string>();
  private readonly editRevisions = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  visibleFor(projectId: TaigaId): boolean {
    const userId = this.auth.user()?.id;
    if (userId === undefined) return false;
    const key = this.sessionKey(userId, projectId, this.tokens.revision());
    return this.visibilityState().get(key) ?? this.readLocal(userId, projectId);
  }

  syncFor(projectId: TaigaId): KanbanPointsSyncState {
    const userId = this.auth.user()?.id;
    if (userId === undefined) return 'local';
    return this.syncState().get(this.sessionKey(userId, projectId, this.tokens.revision())) ??
      'local';
  }

  load(projectId: TaigaId): void {
    const userId = this.auth.user()?.id;
    if (userId === undefined) return;
    const session = this.tokens.revision();
    const key = this.sessionKey(userId, projectId, session);
    if (this.loaded.has(key)) return;
    this.loaded.add(key);

    this.setVisibility(key, this.readLocal(userId, projectId));
    this.setSync(key, 'loading');
    const revision = this.editRevisions.get(key) ?? 0;
    this.http.get<UserStorageResponse>(this.remoteUrl(projectId)).subscribe({
      next: ({ value }) => {
        if (!this.isCurrent(userId, session) || (this.editRevisions.get(key) ?? 0) !== revision) {
          return;
        }
        if (typeof value === 'boolean') {
          this.setVisibility(key, value);
          this.cacheLocal(userId, projectId, value);
          this.setSync(key, 'synced');
        } else {
          this.setSync(key, 'local');
        }
      },
      error: () => {
        if (this.isCurrent(userId, session) && (this.editRevisions.get(key) ?? 0) === revision) {
          this.setSync(key, 'local');
        }
      },
    });
  }

  setVisible(projectId: TaigaId, enabled: boolean): void {
    const userId = this.auth.user()?.id;
    if (userId === undefined) return;
    const session = this.tokens.revision();
    const key = this.sessionKey(userId, projectId, session);
    if (this.visibleFor(projectId) === enabled && this.syncFor(projectId) === 'synced') return;

    this.setVisibility(key, enabled);
    this.cacheLocal(userId, projectId, enabled);
    const revision = (this.editRevisions.get(key) ?? 0) + 1;
    this.editRevisions.set(key, revision);
    this.setSync(key, 'saving');

    const previous = this.queues.get(key) ?? Promise.resolve();
    // Serial writes keep fast toggle changes in the order the user selected them.
    const task = previous.catch(() => undefined).then(async () => {
      if (!this.isCurrent(userId, session)) return;
      const storageKey = pointsVisibilityStorageKey(projectId);
      const body = { key: storageKey, value: enabled };
      try {
        await firstValueFrom(
          this.http.put<void>(this.remoteUrl(projectId), body).pipe(
            catchError((error: unknown) =>
              error instanceof HttpErrorResponse &&
              error.status === 404 &&
              this.isCurrent(userId, session)
                ? this.http.post<void>(this.config.resolveApiPath('user-storage'), body)
                : throwError(() => error),
            ),
          ),
        );
        if (this.isCurrent(userId, session) && this.editRevisions.get(key) === revision) {
          this.setSync(key, 'synced');
        }
      } catch {
        if (this.isCurrent(userId, session) && this.editRevisions.get(key) === revision) {
          this.setSync(key, 'local');
        }
      }
    });
    this.queues.set(key, task);
    void task.then(() => {
      if (this.queues.get(key) === task) this.queues.delete(key);
    });
  }

  private setVisibility(key: string, enabled: boolean): void {
    this.visibilityState.update((current) => new Map(current).set(key, enabled));
  }

  private setSync(key: string, status: KanbanPointsSyncState): void {
    this.syncState.update((current) => new Map(current).set(key, status));
  }

  private readLocal(userId: TaigaId, projectId: TaigaId): boolean {
    try {
      return this.storage?.getItem(this.localKey(userId, projectId)) === 'true';
    } catch {
      return false;
    }
  }

  private cacheLocal(userId: TaigaId, projectId: TaigaId, value: boolean): void {
    try {
      this.storage?.setItem(this.localKey(userId, projectId), String(value));
    } catch {
      // Continue with the reactive state if browser storage is unavailable.
    }
  }

  private isCurrent(userId: TaigaId, session: number): boolean {
    return this.auth.user()?.id === userId && this.tokens.revision() === session;
  }

  private sessionKey(userId: TaigaId, projectId: TaigaId, session: number): string {
    return `${session}:${userId}:${projectId}`;
  }

  private localKey(userId: TaigaId, projectId: TaigaId): string {
    return `${LOCAL_PREFIX}${userId}:${projectId}`;
  }

  private remoteUrl(projectId: TaigaId): string {
    return `${this.config.resolveApiPath('user-storage')}/${pointsVisibilityStorageKey(projectId)}`;
  }
}
