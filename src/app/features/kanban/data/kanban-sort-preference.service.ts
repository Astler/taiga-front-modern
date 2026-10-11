import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, catchError, defer, map, of, throwError } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { AuthService, AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import type { KanbanSortMode } from './kanban.models';

const SORT_MODES: readonly KanbanSortMode[] = [
  'manual',
  'newest',
  'updated',
  'due',
  'points',
  'title',
];

const LOCAL_KEY_PREFIX = 'taiga-modern:kanban-sort:';
const REMOTE_KEY_PREFIX = 'pressf-kanban-sort-';

interface UserStorageResponse {
  readonly key: string;
  readonly value: unknown;
}

export const KANBAN_SORT_STORAGE = new InjectionToken<Storage | null>(
  'KANBAN_SORT_STORAGE',
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

export function parseKanbanSortMode(value: unknown): KanbanSortMode | null {
  return SORT_MODES.includes(value as KanbanSortMode) ? (value as KanbanSortMode) : null;
}

export function kanbanSortStorageKey(projectId: TaigaId): string {
  return `${REMOTE_KEY_PREFIX}${projectId}`;
}

@Injectable({ providedIn: 'root' })
export class KanbanSortPreferenceService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly tokens = inject(AuthTokenStorage);
  private readonly auth = inject(AuthService);
  private readonly storage = inject(KANBAN_SORT_STORAGE);
  private readonly queues = new Map<string, Promise<void>>();

  readLocal(userId: TaigaId, projectId: TaigaId): KanbanSortMode {
    try {
      return parseKanbanSortMode(this.storage?.getItem(this.localKey(userId, projectId))) ??
        'manual';
    } catch {
      return 'manual';
    }
  }

  cacheLocal(userId: TaigaId, projectId: TaigaId, mode: KanbanSortMode): void {
    try {
      this.storage?.setItem(this.localKey(userId, projectId), mode);
    } catch {
      // Browser storage can be disabled. The current board still responds normally.
    }
  }

  loadRemote(userId: TaigaId, projectId: TaigaId): Observable<KanbanSortMode | null> {
    const session = this.tokens.revision();
    return defer(() => {
      if (!this.isCurrentAccount(userId, session)) return of(null);
      return this.http.get<UserStorageResponse>(this.remoteUrl(projectId)).pipe(
        map(({ value }) =>
          this.isCurrentAccount(userId, session) ? parseKanbanSortMode(value) : null,
        ),
        // A missing Taiga preference or offline API must not erase the local choice.
        catchError(() => of(null)),
      );
    });
  }

  save(userId: TaigaId, projectId: TaigaId, mode: KanbanSortMode): void {
    if (parseKanbanSortMode(mode) === null) return;
    this.cacheLocal(userId, projectId, mode);

    const session = this.tokens.revision();
    const key = `${userId}:${projectId}:${session}`;
    const previous = this.queues.get(key) ?? Promise.resolve();
    // Preserve ordering: a slow save cannot overwrite a newer user selection.
    const save = previous.catch(() => undefined).then(async () => {
      if (!this.isCurrentAccount(userId, session)) return;
      const storageKey = kanbanSortStorageKey(projectId);
      const body = { key: storageKey, value: mode };
      try {
        await firstValueFrom(
          this.http.put<void>(this.remoteUrl(projectId), body).pipe(
            catchError((error: unknown) =>
              error instanceof HttpErrorResponse && error.status === 404 &&
              this.isCurrentAccount(userId, session)
                ? this.http.post<void>(this.config.resolveApiPath('user-storage'), body)
                : throwError(() => error),
            ),
          ),
        );
      } catch {
        // The per-account, per-project local preference is already saved.
      }
    });
    this.queues.set(key, save);
    void save.then(() => {
      if (this.queues.get(key) === save) this.queues.delete(key);
    });
  }

  private isCurrentAccount(userId: TaigaId, session: number): boolean {
    return this.auth.user()?.id === userId && this.tokens.revision() === session;
  }

  private localKey(userId: TaigaId, projectId: TaigaId): string {
    return `${LOCAL_KEY_PREFIX}${userId}:${projectId}`;
  }

  private remoteUrl(projectId: TaigaId): string {
    return `${this.config.resolveApiPath('user-storage')}/${kanbanSortStorageKey(projectId)}`;
  }
}
