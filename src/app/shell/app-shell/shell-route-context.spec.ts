import { describe, expect, it } from 'vitest';
import { resolveShellRoute } from './shell-route-context';

describe('resolveShellRoute', () => {
  it.each([
    ['/dashboard', 'dashboard'],
    ['/projects?sort=name', 'projects'],
    ['/', 'dashboard'],
    ['/unknown-path', 'dashboard'],
  ] as const)('resolves %s as a global account page', (url, page) => {
    expect(resolveShellRoute(url)).toEqual({
      scope: 'account',
      accountPage: page,
      projectSlug: null,
    });
  });

  it.each([
    ['/project/puzzles-together/kanban', 'puzzles-together'],
    ['/project/puzzles-together/dashboard', 'puzzles-together'],
    ['/project/puzzles-together', 'puzzles-together'],
    ['/project/a%20b/issues?q=hello', 'a b'],
    ['/project/aurora/epics#list', 'aurora'],
    ['/project/aurora/team', 'aurora'],
    ['/project/aurora/settings', 'aurora'],
  ] as const)('retains project scope for %s', (url, slug) => {
    expect(resolveShellRoute(url)).toMatchObject({ scope: 'project', projectSlug: slug });
  });

  it.each(['/kanban', '/issues', '/epics', '/team', '/settings'])(
    'preserves the project alias %s', (url) => {
      expect(resolveShellRoute(url)).toMatchObject({ scope: 'project', projectSlug: null });
    },
  );
});
