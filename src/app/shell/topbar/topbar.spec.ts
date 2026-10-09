import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../../core';
import { AuthService } from '../../core/auth';
import type { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { Topbar } from './topbar';

describe('Topbar', () => {
  it('renders one compact search prompt without duplicate visible labels', () => {
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
      ],
    });
    const fixture = TestBed.createComponent(Topbar);
    fixture.componentRef.setInput('navigationExpanded', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const search = host.querySelector<HTMLInputElement>('.global-search input')!;
    expect(search.placeholder).toBe('Search');
    expect(search.getAttribute('aria-label')).toBe('Search Taiga');
    expect(host.querySelector('.global-search')?.textContent?.trim()).toBe('');
    expect(host.querySelector('button[aria-label="Help"]')).toBeNull();
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
