import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatTooltip } from '@angular/material/tooltip';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaigaProjectDetail } from '../../projects/data';
import { TeamApiService, type TaigaMembership } from '../data';
import { TeamWorkspace } from './team-workspace';

describe('TeamWorkspace', () => {
  const listMemberships = vi.fn();

  beforeEach(async () => {
    listMemberships.mockReset().mockReturnValue(
      of([
        membership(1, { is_owner: true }),
        membership(2, {
          full_name: '',
          full_name_display: '',
          user: null,
          username: null,
          is_user_active: false,
          user_email: '',
          email: 'invited@example.test',
        }),
      ]),
    );

    await TestBed.configureTestingModule({
      imports: [TeamWorkspace],
      providers: [{ provide: TeamApiService, useValue: { listMemberships } }],
    }).compileComponents();
  });

  it('renders the live roster with role, access, and status in place', async () => {
    const fixture = TestBed.createComponent(TeamWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(listMemberships).toHaveBeenCalledWith(17);
    expect(host.querySelectorAll('.member-card')).toHaveLength(2);
    expect(host.querySelector('.identity')?.textContent).toContain('Ada Lovelace');
    expect(host.querySelector('.role-badge')?.textContent).toContain('Developer');
    expect(host.querySelector('.access-badge-owner')?.textContent).toContain('Owner');
    expect(host.querySelectorAll('.status-label')[1]?.textContent).toContain('Invitation pending');
    expect(host.querySelector('.identity a')).toBeNull();
    expect(host.querySelector('.header-actions')).toBeNull();
  });

  it('filters member cards without another API request', async () => {
    const fixture = TestBed.createComponent(TeamWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'invited@example.test';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(host.querySelectorAll('.member-card')).toHaveLength(1);
    expect(host.querySelector('.member-card')?.textContent).toContain('invited@example.test');
    expect(listMemberships).toHaveBeenCalledTimes(1);
  });

  it('describes member status through the presence tooltip', async () => {
    const fixture = TestBed.createComponent(TeamWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const tooltips = fixture.debugElement.queryAll(By.css('.presence'));
    expect(tooltips[0]?.injector.get(MatTooltip).message).toBe('Active');
    expect(tooltips[1]?.injector.get(MatTooltip).message).toBe('Invitation pending');
  });
});

function membership(id: number, changes: Partial<TaigaMembership> = {}): TaigaMembership {
  return {
    id,
    project: 17,
    role: 2,
    role_name: 'Developer',
    is_admin: false,
    is_owner: false,
    user: 7,
    username: 'ada',
    full_name: 'Ada Lovelace',
    full_name_display: 'Ada Lovelace',
    photo: null,
    gravatar_id: null,
    is_user_active: true,
    user_email: 'ada@example.test',
    email: null,
    ...changes,
  };
}

function project(): TaigaProjectDetail {
  return {
    id: 17,
    slug: 'alpha',
    name: 'Alpha',
    description: '',
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
}
