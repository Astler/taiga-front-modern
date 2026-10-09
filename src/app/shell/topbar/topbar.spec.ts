import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../../core';
import { AuthService } from '../../core/auth';
import { CompactKanbanToolbarService } from '../../shared/compact-kanban-toolbar.service';
import type { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { TopbarNotification, TopbarNotificationsService } from './topbar-notifications.service';
import { Topbar } from './topbar';

describe('Topbar', () => {
  beforeEach(resetCompactMode);
  afterEach(resetCompactMode);

  it('renders one compact search prompt and the unread notification count', async () => {
    const listUnread = vi.fn(() => of({ total: 1, objects: [notification] }));
    TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn(), url: '/dashboard' } },
        {
          provide: ShellProjectContext,
          useValue: {
            projects: signal([project]),
            pinnedProjects: signal([project]),
            selectedProject: signal(project),
            selectProject: vi.fn(),
            togglePin: vi.fn(),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: '/legacy/' }) },
        },
        {
          provide: AuthService,
          useValue: {
            logout: vi.fn(),
            user: signal({ id: 7, username: 'vlady', full_name_display: 'Vlady' }),
          },
        },
        {
          provide: TopbarNotificationsService,
          useValue: notificationService({ listUnread }),
        },
      ],
    });
    const fixture = TestBed.createComponent(Topbar);
    fixture.componentRef.setInput('navigationExpanded', true);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('.global-search input')!;
    expect(search.placeholder).toBe('Search');
    expect(search.getAttribute('aria-label')).toBe('Search Taiga');
    expect(host.querySelector('.global-search')?.textContent?.trim()).toBe('');
    expect(host.querySelector('button[aria-label="Help"]')).toBeNull();
    expect(listUnread).toHaveBeenCalledOnce();
    expect(host.querySelector('.notification-count')?.textContent?.trim()).toBe('1');
    expect(host.querySelector('.notification-button')?.getAttribute('aria-label')).toContain(
      '1 unread',
    );

    const densityButton = host.querySelector<HTMLButtonElement>('.density-button')!;
    expect(densityButton.getAttribute('aria-pressed')).toBe('false');
    densityButton.click();
    fixture.detectChanges();
    expect(densityButton.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.getAttribute('data-ui-density')).toBe('compact');

    host.querySelector<HTMLButtonElement>('.notification-button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.querySelector('.notifications-overlay-pane .notifications-panel')).toBeTruthy();
  });

  it.each([
    ['/project/alpha/issues', 'issues'],
    ['/issues?status=1', 'issues'],
    ['/project/alpha/kanban#ready', 'kanban'],
    ['/kanban', 'kanban'],
    ['/project/alpha/epics', 'epics'],
    ['/team', 'team'],
    ['/project/alpha/settings?tab=modules', 'settings'],
  ] as const)('keeps the %s workspace when switching projects', (url, section) => {
    const navigate = vi.fn();
    const selectProject = vi.fn();
    TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        { provide: Router, useValue: { navigate, url } },
        { provide: ShellProjectContext, useValue: { selectProject } },
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: '/legacy/' }) },
        },
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: TopbarNotificationsService, useValue: notificationService() },
      ],
    });
    const fixture = TestBed.createComponent(Topbar);

    (
      fixture.componentInstance as unknown as { selectProject(project: ShellProject): void }
    ).selectProject(project);

    expect(selectProject).toHaveBeenCalledWith(project);
    expect(navigate).toHaveBeenCalledWith(['/project', 'beta', section]);
  });

  it('moves the live board controls into the topbar in compact mode', () => {
    globalThis.localStorage?.setItem('taiga-modern:compact-mode', 'true');
    const query = signal('');
    const selectSort = vi.fn();
    const toggleFilters = vi.fn();
    const applyAllWork = vi.fn();
    const applyMyWork = vi.fn();
    TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        { provide: Router, useValue: { navigate: vi.fn(), url: '/project/beta/kanban' } },
        {
          provide: ShellProjectContext,
          useValue: {
            projects: signal([project]),
            pinnedProjects: signal([project]),
            selectedProject: signal(project),
            selectProject: vi.fn(),
            togglePin: vi.fn(),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: '/legacy/' }) },
        },
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: TopbarNotificationsService, useValue: notificationService() },
      ],
    });
    const toolbarService = TestBed.inject(CompactKanbanToolbarService);
    const disconnect = toolbarService.connect({
      activeFilterCount: signal(2),
      activePresetId: signal('builtin:mine'),
      filterPanelOpen: signal(false),
      hasActiveFilters: signal(true),
      hasMyWork: signal(true),
      matchingCount: signal(3),
      openCount: signal(6),
      query,
      sortLabel: signal('Manual board order'),
      sortMode: signal('manual'),
      sortOptions: [{ value: 'manual', label: 'Manual board order' }],
      totalCount: signal(9),
      applyAllWork,
      applyMyWork,
      selectSort,
      setQuery: (value) => query.set(value),
      toggleFilters,
    });
    const fixture = TestBed.createComponent(Topbar);
    fixture.componentRef.setInput('navigationExpanded', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('.compact-board-search input')!;
    expect(search).toBeTruthy();
    expect(host.querySelector('.compact-board-count')?.textContent).toContain('6 open · 9 total');
    expect(host.querySelector('.compact-board-count')?.textContent).toContain('3 shown');
    expect(host.querySelector('.global-search')).toBeTruthy();

    search.value = 'release';
    search.dispatchEvent(new Event('input'));
    expect(query()).toBe('release');
    host.querySelectorAll<HTMLButtonElement>('.compact-board-control')[1]!.click();
    expect(toggleFilters).toHaveBeenCalledOnce();
    host.querySelector<HTMLButtonElement>('.compact-board-shortcuts button')!.click();
    expect(applyAllWork).toHaveBeenCalledOnce();

    fixture.destroy();
    disconnect();
  });

  it('opens a notification item and its project through separate routes', () => {
    const navigate = vi.fn();
    const selectProject = vi.fn();
    const markAsRead = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [
        { provide: Router, useValue: { navigate, url: '/dashboard' } },
        {
          provide: ShellProjectContext,
          useValue: {
            projects: signal([project]),
            pinnedProjects: signal([]),
            selectedProject: signal(project),
            selectProject,
            togglePin: vi.fn(),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: '/legacy/' }) },
        },
        { provide: AuthService, useValue: { user: signal(null) } },
        {
          provide: TopbarNotificationsService,
          useValue: notificationService({ markAsRead }),
        },
      ],
    });
    const fixture = TestBed.createComponent(Topbar);
    const component = fixture.componentInstance as unknown as {
      openNotification(value: TopbarNotification): void;
      openNotificationProject(value: TopbarNotification): void;
    };

    component.openNotification(notification);
    expect(markAsRead).toHaveBeenCalledWith(notification.id);
    expect(selectProject).toHaveBeenCalledWith(project);
    expect(navigate).toHaveBeenLastCalledWith(['/project', 'beta', 'kanban'], {
      queryParams: { story: 91 },
    });

    navigate.mockClear();
    component.openNotificationProject(notification);
    expect(navigate).toHaveBeenCalledWith(['/project', 'beta', 'kanban']);
  });
});

const project: ShellProject = {
  accent: '#6750a4',
  code: 'BE',
  description: '',
  id: 2,
  isPinned: false,
  logoUrl: null,
  name: 'Beta',
  slug: 'beta',
};

const notification: TopbarNotification = {
  id: 12,
  event_type: 5,
  read: false,
  created: '2026-10-09T10:00:00Z',
  data: {
    user: { id: 7, name: 'Mulka', username: 'mulka' },
    project: { id: 2, name: 'Beta', slug: 'beta' },
    obj: { id: 91, ref: 291, subject: 'Test story', content_type: 'userstory' },
  },
};

function notificationService(overrides: Record<string, unknown> = {}): object {
  return {
    listUnread: () => of({ total: 0, objects: [] }),
    markAsRead: () => of(undefined),
    markAllAsRead: () => of(undefined),
    ...overrides,
  };
}

function resetCompactMode(): void {
  document.documentElement.removeAttribute('data-ui-density');
  try {
    globalThis.localStorage?.removeItem('taiga-modern:compact-mode');
  } catch {
    // jsdom storage can be unavailable under a sandboxed origin.
  }
}
