import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaProjectDetail } from '../../projects/data';
import { IssuesApiService, type IssueFiltersData, type IssueListPage } from '../data';
import { IssuesWorkspace } from './issues-workspace';

describe('IssuesWorkspace', () => {
  const list = vi.fn();
  const filters = vi.fn();

  beforeEach(async () => {
    list.mockReset().mockReturnValue(of(issuePage()));
    filters.mockReset().mockReturnValue(of(filtersData()));

    await TestBed.configureTestingModule({
      imports: [IssuesWorkspace],
      providers: [
        { provide: IssuesApiService, useValue: { list, filters } },
        {
          provide: RuntimeConfigService,
          useValue: { snapshot: () => ({ legacyUrl: 'https://legacy.example.test/' }) },
        },
      ],
    }).compileComponents();
  });

  it('renders a dense real issue row and opens the classic detail', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(list).toHaveBeenCalledWith(17, expect.objectContaining({ orderBy: '-modified_date' }));
    expect(filters).toHaveBeenCalledWith(17);
    expect(host.querySelector('.issue-main-cell')?.textContent).toContain('#38');
    expect(host.querySelector('.issue-main-cell')?.textContent).toContain('Fix sign-in crash');
    expect(host.querySelector('[data-label="Status"]')?.textContent).toContain('Open');
    expect(host.querySelector('[data-label="Type"]')?.textContent).toContain('Bug');
    expect(host.querySelector('.issue-tags')?.textContent).toContain('frontend');
    expect(host.querySelector('.assignee-name')?.textContent).toContain('Ada Lovelace');
    expect(host.querySelector<HTMLAnchorElement>('.issue-main-cell a')?.href).toBe(
      'https://legacy.example.test/project/alpha/issue/38',
    );
  });

  it('sends selected status and exclude mode to the server store', async () => {
    const fixture = TestBed.createComponent(IssuesWorkspace);
    fixture.componentRef.setInput('project', project());
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const status = host.querySelector<HTMLSelectElement>('select[aria-label="Status"]')!;
    status.value = '1';
    status.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const exclude = [...host.querySelectorAll<HTMLButtonElement>('.filter-mode button')].find(
      (button) => button.textContent?.trim() === 'Exclude',
    )!;
    exclude.click();
    fixture.detectChanges();

    expect(list).toHaveBeenLastCalledWith(
      17,
      expect.objectContaining({
        filters: { status: { value: '1', mode: 'exclude' } },
      }),
    );
    expect(exclude.getAttribute('aria-pressed')).toBe('true');
  });
});

function issuePage(): IssueListPage {
  return {
    items: [
      {
        id: 38,
        ref: 38,
        subject: 'Fix sign-in crash',
        project: 17,
        status: 1,
        status_extra_info: { id: 1, name: 'Open', color: '#8de7d0' },
        type: 2,
        type_extra_info: { id: 2, name: 'Bug', color: '#ffb4ab' },
        severity: 3,
        severity_extra_info: { id: 3, name: 'Important', color: '#ffca86' },
        priority: 4,
        priority_extra_info: { id: 4, name: 'High', color: '#c9b6ff' },
        assigned_to: 7,
        assigned_to_extra_info: {
          id: 7,
          username: 'ada',
          full_name_display: 'Ada Lovelace',
          photo: null,
        },
        tags: [['frontend', '#6750a4']],
        modified_date: '2026-10-08T10:00:00Z',
      },
    ],
    total: 38,
    page: 1,
    pageSize: 20,
    totalPages: 2,
  };
}

function filtersData(): IssueFiltersData {
  return {
    statuses: [{ id: 1, name: 'Open', color: '#8de7d0', count: 38 }],
    types: [{ id: 2, name: 'Bug', color: '#ffb4ab' }],
    severities: [{ id: 3, name: 'Important', color: '#ffca86' }],
    priorities: [{ id: 4, name: 'High', color: '#c9b6ff' }],
    tags: [{ name: 'frontend', color: '#6750a4' }],
    assigned_to: [{ id: 7, full_name: 'Ada Lovelace' }],
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
    i_am_admin: false,
    i_am_owner: false,
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
