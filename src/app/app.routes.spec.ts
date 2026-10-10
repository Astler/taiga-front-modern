import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { authRequiredGuard } from './core/auth';

describe('app routes', () => {
  it('checks authentication both when entering the shell and navigating between its children', () => {
    const shellRoute = routes.find((route) => route.path === '');

    expect(shellRoute?.canActivate).toContain(authRequiredGuard);
    expect(shellRoute?.canActivateChild).toContain(authRequiredGuard);
  });

  it('exposes the all-projects directory behind authentication', () => {
    const shell = routes.find((route) => route.path === '');
    const projects = shell?.children?.find((route) => route.path === 'projects');

    expect(shell?.canActivateChild).toContain(authRequiredGuard);
    expect(projects?.loadComponent).toBeDefined();
  });

  it('exposes both selected-project and deep-linked project workspaces', () => {
    const children = routes.find((route) => route.path === '')?.children ?? [];

    for (const section of ['epics', 'issues', 'kanban', 'settings', 'team']) {
      expect(children.some((route) => route.path === section)).toBe(true);
      expect(children.some((route) => route.path === `project/:projectSlug/${section}`)).toBe(true);
    }
  });
});
