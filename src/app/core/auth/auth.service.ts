import { HttpContext, HttpErrorResponse, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import type { TaigaUser } from '../../shared/models';
import { RuntimeConfigService } from '../config';
import { SKIP_AUTHORIZATION, SKIP_AUTH_REFRESH } from '../http/auth-session.interceptor';
import { AuthRefreshCoordinator, StaleAuthSessionError } from './auth-refresh.coordinator';
import type {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthStatus,
  AuthTokenResponse,
} from './auth.models';
import { AuthTokenStorage } from './auth-token.storage';

const PUBLIC_AUTH_CONTEXT = new HttpContext()
  .set(SKIP_AUTHORIZATION, true)
  .set(SKIP_AUTH_REFRESH, true);

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly tokenStorage = inject(AuthTokenStorage);
  private readonly refreshCoordinator = inject(AuthRefreshCoordinator);
  private readonly userState = signal<TaigaUser | null>(null);
  private readonly statusState = signal<AuthStatus>(
    this.tokenStorage.hasSession() ? 'restoring' : 'anonymous',
  );

  readonly user = this.userState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly isAuthenticated = computed(() => Boolean(this.tokenStorage.accessToken()));

  login(request: AuthLoginRequest): Observable<TaigaUser> {
    this.tokenStorage.clear();
    const loginRevision = this.tokenStorage.revision();
    this.userState.set(null);
    this.statusState.set('authenticating');

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
          this.userState.set(user);
          this.tokenStorage.setLegacyUser(user);
          this.statusState.set('authenticated');
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
        this.userState.set(user);
        this.tokenStorage.setLegacyUser(user);
        this.statusState.set('authenticated');
      }),
    );
  }

  refreshTokens(): Observable<AuthTokenResponse> {
    return this.refreshCoordinator.refresh();
  }

  restoreSession(): Observable<TaigaUser | null> {
    if (!this.tokenStorage.hasSession()) {
      this.logout();
      return of(null);
    }

    this.statusState.set('restoring');
    return this.me().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.logout();
          return of(null);
        }
        this.statusState.set('restore-error');
        return throwError(() => error);
      }),
    );
  }

  logout(): void {
    this.tokenStorage.clear();
    this.userState.set(null);
    this.statusState.set('anonymous');
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
