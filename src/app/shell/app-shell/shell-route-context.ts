export type ShellScope = 'account' | 'project';
export type AccountPage = 'dashboard' | 'projects';

export interface ShellRouteContext {
  readonly scope: ShellScope;
  readonly projectSlug: string | null;
  readonly accountPage: AccountPage;
}

const PROJECT_SECTIONS = /^(kanban|issues|epics|team|settings)$/;
const DEEP_PROJECT_ROUTE = /^\/project\/([^/]+)(?:\/(dashboard|kanban|issues|epics|team|settings))?$/;

export function resolveShellRoute(url: string): ShellRouteContext {
  const path = url.split(/[?#]/, 1)[0] ?? '';
  const deepLink = DEEP_PROJECT_ROUTE.exec(path);
  if (deepLink) {
    let slug = deepLink[1]!;
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // Use the URL segment unchanged if it cannot be decoded.
    }
    return { scope: 'project', projectSlug: slug, accountPage: 'dashboard' };
  }

  // Preserve the existing selected-project aliases, but not on account pages.
  if (PROJECT_SECTIONS.test(path.slice(1))) {
    return { scope: 'project', projectSlug: null, accountPage: 'dashboard' };
  }

  return {
    scope: 'account',
    projectSlug: null,
    accountPage: path === '/projects' ? 'projects' : 'dashboard',
  };
}
