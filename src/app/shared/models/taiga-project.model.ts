import type { TaigaId } from './taiga-common.model';
import type { TaigaUserSummary } from './taiga-user.model';

export interface TaigaProjectSummary {
  readonly id: TaigaId;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly is_private: boolean;
  readonly i_am_member: boolean;
  readonly i_am_admin: boolean;
  readonly i_am_owner: boolean;
  readonly is_backlog_activated: boolean;
  readonly is_kanban_activated: boolean;
  readonly is_issues_activated: boolean;
  readonly is_epics_activated: boolean;
  readonly is_wiki_activated: boolean;
  readonly my_permissions: readonly string[];
  readonly blocked_code: string | null;
  readonly archived_code: string | null;
  readonly logo_small_url: string | null;
  readonly owner?: TaigaUserSummary;
}
