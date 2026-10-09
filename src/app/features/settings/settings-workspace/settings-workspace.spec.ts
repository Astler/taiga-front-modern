import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TaigaProjectDetail } from '../../projects/data';
import { SettingsWorkspace } from './settings-workspace';

describe('SettingsWorkspace', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsWorkspace],
    }).compileComponents();
  });

  it('renders a real project detail as a safe settings overview', () => {
    const fixture = TestBed.createComponent(SettingsWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('h1')?.textContent).toContain('Project settings');
    expect(host.querySelector('.project-profile')?.textContent).toContain('Delivery Platform');
    expect(host.querySelector('.description')?.textContent).toContain('Ships the customer portal');
    expect(host.querySelector('.privacy-badge')?.textContent).toContain('Private');
    expect(host.querySelector('.access-level')?.textContent).toContain('Project admin');
    expect(host.querySelector('.access-level')?.textContent).toContain('3 granted permissions');
    expect(host.querySelectorAll('.module-list li')).toHaveLength(5);
    expect(enabledModules(host)).toEqual(['Backlog', 'Kanban', 'Issues', 'Epics']);
    expect(statusNames(host)).toEqual(['Ready', 'In progress', 'Done']);
    expect(host.querySelector('.supporting-copy')?.textContent).toContain(
      '1 archived statuses are hidden',
    );
    expect(tagNames(host)).toEqual(['frontend', 'urgent']);
    expect(host.querySelector('.summary-count')?.textContent).toContain('4/5 on');
  });

  it('does not send settings mutations to another interface', () => {
    const fixture = TestBed.createComponent(SettingsWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('a')).toHaveLength(0);
  });

  it('makes non-admin projects explicitly read-only and exposes no admin destinations', () => {
    const fixture = TestBed.createComponent(SettingsWorkspace);
    fixture.componentRef.setInput('project', {
      ...project(),
      i_am_admin: false,
      i_am_owner: false,
      my_permissions: [],
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.access-badge')?.textContent).toContain('Read only');
    expect(host.querySelector('.notice')?.textContent).toContain(
      'Only project owners and admins can change project settings',
    );
    expect(host.querySelector('.access-level')?.textContent).toContain('Project member');
    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(host.querySelectorAll('a')).toHaveLength(0);
  });

  it('updates all summaries when the selected project changes', () => {
    const fixture = TestBed.createComponent(SettingsWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();

    fixture.componentRef.setInput('project', {
      ...project(),
      name: 'Operations',
      slug: 'operations',
      is_private: false,
      i_am_admin: false,
      i_am_owner: true,
      is_wiki_activated: true,
      tags: [],
      tags_colors: {},
      us_statuses: [],
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.project-profile')?.textContent).toContain('Operations');
    expect(host.querySelector('.privacy-badge')?.textContent).toContain('Public');
    expect(host.querySelector('.access-level')?.textContent).toContain('Project owner');
    expect(enabledModules(host)).toHaveLength(5);
    expect(host.querySelector('.workflow-card')?.textContent).toContain(
      'No active user story statuses',
    );
    expect(host.querySelector('.workflow-card')?.textContent).toContain(
      'No shared tags have been created',
    );
    expect(host.querySelector('.settings-header a')).toBeNull();
  });

  it('does not offer external mutation destinations for archived projects', () => {
    const fixture = TestBed.createComponent(SettingsWorkspace);
    fixture.componentRef.setInput('project', {
      ...project(),
      archived_code: 'archived',
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('a')).toHaveLength(0);
    expect(host.querySelector('.modules-card .text-link')).toBeNull();
    expect(host.querySelector('.workflow-card .text-link')).toBeNull();
    expect(host.querySelector('.notice-warning')?.textContent).toContain('archived');
  });
});

function enabledModules(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.module-list li')]
    .filter((item) => item.querySelector('.module-state')?.textContent?.includes('Enabled'))
    .map((item) => item.querySelector('strong')?.textContent?.trim() ?? '');
}

function statusNames(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.status-list li')].map(
    (item) => item.querySelector('span:nth-child(2)')?.textContent?.trim() ?? '',
  );
}

function tagNames(host: HTMLElement): string[] {
  return [...host.querySelectorAll('.tag-list span:not(.tag-overflow)')].map(
    (tag) => tag.textContent?.trim() ?? '',
  );
}

function project(): TaigaProjectDetail {
  return {
    id: 17,
    slug: 'delivery-platform',
    name: 'Delivery Platform',
    description: 'Ships the customer portal and mobile API.',
    is_private: true,
    i_am_member: true,
    i_am_admin: true,
    i_am_owner: false,
    is_backlog_activated: true,
    is_kanban_activated: true,
    is_issues_activated: true,
    is_epics_activated: true,
    is_wiki_activated: false,
    my_permissions: ['view_us', 'modify_us', 'add_issue'],
    blocked_code: null,
    archived_code: null,
    logo_small_url: null,
    owner: {
      id: 4,
      username: 'ada',
      full_name_display: 'Ada Lovelace',
      photo: null,
    },
    members: [
      {
        id: 4,
        username: 'ada',
        full_name_display: 'Ada Lovelace',
        photo: null,
        role: 1,
        role_name: 'Product owner',
      },
      {
        id: 8,
        username: 'grace',
        full_name_display: 'Grace Hopper',
        photo: null,
        role: 2,
        role_name: 'Developer',
      },
    ],
    us_statuses: [
      status(3, 'Done', '#2e7d32', 30, true),
      status(4, 'Legacy', '#777777', 40, true, true),
      status(1, 'Ready', '#6750a4', 10, false, false, 8),
      status(2, 'In progress', '#f6a04d', 20, false),
    ],
    tags: ['frontend', 'urgent'],
    tags_colors: { frontend: '#6750a4', urgent: '#b3261e' },
  };
}

function status(
  id: number,
  name: string,
  color: string,
  order: number,
  isClosed: boolean,
  isArchived = false,
  wipLimit: number | null = null,
) {
  return {
    id,
    name,
    color,
    order,
    is_closed: isClosed,
    is_archived: isArchived,
    wip_limit: wipLimit,
  };
}
