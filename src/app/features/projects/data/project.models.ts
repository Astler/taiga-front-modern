import type { TaigaId, TaigaProjectSummary, TaigaUserSummary } from '../../../shared/models';

export interface TaigaProjectListItem extends TaigaProjectSummary {
  readonly user_order?: number;
  readonly total_activity?: number;
}

export interface TaigaProjectMember extends TaigaUserSummary {
  readonly role?: TaigaId | null;
  readonly role_name?: string | null;
}

export interface TaigaUserStoryStatus {
  readonly id: TaigaId;
  readonly name: string;
  readonly color: string;
  readonly order: number;
  readonly is_closed: boolean;
  readonly is_archived: boolean;
  readonly wip_limit: number | null;
  readonly is_default?: boolean;
  readonly slug?: string;
}

export type TaigaTagColors = Readonly<Record<string, string | null>>;

export interface TaigaProjectDetail extends TaigaProjectListItem {
  readonly members: readonly TaigaProjectMember[];
  readonly us_statuses: readonly TaigaUserStoryStatus[];
  readonly tags: readonly string[];
  readonly tags_colors: TaigaTagColors;
}

export type ProjectLocator =
  | TaigaId
  | string
  | Readonly<{
      id?: TaigaId;
      slug?: string;
    }>;

export type ProjectPin =
  Readonly<{ kind: 'id'; value: TaigaId }> | Readonly<{ kind: 'slug'; value: string }>;

export interface ProjectStoreError {
  readonly operation: 'list' | 'select';
  readonly cause: unknown;
}

export function isProjectDetail(
  project: TaigaProjectListItem | TaigaProjectDetail,
): project is TaigaProjectDetail {
  return (
    Array.isArray((project as Partial<TaigaProjectDetail>).members) &&
    Array.isArray((project as Partial<TaigaProjectDetail>).us_statuses) &&
    Array.isArray((project as Partial<TaigaProjectDetail>).tags) &&
    isTagColors((project as Partial<TaigaProjectDetail>).tags_colors)
  );
}

export function normalizeProjectDetail(
  project: TaigaProjectListItem & Partial<TaigaProjectDetail>,
  tagColors?: TaigaTagColors,
): TaigaProjectDetail {
  if (
    !Array.isArray(project.members) ||
    !Array.isArray(project.us_statuses) ||
    !Array.isArray(project.tags)
  ) {
    throw new Error(`Project detail response for "${project.slug}" is incomplete.`);
  }

  return {
    ...project,
    members: project.members,
    us_statuses: project.us_statuses,
    tags: project.tags,
    tags_colors: tagColors ?? (isTagColors(project.tags_colors) ? project.tags_colors : {}),
  };
}

export function isTagColors(value: unknown): value is TaigaTagColors {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((color) => color === null || typeof color === 'string')
  );
}
