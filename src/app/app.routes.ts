import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
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
          import('./shell/dashboard-placeholder/dashboard-placeholder').then(
            ({ DashboardPlaceholder }) => DashboardPlaceholder,
          ),
        data: {
          description: 'The new board canvas and drag-and-drop workflow arrive in M2.',
          title: 'Kanban workspace',
        },
      },
      {
        path: 'issues',
        loadComponent: () =>
          import('./shell/dashboard-placeholder/dashboard-placeholder').then(
            ({ DashboardPlaceholder }) => DashboardPlaceholder,
          ),
        data: {
          description:
            'A clearer, denser issue workspace is being prepared for the next milestone.',
          title: 'Issues workspace',
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
