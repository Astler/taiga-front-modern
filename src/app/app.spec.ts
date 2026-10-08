import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { RuntimeConfigService } from './core';
import { AuthService } from './core/auth';
import { ProjectStore, type TaigaProjectDetail } from './features/projects/data';

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
            togglePin: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('creates the app', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the shell and dashboard route', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    fixture.detectChanges();
    await router.navigateByUrl('/dashboard');
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('pf-app-shell')).toBeTruthy();
    expect(compiled.querySelector('h1')?.textContent).toContain('Good morning, Vlady');
    expect(compiled.textContent).toContain('Puzzles Together');
    expect(compiled.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(compiled.querySelector('a[aria-current="page"]')?.textContent).toContain('Overview');
    expect(document.title).toBe('Good morning, Vlady · Taiga Modern');
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
