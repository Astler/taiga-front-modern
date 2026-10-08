import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthStatus } from './auth.models';
import { AuthService } from './auth.service';
import { anonymousOnlyGuard, authRequiredGuard, normalizeAuthRedirect } from './auth.guard';

describe('auth route guards', () => {
  const status = signal<AuthStatus>('anonymous');
  const isAuthenticated = signal(false);

  beforeEach(() => {
    status.set('anonymous');
    isAuthenticated.set(false);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { status, isAuthenticated },
        },
      ],
    });
  });

  it('sends anonymous users to login and preserves their destination', () => {
    const result = TestBed.runInInjectionContext(() =>
      authRequiredGuard(routeSnapshot(), { url: '/issues?tag=dev' } as RouterStateSnapshot),
    ) as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?next=%2Fissues%3Ftag%3Ddev');
  });

  it('keeps authenticated users out of the login screen', () => {
    status.set('authenticated');
    isAuthenticated.set(true);
    const result = TestBed.runInInjectionContext(() =>
      anonymousOnlyGuard(routeSnapshot('/kanban'), { url: '/login' } as RouterStateSnapshot),
    ) as UrlTree;

    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/kanban');
  });

  it('allows login and blocks protected routes after session restore fails', () => {
    status.set('restore-error');

    const loginResult = TestBed.runInInjectionContext(() =>
      anonymousOnlyGuard(routeSnapshot(), { url: '/login' } as RouterStateSnapshot),
    );
    const protectedResult = TestBed.runInInjectionContext(() =>
      authRequiredGuard(routeSnapshot(), { url: '/issues' } as RouterStateSnapshot),
    ) as UrlTree;

    expect(loginResult).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(protectedResult)).toBe('/login?next=%2Fissues');
  });

  it('rejects external and self-referencing return locations', () => {
    expect(normalizeAuthRedirect('https://example.com/steal')).toBe('/dashboard');
    expect(normalizeAuthRedirect('//example.com/steal')).toBe('/dashboard');
    expect(normalizeAuthRedirect('/login')).toBe('/dashboard');
    expect(normalizeAuthRedirect('/kanban?zoom=2#story-8')).toBe('/kanban?zoom=2#story-8');
  });
});

function routeSnapshot(next?: string): ActivatedRouteSnapshot {
  return {
    queryParamMap: convertToParamMap(next ? { next } : {}),
  } as ActivatedRouteSnapshot;
}
