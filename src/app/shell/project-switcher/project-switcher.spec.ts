import { TestBed } from '@angular/core/testing';
import { MOCK_SHELL_PROJECTS, ShellProject } from '../project-context/mock-projects';
import { ProjectSwitcher } from './project-switcher';

describe('ProjectSwitcher', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ProjectSwitcher] }).compileComponents();
  });

  it('emits a project and lets the Material menu close after selection', async () => {
    const fixture = TestBed.createComponent(ProjectSwitcher);
    let emittedProject: ShellProject | undefined;

    fixture.componentRef.setInput('projects', MOCK_SHELL_PROJECTS);
    fixture.componentRef.setInput('selectedProject', MOCK_SHELL_PROJECTS[0]);
    fixture.componentInstance.projectSelected.subscribe((project) => {
      emittedProject = project;
      fixture.componentRef.setInput('selectedProject', project);
    });
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="project-switcher-trigger"]',
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-label')).toContain('Puzzles Together');
    trigger.click();
    await fixture.whenStable();

    const option = document.querySelector(
      '[data-testid="project-option-aurora"]',
    ) as HTMLButtonElement;
    expect(option).toBeTruthy();

    option.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(emittedProject).toEqual(MOCK_SHELL_PROJECTS[1]);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('exposes pin actions as keyboard-operable menu items', async () => {
    const fixture = TestBed.createComponent(ProjectSwitcher);
    let pinnedProject: ShellProject | undefined;

    fixture.componentRef.setInput('projects', MOCK_SHELL_PROJECTS);
    fixture.componentRef.setInput('selectedProject', MOCK_SHELL_PROJECTS[0]);
    fixture.componentInstance.pinToggled.subscribe((project) => {
      pinnedProject = project;
    });
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      '[data-testid="project-switcher-trigger"]',
    ) as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();

    const pinAction = document.querySelector(
      '[data-testid="pin-project-aurora"]',
    ) as HTMLButtonElement;
    expect(pinAction).toBeTruthy();
    expect(pinAction.getAttribute('role')).toBe('menuitem');

    pinAction.click();
    expect(pinnedProject).toEqual(MOCK_SHELL_PROJECTS[1]);
  });
});
