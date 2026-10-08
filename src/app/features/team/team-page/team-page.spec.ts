import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { ProjectStore } from '../../projects/data';
import { TeamPage } from './team-page';

describe('TeamPage', () => {
  it('stops loading when the account has no projects', async () => {
    await TestBed.configureTestingModule({
      imports: [TeamPage],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({})) } },
        { provide: AuthService, useValue: { user: signal({ id: 7 }) } },
        {
          provide: ProjectStore,
          useValue: {
            error: signal(null),
            loadMemberProjects: vi.fn(),
            projects: signal([]),
            projectsLoaded: signal(true),
            selectedProject: signal(null),
            selectBySlug: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(TeamPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('No projects yet');
    expect(fixture.nativeElement.textContent).not.toContain('Loading project');
  });
});
