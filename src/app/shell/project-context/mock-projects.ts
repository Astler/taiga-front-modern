export interface ShellProject {
  readonly accent: string;
  readonly code: string;
  readonly description: string;
  readonly id: number;
  readonly name: string;
  readonly slug: string;
}

/**
 * M1-only fixture data. Replace this export with projects returned by the
 * Taiga API when the data-access milestone lands.
 */
export const MOCK_SHELL_PROJECTS: readonly ShellProject[] = [
  {
    accent: '#b9f6ca',
    code: 'PT',
    description: 'Build a calmer, friendlier place to solve puzzles together.',
    id: 1,
    name: 'Puzzles Together',
    slug: 'puzzles-together',
  },
  {
    accent: '#d7b8ff',
    code: 'AR',
    description: 'A focused workspace for the next generation of the product.',
    id: 2,
    name: 'Aurora',
    slug: 'aurora',
  },
  {
    accent: '#ffb4ab',
    code: 'OP',
    description: 'Internal planning, release coordination, and operations.',
    id: 3,
    name: 'Orbit Platform',
    slug: 'orbit-platform',
  },
];
