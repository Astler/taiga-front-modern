import type { TaigaId } from '../../../shared/models';

/** Stable Taiga `/memberships` list representation used by the classic client. */
export interface TaigaMembership {
  readonly id: TaigaId;
  readonly project: TaigaId;
  readonly role: TaigaId;
  readonly role_name: string;
  readonly is_admin: boolean;
  readonly is_owner: boolean;
  readonly user: TaigaId | null;
  readonly username: string | null;
  readonly full_name: string;
  readonly full_name_display: string;
  readonly photo: string | null;
  readonly gravatar_id: string | null;
  readonly is_user_active: boolean;
  readonly user_email: string;
  readonly email: string | null;
}

export type TeamStatusFilter = 'all' | 'active' | 'inactive' | 'pending';

export interface TeamQuery {
  readonly search: string;
  readonly role: TaigaId | null;
  readonly status: TeamStatusFilter;
}

export interface TeamRoleSummary {
  readonly id: TaigaId;
  readonly name: string;
  readonly count: number;
}

export const DEFAULT_TEAM_QUERY: TeamQuery = {
  search: '',
  role: null,
  status: 'all',
};
