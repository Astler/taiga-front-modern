import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../../core';
import { AuthService } from '../../core/auth';
import type { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { TopbarNotification, TopbarNotificationsService } from './topbar-notifications.service';
import { Topbar } from './topbar';

describe('Topbar', () => {
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
