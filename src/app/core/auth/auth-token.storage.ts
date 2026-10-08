import { DestroyRef, InjectionToken, Injectable, computed, inject, signal } from '@angular/core';
import type { AuthTokenResponse, AuthTokens } from './auth.models';

export const AUTH_STORAGE = new InjectionToken<Storage | null>('TAIGA_AUTH_STORAGE', {
  providedIn: 'root',
  factory: browserStorage,
});

export const AUTH_STORAGE_KEYS = Object.freeze({
  accessToken: 'token',
  refreshToken: 'refresh',
  user: 'userInfo',
});

@Injectable({ providedIn: 'root' })
export class AuthTokenStorage {
  private readonly storage = inject(AUTH_STORAGE);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tokensState = signal<AuthTokens>(this.readTokens());
  private readonly revisionState = signal(0);
  private readonly externalSyncRevisionState = signal(0);
  private storageSyncScheduled = false;

  readonly tokens = this.tokensState.asReadonly();
  readonly revision = this.revisionState.asReadonly();
  readonly externalSyncRevision = this.externalSyncRevisionState.asReadonly();
  readonly accessToken = computed(() => this.tokensState().accessToken);
  readonly refreshToken = computed(() => this.tokensState().refreshToken);
  readonly hasSession = computed(() =>
    Boolean(this.tokensState().accessToken || this.tokensState().refreshToken),
  );

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }
    const listener = (event: StorageEvent) => {
      if (
        event.key !== null &&
        event.key !== AUTH_STORAGE_KEYS.accessToken &&
        event.key !== AUTH_STORAGE_KEYS.refreshToken
      ) {
        return;
      }
      this.scheduleStorageSync();
    };
    window.addEventListener('storage', listener);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', listener));
  }

  setTokens(tokens: AuthTokens): void {
    this.storeTokens(tokens, true);
  }

  reconcilePersistedSession(): boolean {
    const persistedTokens = this.readPersistedTokens();
    if (persistedTokens === null || tokensEqual(persistedTokens, this.tokensState())) {
      return true;
    }

    this.tokensState.set(persistedTokens);
    this.revisionState.update((revision) => revision + 1);
    this.externalSyncRevisionState.update((revision) => revision + 1);
    return false;
  }

  rotateTokens(response: AuthTokenResponse): void {
    this.storeTokens(
      {
        accessToken: response.auth_token,
        refreshToken: response.refresh,
      },
      false,
    );
    this.updateLegacyUserTokens();
  }

  setLegacyUser(user: object): void {
    this.writeJson(AUTH_STORAGE_KEYS.user, {
      ...user,
      auth_token: this.accessToken(),
      refresh: this.refreshToken(),
    });
  }

  private storeTokens(tokens: AuthTokens, startsNewSession: boolean): void {
    const normalized = Object.freeze({
      accessToken: normalizeToken(tokens.accessToken),
      refreshToken: normalizeToken(tokens.refreshToken),
    });

    this.write(AUTH_STORAGE_KEYS.accessToken, normalized.accessToken);
    this.write(AUTH_STORAGE_KEYS.refreshToken, normalized.refreshToken);
    this.tokensState.set(normalized);
    if (startsNewSession) {
      this.revisionState.update((revision) => revision + 1);
    }
  }

  setFromResponse(response: AuthTokenResponse): void {
    this.setTokens({
      accessToken: response.auth_token,
      refreshToken: response.refresh,
    });
  }

  clear(): void {
    this.write(AUTH_STORAGE_KEYS.accessToken, null);
    this.write(AUTH_STORAGE_KEYS.refreshToken, null);
    this.writeJson(AUTH_STORAGE_KEYS.user, null);
    this.tokensState.set(Object.freeze({ accessToken: null, refreshToken: null }));
    this.revisionState.update((revision) => revision + 1);
  }

  private readTokens(): AuthTokens {
    return (
      this.readPersistedTokens() ??
      Object.freeze({
        accessToken: null,
        refreshToken: null,
      })
    );
  }

  private readPersistedTokens(): AuthTokens | null {
    if (!this.storage) {
      return null;
    }

    try {
      return Object.freeze({
        accessToken: readToken(this.storage, AUTH_STORAGE_KEYS.accessToken),
        refreshToken: readToken(this.storage, AUTH_STORAGE_KEYS.refreshToken),
      });
    } catch {
      return null;
    }
  }

  private write(key: string, value: string | null): void {
    try {
      if (value === null) {
        this.storage?.removeItem(key);
      } else {
        this.storage?.setItem(key, JSON.stringify(value));
      }
    } catch {
      // An unavailable browser storage must not break authentication state in memory.
    }
  }

  private updateLegacyUserTokens(): void {
    try {
      const serialized = this.storage?.getItem(AUTH_STORAGE_KEYS.user);
      if (!serialized) {
        return;
      }
      const user: unknown = JSON.parse(serialized);
      if (typeof user !== 'object' || user === null || Array.isArray(user)) {
        return;
      }
      this.writeJson(AUTH_STORAGE_KEYS.user, {
        ...user,
        auth_token: this.accessToken(),
        refresh: this.refreshToken(),
      });
    } catch {
      // A malformed legacy user entry should not break token rotation.
    }
  }

  private writeJson(key: string, value: Readonly<Record<string, unknown>> | null): void {
    try {
      if (value === null) {
        this.storage?.removeItem(key);
      } else {
        this.storage?.setItem(key, JSON.stringify(value));
      }
    } catch {
      // An unavailable browser storage must not break authentication state in memory.
    }
  }

  private scheduleStorageSync(): void {
    if (this.storageSyncScheduled) {
      return;
    }
    this.storageSyncScheduled = true;
    queueMicrotask(() => {
      this.storageSyncScheduled = false;
      this.reconcilePersistedSession();
    });
  }
}

function readToken(storage: Storage, key: string): string | null {
  const serialized = storage.getItem(key);
  if (serialized === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(serialized);
    return normalizeToken(typeof parsed === 'string' ? parsed : null);
  } catch {
    return normalizeToken(serialized);
  }
}

function tokensEqual(left: AuthTokens, right: AuthTokens): boolean {
  return left.accessToken === right.accessToken && left.refreshToken === right.refreshToken;
}

function normalizeToken(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function browserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
