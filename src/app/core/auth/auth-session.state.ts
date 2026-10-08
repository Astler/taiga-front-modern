import { Injectable, computed, inject, signal } from '@angular/core';
import type { TaigaUser } from '../../shared/models';
import type { AuthStatus } from './auth.models';
import { AuthTokenStorage } from './auth-token.storage';

@Injectable({ providedIn: 'root' })
export class AuthSessionState {
  private readonly tokenStorage = inject(AuthTokenStorage);
  private readonly userState = signal<TaigaUser | null>(null);
  private readonly identityRevisionState = signal(this.tokenStorage.revision());
  private readonly statusState = signal<AuthStatus>(
    this.tokenStorage.hasSession() ? 'restoring' : 'anonymous',
  );

  readonly status = computed<AuthStatus>(() => {
    if (this.identityRevisionState() !== this.tokenStorage.revision()) {
      return this.tokenStorage.hasSession() ? 'restoring' : 'anonymous';
    }
    const status = this.statusState();
    if (status === 'authenticating') {
      return status;
    }
    return this.tokenStorage.hasSession() ? status : 'anonymous';
  });
  readonly user = computed(() => (this.status() === 'authenticated' ? this.userState() : null));
  readonly isAuthenticated = computed(
    () =>
      this.status() === 'authenticated' &&
      this.user() !== null &&
      Boolean(this.tokenStorage.accessToken()),
  );

  beginAuthentication(): number {
    this.tokenStorage.clear();
    this.bindCurrentRevision();
    this.userState.set(null);
    this.statusState.set('authenticating');
    return this.tokenStorage.revision();
  }

  beginRestore(): boolean {
    this.bindCurrentRevision();
    if (!this.tokenStorage.hasSession()) {
      this.invalidate();
      return false;
    }

    this.userState.set(null);
    this.statusState.set('restoring');
    return true;
  }

  authenticate(user: TaigaUser): void {
    this.bindCurrentRevision();
    this.userState.set(user);
    this.statusState.set('authenticated');
  }

  markRestoreError(): void {
    this.userState.set(null);
    this.statusState.set('restore-error');
  }

  invalidate(): void {
    if (
      this.tokenStorage.hasSession() ||
      this.userState() !== null ||
      this.statusState() !== 'anonymous'
    ) {
      this.tokenStorage.clear();
    }
    this.bindCurrentRevision();
    this.userState.set(null);
    this.statusState.set('anonymous');
  }

  private bindCurrentRevision(): void {
    this.identityRevisionState.set(this.tokenStorage.revision());
  }
}
