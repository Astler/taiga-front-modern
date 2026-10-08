import { HttpContext, HttpErrorResponse, HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, untracked } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import type { TaigaUser } from '../../shared/models';
import { RuntimeConfigService } from '../config';
import { SKIP_AUTHORIZATION, SKIP_AUTH_REFRESH } from '../http/auth-session.interceptor';
import { AuthRefreshCoordinator, StaleAuthSessionError } from './auth-refresh.coordinator';
import type { AuthLoginRequest, AuthLoginResponse, AuthTokenResponse } from './auth.models';
import { AuthSessionState } from './auth-session.state';
import { AuthTokenStorage } from './auth-token.storage';

const PUBLIC_AUTH_CONTEXT = new HttpContext()
  .set(SKIP_AUTHORIZATION, true)
  .set(SKIP_AUTH_REFRESH, true);

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly tokenStorage = inject(AuthTokenStorage);
  private readonly sessionState = inject(AuthSessionState);
  private readonly refreshCoordinator = inject(AuthRefreshCoordinator);

  readonly user = this.sessionState.user;
  readonly status = this.sessionState.status;
  readonly isAuthenticated = this.sessionState.isAuthenticated;

  constructor() {
    effect(() => {
      const externalRevision = this.tokenStorage.externalSyncRevision();
      if (externalRevision === 0) {
        return;
      }

      untracked(() => {
        this.restoreSession().subscribe({ error: () => undefined });
      });
    });
  }

  login(request: AuthLoginRequest): Observable<TaigaUser> {
    const loginRevision = this.sessionState.beginAuthentication();

    const body = { ...request, type: request.type ?? 'normal' };
    return this.http
      .post<AuthLoginResponse>(this.config.resolveApiPath('auth'), body, {
        context: PUBLIC_AUTH_CONTEXT,
      })
      .pipe(
        map((response) => {
          this.assertCurrentSessionRevision(loginRevision);
          this.tokenStorage.setFromResponse(response);
          return stripAuthTokens(response);
        }),
        tap((user) => {
          this.tokenStorage.setLegacyUser(user);
          this.sessionState.authenticate(user);
        }),
        catchError((error: unknown) => {
          if (this.tokenStorage.revision() === loginRevision) {
            this.logout();
          }
          return throwError(() => error);
        }),
      );
  }

  me(): Observable<TaigaUser> {
    const sessionRevision = this.tokenStorage.revision();
    return this.http.get<TaigaUser>(this.config.resolveApiPath('users/me')).pipe(
      tap((user) => {
        this.assertCurrentSessionRevision(sessionRevision);
        this.tokenStorage.setLegacyUser(user);
        this.sessionState.authenticate(user);
      }),
    );
  }

  refreshTokens(): Observable<AuthTokenResponse> {
    return this.refreshCoordinator.refresh();
  }

  restoreSession(): Observable<TaigaUser | null> {
    const restoreRevision = this.tokenStorage.revision();
    if (!this.sessionState.beginRestore()) {
      return of(null);
    }

    return this.me().pipe(
      catchError((error: unknown) => {
        if (this.tokenStorage.revision() !== restoreRevision) {
          return throwError(() => error);
        }
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
          this.sessionState.invalidate();
          return of(null);
        }
        this.sessionState.markRestoreError();
        return throwError(() => error);
      }),
    );
  }

  logout(): void {
    this.sessionState.invalidate();
  }

  private assertCurrentSessionRevision(revision: number): void {
    if (this.tokenStorage.revision() !== revision) {
      throw new StaleAuthSessionError();
    }
  }
}

function stripAuthTokens(response: AuthLoginResponse): TaigaUser {
  const { auth_token: _authToken, refresh: _refreshToken, ...user } = response;
  return user;
}
