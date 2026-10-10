import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  DestroyRef,
  Injectable,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom, catchError, defer, throwError } from 'rxjs';
import { AuthService, AuthTokenStorage } from '../core/auth';
import { RuntimeConfigService } from '../core/config';

export type StoryEditorLayoutMode = 'auto' | 'side' | 'fullscreen';
export type StoryEditorLayoutSync = 'local' | 'loading' | 'saving' | 'synced';

const STORAGE_KEY = 'pressf-story-editor-layout';
const LOCAL_KEY = 'taiga-modern:story-editor-layout:';
const SMALL_VIEWPORT = '(max-width: 1399px), (max-height: 799px)';

export const STORY_EDITOR_LAYOUT_STORAGE = new InjectionToken<Storage | null>(
  'STORY_EDITOR_LAYOUT_STORAGE',
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

interface UserStorageResponse {
  readonly key: string;
  readonly value: unknown;
}

export function parseStoryEditorLayoutMode(value: unknown): StoryEditorLayoutMode | null {
  return value === 'auto' || value === 'side' || value === 'fullscreen' ? value : null;
}

@Injectable({ providedIn: 'root' })
export class StoryEditorLayoutService {
  private readonly auth = inject(AuthService);
  private readonly tokens = inject(AuthTokenStorage);
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly storage = inject(STORY_EDITOR_LAYOUT_STORAGE);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly modeState = signal<StoryEditorLayoutMode>('auto');
  private readonly syncStateValue = signal<StoryEditorLayoutSync>('local');
  private readonly smallViewportState = signal(false);
  private activeUserId: number | null = null;
  private activeSessionRevision = -1;
  private memberRevision = 0;
  private editRevision = 0;
  private saveQueue: Promise<void> = Promise.resolve();

  readonly mode = this.modeState.asReadonly();
  readonly syncState = this.syncStateValue.asReadonly();
  readonly fullscreen = computed(
    () => this.modeState() === 'fullscreen' ||
      (this.modeState() === 'auto' && this.smallViewportState()),
  );

  constructor() {
    const media = this.document.defaultView?.matchMedia?.(SMALL_VIEWPORT);
    if (media) {
      this.smallViewportState.set(media.matches);
      const onChange = (event: MediaQueryListEvent) => this.smallViewportState.set(event.matches);
      media.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => media.removeEventListener('change', onChange));
    }

    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      const session = this.tokens.revision();
      untracked(() => this.activateUser(userId, session));
    });
  }

  setMode(mode: StoryEditorLayoutMode): void {
    // Allow selecting the same mode again to sync an offline/local-only choice.
    if (mode === this.modeState() && this.syncStateValue() === 'synced') return;
    const userId = this.activeUserId;
    if (userId === null) return;

    this.modeState.set(mode);
    this.writeLocal(userId, mode);
    const editRevision = ++this.editRevision;
    const memberRevision = this.memberRevision;
    const sessionRevision = this.activeSessionRevision;
    this.syncStateValue.set('saving');

    // Serialize remote writes so a slow previous save cannot overwrite a newer choice.
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(async () => {
        if (!this.isCurrentUser(userId, memberRevision, sessionRevision)) return;
        try {
          await firstValueFrom(this.saveRemote(mode, sessionRevision));
          if (this.isCurrentUser(userId, memberRevision, sessionRevision) &&
              editRevision === this.editRevision) {
            this.syncStateValue.set('synced');
          }
        } catch {
          if (this.isCurrentUser(userId, memberRevision, sessionRevision) &&
              editRevision === this.editRevision) {
            this.syncStateValue.set('local');
          }
        }
      });
  }

  private activateUser(userId: number | null, sessionRevision: number): void {
    if (this.activeUserId === userId && this.activeSessionRevision === sessionRevision) {
      return;
    }
    this.activeUserId = userId;
    this.activeSessionRevision = sessionRevision;
    const memberRevision = ++this.memberRevision;
    this.editRevision = 0;
    this.modeState.set(userId === null ? 'auto' : this.readLocal(userId));
    this.syncStateValue.set(userId === null ? 'local' : 'loading');

    if (userId === null) return;
    const initialEditRevision = this.editRevision;
    this.http.get<UserStorageResponse>(this.storageUrl()).subscribe({
      next: ({ value }) => {
        if (!this.isCurrentUser(userId, memberRevision, sessionRevision) ||
            this.editRevision !== initialEditRevision) return;
        const mode = parseStoryEditorLayoutMode(value);
        if (mode !== null) {
          this.modeState.set(mode);
          this.writeLocal(userId, mode);
        }
        this.syncStateValue.set(mode === null ? 'local' : 'synced');
      },
      error: () => {
        if (this.isCurrentUser(userId, memberRevision, sessionRevision) &&
            this.editRevision === initialEditRevision) {
          // Offline and first-time users retain the per-account device fallback.
          this.syncStateValue.set('local');
        }
      },
    });
  }

  private saveRemote(mode: StoryEditorLayoutMode, sessionRevision: number) {
    const body = { key: STORAGE_KEY, value: mode };
    return defer(() => {
      if (this.tokens.revision() !== sessionRevision) {
        return throwError(() => new Error('Authentication session changed.'));
      }
      return this.http.put<void>(this.storageUrl(), body).pipe(
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse &&
          error.status === 404 &&
          this.tokens.revision() === sessionRevision
            ? this.http.post<void>(this.config.resolveApiPath('user-storage'), body)
            : throwError(() => error),
        ),
      );
    });
  }

  private isCurrentUser(userId: number, memberRevision: number, sessionRevision: number): boolean {
    return this.activeUserId === userId &&
      this.memberRevision === memberRevision &&
      this.activeSessionRevision === sessionRevision &&
      this.tokens.revision() === sessionRevision;
  }

  private storageUrl(): string {
    return `${this.config.resolveApiPath('user-storage')}/${STORAGE_KEY}`;
  }

  private readLocal(userId: number): StoryEditorLayoutMode {
    try {
      return parseStoryEditorLayoutMode(this.storage?.getItem(`${LOCAL_KEY}${userId}`)) ?? 'auto';
    } catch {
      return 'auto';
    }
  }

  private writeLocal(userId: number, mode: StoryEditorLayoutMode): void {
    try {
      this.storage?.setItem(`${LOCAL_KEY}${userId}`, mode);
    } catch {
      // A blocked browser storage must not prevent changing the current UI.
    }
  }
}
