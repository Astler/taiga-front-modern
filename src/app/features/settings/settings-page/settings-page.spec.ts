import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth';
import { ProjectStore } from '../../projects/data';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  it('shows an error for an unavailable deep-linked project', async () => {
    const selectBySlug = vi.fn().mockRejectedValue(new Error('Not found'));
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ projectSlug: 'missing' })) },
        },
        { provide: AuthService, useValue: { user: signal({ id: 7 }) } },
        {
          provide: ProjectStore,
          useValue: {
            error: signal(null),
            loadMemberProjects: vi.fn(),
            projects: signal([]),
            projectsLoaded: signal(true),
            selectedProject: signal(null),
            selectBySlug,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selectBySlug).toHaveBeenCalledWith('missing');
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Project unavailable');
  });
});
