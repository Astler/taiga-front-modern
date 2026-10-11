import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ShellProject } from '../project-context/mock-projects';
import { ShellProjectContext } from '../project-context/shell-project-context';
import { resolveShellRoute } from '../app-shell/shell-route-context';
import { Sidebar } from './sidebar';

const alpha: ShellProject = {
  id: 1,
  slug: 'alpha',
  code: 'AL',
  name: 'Alpha',
  description: '',
  accent: '#c9b6ff',
  isPinned: false,
  logoUrl: null,
};

const beta: ShellProject = { ...alpha, id: 2, slug: 'beta', name: 'Beta', code: 'BE' };

describe('Sidebar workspace context', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [
        provideRouter([]),
        {
          provide: ShellProjectContext,
          useValue: {
            selectedProject: signal(beta),
            projects: signal([alpha, beta]),
          },
        },
      ],
    }).compileComponents();
  });

  it('shows only account navigation on My dashboard', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.componentRef.setInput('location', resolveShellRoute('/dashboard'));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.active-project')).toBeNull();
    const links = [...host.querySelectorAll<HTMLAnchorElement>('nav .navigation-item')];
    expect(links.map((item) => item.textContent?.trim())).toEqual(['My dashboard', 'Projects']);
    expect(links.map((item) => item.getAttribute('href'))).toEqual(['/dashboard', '/projects']);
    expect(host.textContent).not.toContain('Kanban');
    expect(host.textContent).not.toContain('Settings');
  });

  it('keeps the global navigation without leaking the last project on /projects', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.componentRef.setInput('location', resolveShellRoute('/projects'));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.active-project')).toBeNull();
    expect(host.textContent).not.toContain('Active project');
    expect(host.querySelectorAll('nav .navigation-item')).toHaveLength(2);
  });

  it('restores only the route project navigation and correct project identity', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.componentRef.setInput('location', resolveShellRoute('/project/alpha/kanban'));
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.active-project')?.textContent).toContain('Alpha');
    expect(host.querySelector('.active-project')?.textContent).not.toContain('Beta');
    const links = [...host.querySelectorAll<HTMLAnchorElement>('nav .navigation-item')];
    expect(links.map((item) => item.textContent?.trim())).toEqual([
      'My dashboard', 'Projects', 'Overview', 'Kanban', 'Issues', 'Epics', 'Team', 'Settings',
    ]);
    const kanban = links.find((item) => item.textContent?.trim() === 'Kanban');
    expect(kanban?.getAttribute('href')).toBe('/project/alpha/kanban');
  });
});
