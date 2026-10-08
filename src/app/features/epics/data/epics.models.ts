import type { TaigaId } from '../../../shared/models';

export type EpicTag = readonly [name: string, color: string | null];

export interface EpicStatusExtraInfo {
  readonly name: string;
  readonly color: string;
  readonly is_closed: boolean;
}

export interface EpicPersonExtraInfo {
  readonly id: TaigaId;
  readonly username: string;
  readonly full_name_display: string;
  readonly photo: string | null;
}

export interface EpicProjectExtraInfo {
  readonly name: string;
  readonly slug: string;
  readonly logo_small_url: string | null;
}

export interface EpicUserStoriesCounts {
  readonly total: number;
  readonly progress: number;
  readonly opened: number;
  readonly closed: number;
}

/** Stable `/api/v1/epics` list serializer response used by the workspace. */
export interface TaigaEpic {
  readonly id: TaigaId;
  readonly ref: number;
  readonly project: TaigaId;
  readonly project_extra_info: EpicProjectExtraInfo;
  readonly created_date: string;
  readonly modified_date: string;
  readonly subject: string;
  readonly color: string;
  readonly epics_order: number;
  readonly client_requirement: boolean;
  readonly team_requirement: boolean;
  readonly version: number;
  readonly watchers: readonly TaigaId[];
  readonly is_blocked: boolean;
  readonly blocked_note: string;
  readonly is_closed: boolean;
  readonly user_stories_counts: EpicUserStoriesCounts;
  readonly owner: TaigaId | null;
  readonly owner_extra_info: EpicPersonExtraInfo | null;
  readonly assigned_to: TaigaId | null;
  readonly assigned_to_extra_info: EpicPersonExtraInfo | null;
  readonly status: TaigaId | null;
  readonly status_extra_info: EpicStatusExtraInfo | null;
  readonly tags: readonly EpicTag[];
  readonly total_attachments: number;
  readonly total_voters: number;
  readonly is_voter: boolean;
  readonly is_watcher: boolean;
}

export type EpicFilterCategory = 'status' | 'assigned_to' | 'owner' | 'tags';
export type EpicFilterMode = 'include' | 'exclude';

export interface EpicFilterSelection {
  readonly value: string;
  readonly mode: EpicFilterMode;
}

export interface EpicFilterOption {
  readonly id?: TaigaId | null;
  readonly name?: string;
  readonly color?: string | null;
  readonly order?: number;
  readonly count?: number;
  readonly full_name?: string;
}

export interface EpicFiltersData {
  readonly statuses: readonly EpicFilterOption[];
  readonly assigned_to: readonly EpicFilterOption[];
  readonly owners: readonly EpicFilterOption[];
  readonly tags: readonly (EpicFilterOption & { readonly name: string })[];
}

export interface EpicListQuery {
  readonly q: string;
  readonly page: number;
  readonly filters: Readonly<Partial<Record<EpicFilterCategory, EpicFilterSelection>>>;
}

export interface EpicListPage {
  readonly items: readonly TaigaEpic[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export const EPIC_FILTER_CATEGORIES: readonly EpicFilterCategory[] = [
  'status',
  'assigned_to',
  'owner',
  'tags',
];

export const DEFAULT_EPIC_QUERY: EpicListQuery = {
  q: '',
  page: 1,
  filters: {},
};
