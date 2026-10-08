import { HttpContextToken, HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthRefreshCoordinator } from '../auth/auth-refresh.coordinator';
import { AuthTokenStorage } from '../auth/auth-token.storage';
import { RuntimeConfigService } from '../config';
import { TAIGA_SESSION_ID } from './session-id.token';

export const SKIP_AUTHORIZATION = new HttpContextToken<boolean>(() => false);
export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false);
const AUTH_RETRY_ATTEMPTED = new HttpContextToken<boolean>(() => false);

export const authSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const config = inject(RuntimeConfigService);
  if (!config.isApiRequest(request.url)) {
    return next(request);
  }

  const tokenStorage = inject(AuthTokenStorage);
  const refreshCoordinator = inject(AuthRefreshCoordinator);
  const sessionId = inject(TAIGA_SESSION_ID);
  const sessionRevision = tokenStorage.revision();
  const accessToken = tokenStorage.accessToken();
  const setHeaders: Record<string, string> = {
    'Accept-Language': config.snapshot().defaultLanguage,
    'X-Session-Id': sessionId,
  };

  if (accessToken && !request.context.get(SKIP_AUTHORIZATION)) {
    setHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const apiRequest = request.clone({ setHeaders });

  return next(apiRequest).pipe(
    catchError((error: unknown) => {
      if (!shouldRefresh(error, apiRequest.url, config, tokenStorage, apiRequest.context)) {
        return throwError(() => error);
      }
      if (tokenStorage.revision() !== sessionRevision) {
        return throwError(() => error);
      }

      const currentAccessToken = tokenStorage.accessToken();
      if (currentAccessToken && currentAccessToken !== accessToken) {
        return next(
          apiRequest.clone({
            context: apiRequest.context.set(AUTH_RETRY_ATTEMPTED, true),
            setHeaders: { Authorization: `Bearer ${currentAccessToken}` },
          }),
        );
      }

      return refreshCoordinator.refresh().pipe(
        switchMap((tokens) =>
          next(
            apiRequest.clone({
              context: apiRequest.context.set(AUTH_RETRY_ATTEMPTED, true),
              setHeaders: { Authorization: `Bearer ${tokens.auth_token}` },
            }),
          ),
        ),
      );
    }),
  );
};

function shouldRefresh(
  error: unknown,
  url: string,
  config: RuntimeConfigService,
  tokenStorage: AuthTokenStorage,
  context: import('@angular/common/http').HttpContext,
): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 401 &&
    !context.get(SKIP_AUTH_REFRESH) &&
    !context.get(AUTH_RETRY_ATTEMPTED) &&
    !config.isApiEndpoint(url, 'auth') &&
    !config.isApiEndpoint(url, 'auth/refresh') &&
    Boolean(tokenStorage.refreshToken())
  );
}
