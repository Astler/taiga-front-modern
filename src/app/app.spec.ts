import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { App } from './app';
import { routes } from './app.routes';
import { RuntimeConfigService } from './core';
import { AuthService } from './core/auth';
import { ProjectStore, type TaigaProjectDetail } from './features/projects/data';
import { DashboardOverviewApiService } from './shell/dashboard-placeholder/dashboard-overview-api.service';
import { ProfileDashboardApiService } from './features/dashboard/data/profile-dashboard-api.service';
import { TopbarNotificationsService } from './shell/topbar/topbar-notifications.service';

const project: TaigaProjectDetail = {
  id: 1,
  slug: 'puzzles-together',
  name: 'Puzzles Together',
  description: 'Build a calmer place to solve puzzles.',
  is_private: true,
  i_am_member: true,
  i_am_admin: true,
  i_am_owner: true,
  is_backlog_activated: true,
  is_kanban_activated: true,
  is_issues_activated: true,
  is_epics_activated: true,
  is_wiki_activated: true,
  my_permissions: [],
  blocked_code: null,
  archived_code: null,
  logo_small_url: null,
  members: [],
  us_statuses: [],
  tags: [],
  tags_colors: {},
};

describe('App', () => {
  let authStatus: ReturnType<typeof signal<string>>;
  let isAuthenticated: ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    authStatus = signal('authenticated');
    isAuthenticated = signal(true);

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: '/legacy/' }) },
        },
        {
          provide: AuthService,
          useValue: {
            status: authStatus,
            isAuthenticated,
            user: signal({ id: 7, username: 'vlady', full_name_display: 'Vlady', photo: null }),
            logout: () => undefined,
          },
        },
        {
          provide: ProjectStore,
          useValue: {
            projects: signal([project]),
            selectedProject: signal(project),
            pinnedProjects: signal([project]),
            unpinnedProjects: signal([]),
            loading: signal(false),
            projectsLoaded: signal(true),
            error: signal(null),
            isPinned: () => true,
            loadMemberProjects: () => Promise.resolve([project]),
            selectById: () => Promise.resolve(project),
            selectBySlug: () => Promise.resolve(project),
            togglePin: () => undefined,
          },
        },
        {
          provide: DashboardOverviewApiService,
          useValue: { load: () => of({ stories: [], milestones: [] }) },
        },
        {
          provide: ProfileDashboardApiService,
          useValue: { load: () => of({ assigned: [], watching: [], warnings: [] }) },
        },
        {
          provide: TopbarNotificationsService,
          useValue: {
            listUnread: () => of({ total: 0, objects: [] }),
            markAsRead: () => of(undefined),
            markAllAsRead: () => of(undefined),
          },
        },
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('preserves the personal account dashboard at /dashboard', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    fixture.detectChanges();
    await router.navigateByUrl('/dashboard');
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('pf-app-shell')).toBeTruthy();
    expect(compiled.querySelector('pf-dashboard-page')).toBeTruthy();
    expect(compiled.querySelector('pf-dashboard-placeholder')).toBeNull();
    expect(compiled.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(compiled.textContent).toContain('Personal workspace');
    expect(document.title).toBe('My dashboard · Taiga Modern');
  });

  it('restores the full live project overview at /project/:slug/dashboard', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    fixture.detectChanges();
    await router.navigateByUrl('/project/puzzles-together/dashboard');
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(router.url).toBe('/project/puzzles-together/dashboard');
    expect(compiled.querySelector('pf-dashboard-placeholder')).toBeTruthy();
    expect(compiled.querySelector('.metrics')).toBeTruthy();
    expect(compiled.querySelector('.focus-card')).toBeTruthy();
    expect(compiled.querySelector('.activity-card')).toBeTruthy();
    expect(compiled.textContent).toContain('Live data');
    expect(compiled.querySelector('a[aria-current="page"]')?.textContent).toContain('Overview');
    expect(document.title).toBe('Project overview · Taiga Modern');
  });

  it('opens a project dashboard from a bare project URL', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    fixture.detectChanges();
    await router.navigateByUrl('/project/puzzles-together');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/project/puzzles-together/dashboard');
    expect(fixture.nativeElement.querySelector('pf-dashboard-placeholder')).toBeTruthy();
  });

  it('leaves an active protected shell as soon as the session is invalidated', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    fixture.detectChanges();
    await router.navigateByUrl('/dashboard');
    await fixture.whenStable();

    authStatus.set('anonymous');
    isAuthenticated.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.url).toBe('/login');
    expect(fixture.nativeElement.querySelector('pf-app-shell')).toBeNull();
  });
});
