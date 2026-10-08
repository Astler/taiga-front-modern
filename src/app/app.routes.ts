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
        path: 'dashboard',
        loadComponent: () =>
          import('./shell/dashboard-placeholder/dashboard-placeholder').then(
            ({ DashboardPlaceholder }) => DashboardPlaceholder,
          ),
        data: {
          description:
            'A focused view of what is moving, what needs attention, and what comes next.',
          title: 'Good morning, Vlady',
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
          import('./shell/dashboard-placeholder/dashboard-placeholder').then(
            ({ DashboardPlaceholder }) => DashboardPlaceholder,
          ),
        data: {
          description: 'Portfolio planning will reuse the same calm shell and navigation model.',
          title: 'Epics workspace',
        },
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./shell/dashboard-placeholder/dashboard-placeholder').then(
            ({ DashboardPlaceholder }) => DashboardPlaceholder,
          ),
        data: {
          description:
            'People, roles, and workload will live here without leaving the project context.',
          title: 'Project team',
        },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./shell/dashboard-placeholder/dashboard-placeholder').then(
            ({ DashboardPlaceholder }) => DashboardPlaceholder,
          ),
        data: {
          description: 'Project preferences and modules will be organized into focused sections.',
          title: 'Project settings',
        },
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
