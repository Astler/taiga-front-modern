import { HttpBackend, HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, finalize, map, shareReplay, throwError } from 'rxjs';
import { RuntimeConfigService } from '../config';
import { TAIGA_SESSION_ID } from '../http/session-id.token';
import type { AuthRefreshRequest, AuthTokenResponse } from './auth.models';
import { AuthTokenStorage } from './auth-token.storage';

@Injectable({ providedIn: 'root' })
export class AuthRefreshCoordinator {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly config = inject(RuntimeConfigService);
  private readonly tokenStorage = inject(AuthTokenStorage);
  private readonly sessionId = inject(TAIGA_SESSION_ID);
  private readonly inFlightBySession = new Map<string, Observable<AuthTokenResponse>>();

  refresh(): Observable<AuthTokenResponse> {
    const refreshToken = this.tokenStorage.refreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('Cannot refresh a session without a refresh token.'));
    }
    const sessionRevision = this.tokenStorage.revision();
    const sessionKey = `${sessionRevision}:${refreshToken}`;
    const existingRequest = this.inFlightBySession.get(sessionKey);
    if (existingRequest) {
      return existingRequest;
    }

    const body: AuthRefreshRequest = { refresh: refreshToken };
    const headers = new HttpHeaders({ 'X-Session-Id': this.sessionId });
    let request$!: Observable<AuthTokenResponse>;

    request$ = this.http
      .post<AuthTokenResponse>(this.config.resolveApiPath('auth/refresh'), body, { headers })
      .pipe(
        map((response) => {
          if (!this.isCurrentSession(refreshToken, sessionRevision)) {
            throw new StaleAuthSessionError();
          }
          this.tokenStorage.rotateTokens(response);
          return response;
        }),
        catchError((error: unknown) => {
          if (
            this.isCurrentSession(refreshToken, sessionRevision) &&
            isDefinitiveAuthRejection(error)
          ) {
            this.tokenStorage.clear();
          }
          return throwError(() => error);
        }),
        finalize(() => {
          if (this.inFlightBySession.get(sessionKey) === request$) {
            this.inFlightBySession.delete(sessionKey);
          }
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.inFlightBySession.set(sessionKey, request$);

    return request$;
  }

  private isCurrentSession(refreshToken: string, revision: number): boolean {
    return (
      this.tokenStorage.revision() === revision && this.tokenStorage.refreshToken() === refreshToken
    );
  }
}

function isDefinitiveAuthRejection(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
}

export class StaleAuthSessionError extends Error {
  constructor() {
    super('The authentication session changed while the request was in flight.');
    this.name = 'StaleAuthSessionError';
  }
}
