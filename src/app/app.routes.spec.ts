import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { authRequiredGuard } from './core/auth';

describe('app routes', () => {
  it('checks authentication both when entering the shell and navigating between its children', () => {
    const shellRoute = routes.find((route) => route.path === '');

    expect(shellRoute?.canActivate).toContain(authRequiredGuard);
    expect(shellRoute?.canActivateChild).toContain(authRequiredGuard);
  });

  it('exposes both selected-project and deep-linked issue workspaces', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];

    expect(children.some((route) => route.path === 'issues')).toBe(true);
    expect(children.some((route) => route.path === 'project/:projectSlug/issues')).toBe(true);
  });
});
