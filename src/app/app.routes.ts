import { Routes } from '@angular/router';
import { anonymousOnlyGuard, authRequiredGuard } from './core/auth';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [anonymousOnlyGuard],
    loadComponent: () =>
      import('./features/auth/login-page/login-page').then(({ LoginPage }) => LoginPage),
    title: 'Sign in · Taiga Modern',
  },
  {
    path: '',
    canActivate: [authRequiredGuard],
    canActivateChild: [authRequiredGuard],
    loadComponent: () => import('./shell/app-shell/app-shell').then(({ AppShell }) => AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'projects',
        loadComponent: () =>
          import('./features/projects/projects-page/projects-page').then(
            ({ ProjectsPage }) => ProjectsPage,
          ),
        data: { title: 'Projects' },
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page/dashboard-page').then(
            ({ DashboardPage }) => DashboardPage,
          ),
        data: {
          title: 'My dashboard',
        },
      },
      {
        path: 'kanban',
        loadComponent: () =>
          import('./features/kanban/kanban-page/kanban-page').then(({ KanbanPage }) => KanbanPage),
        data: {
          title: 'Kanban',
        },
      },
      {
        path: 'project/:projectSlug/kanban',
        loadComponent: () =>
          import('./features/kanban/kanban-page/kanban-page').then(({ KanbanPage }) => KanbanPage),
        data: {
          title: 'Kanban',
        },
      },
      {
        path: 'issues',
        loadComponent: () =>
          import('./features/issues/issues-page/issues-page').then(({ IssuesPage }) => IssuesPage),
        data: {
          title: 'Issues',
        },
      },
      {
        path: 'project/:projectSlug/issues',
        loadComponent: () =>
          import('./features/issues/issues-page/issues-page').then(({ IssuesPage }) => IssuesPage),
        data: {
          title: 'Issues',
        },
      },
      {
        path: 'epics',
        loadComponent: () =>
          import('./features/epics/epics-page/epics-page').then(({ EpicsPage }) => EpicsPage),
        data: {
          title: 'Epics',
        },
      },
      {
        path: 'project/:projectSlug/epics',
        loadComponent: () =>
          import('./features/epics/epics-page/epics-page').then(({ EpicsPage }) => EpicsPage),
        data: {
          title: 'Epics',
        },
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./features/team/team-page/team-page').then(({ TeamPage }) => TeamPage),
        data: {
          title: 'Project team',
        },
      },
      {
        path: 'project/:projectSlug/team',
        loadComponent: () =>
          import('./features/team/team-page/team-page').then(({ TeamPage }) => TeamPage),
        data: {
          title: 'Project team',
        },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings-page/settings-page').then(
            ({ SettingsPage }) => SettingsPage,
          ),
        data: {
          title: 'Project settings',
        },
      },
      {
        path: 'project/:projectSlug/settings',
        loadComponent: () =>
          import('./features/settings/settings-page/settings-page').then(
            ({ SettingsPage }) => SettingsPage,
          ),
        data: {
          title: 'Project settings',
        },
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
