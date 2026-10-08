import { toObservable } from '@angular/core/rxjs-interop';
import { inject } from '@angular/core';
import {
  type ActivatedRouteSnapshot,
  type CanActivateFn,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { filter, map, take, type Observable } from 'rxjs';
import { AuthService } from './auth.service';

const DEFAULT_AUTHENTICATED_ROUTE = '/dashboard';

export const authRequiredGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return afterSessionRestore(auth, () =>
    auth.isAuthenticated()
      ? true
      : router.createUrlTree(['/login'], {
          queryParams: { next: normalizeAuthRedirect(state.url) },
        }),
  );
};

export const anonymousOnlyGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return afterSessionRestore(auth, () =>
    auth.isAuthenticated()
      ? router.parseUrl(normalizeAuthRedirect(route.queryParamMap.get('next')))
      : true,
  );
};

export function normalizeAuthRedirect(candidate: string | null | undefined): string {
  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }

  try {
    const base = new URL('https://taiga.invalid');
    const destination = new URL(candidate, base);
    if (destination.origin !== base.origin || destination.pathname === '/login') {
      return DEFAULT_AUTHENTICATED_ROUTE;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
}

function afterSessionRestore(
  auth: AuthService,
  decide: () => boolean | UrlTree,
): boolean | UrlTree | Observable<boolean | UrlTree> {
  if (auth.status() !== 'restoring') {
    return decide();
  }

  return toObservable(auth.status).pipe(
    filter((status) => status !== 'restoring'),
    take(1),
    map(() => decide()),
  );
}
