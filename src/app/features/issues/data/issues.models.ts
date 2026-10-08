import type { TaigaId } from '../../../shared/models';

export type IssueTag = readonly [name: string, color: string | null];

export interface IssueStatusExtraInfo {
  readonly name: string;
  readonly color: string;
  readonly is_closed: boolean;
}

export interface IssueAssignee {
  readonly id: TaigaId;
  readonly username?: string;
  readonly full_name?: string;
  readonly full_name_display?: string;
  readonly photo?: string | null;
}

export interface TaigaIssue {
  readonly id: TaigaId;
  readonly ref: number;
  readonly subject: string;
  readonly project: TaigaId;
  readonly status: TaigaId;
  readonly status_extra_info: IssueStatusExtraInfo;
  readonly type: TaigaId;
  readonly severity: TaigaId;
  readonly priority: TaigaId;
  readonly assigned_to: TaigaId | null;
  readonly assigned_to_extra_info: IssueAssignee | null;
  readonly tags: readonly IssueTag[];
  readonly modified_date: string;
  readonly created_date?: string;
  readonly due_date?: string | null;
}

export type IssueFilterCategory =
  'status' | 'type' | 'severity' | 'priority' | 'tags' | 'assigned_to';

export type IssueFilterMode = 'include' | 'exclude';

export interface IssueFilterSelection {
  readonly value: string;
  readonly mode: IssueFilterMode;
}

export interface IssueFilterOption {
  readonly id?: TaigaId | null;
  readonly name?: string;
  readonly color?: string | null;
  readonly count?: number;
  readonly full_name?: string;
  readonly photo?: string | null;
}

export interface IssueFiltersData {
  readonly statuses: readonly IssueFilterOption[];
  readonly types: readonly IssueFilterOption[];
  readonly severities: readonly IssueFilterOption[];
  readonly priorities: readonly IssueFilterOption[];
  readonly tags: readonly (IssueFilterOption & { readonly name: string })[];
  readonly assigned_to: readonly IssueFilterOption[];
}

export interface IssueListQuery {
  readonly q: string;
  readonly orderBy: string;
  readonly page: number;
  readonly filters: Readonly<Partial<Record<IssueFilterCategory, IssueFilterSelection>>>;
}

export interface IssueListPage {
  readonly items: readonly TaigaIssue[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
}

export const ISSUE_FILTER_CATEGORIES: readonly IssueFilterCategory[] = [
  'status',
  'type',
  'severity',
  'priority',
  'tags',
  'assigned_to',
];

export const DEFAULT_ISSUE_QUERY: IssueListQuery = {
  q: '',
  orderBy: '-modified_date',
  page: 1,
  filters: {},
};
