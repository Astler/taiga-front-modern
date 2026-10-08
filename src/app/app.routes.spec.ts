import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { authRequiredGuard } from './core/auth';

describe('app routes', () => {
  it('checks authentication both when entering the shell and navigating between its children', () => {
    const shellRoute = routes.find((route) => route.path === '');

    expect(shellRoute?.canActivate).toContain(authRequiredGuard);
    expect(shellRoute?.canActivateChild).toContain(authRequiredGuard);
  });
});
