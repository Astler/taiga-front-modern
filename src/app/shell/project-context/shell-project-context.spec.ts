import { TestBed } from '@angular/core/testing';
import { MOCK_SHELL_PROJECTS } from './mock-projects';
import { ShellProjectContext } from './shell-project-context';

describe('ShellProjectContext', () => {
  let context: ShellProjectContext;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ShellProjectContext] });
    context = TestBed.inject(ShellProjectContext);
  });

  it('starts with the first mock project selected', () => {
    expect(context.selectedProject()).toEqual(MOCK_SHELL_PROJECTS[0]);
  });

  it('selects an available project', () => {
    context.selectProject(MOCK_SHELL_PROJECTS[1]!);

    expect(context.selectedProject()).toEqual(MOCK_SHELL_PROJECTS[1]);
  });

  it('ignores projects outside the shell fixture', () => {
    context.selectProject({
      ...MOCK_SHELL_PROJECTS[0]!,
      id: 999,
      name: 'Unknown project',
    });

    expect(context.selectedProject()).toEqual(MOCK_SHELL_PROJECTS[0]);
  });
});
