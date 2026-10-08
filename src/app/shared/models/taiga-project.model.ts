import type { TaigaId } from './taiga-common.model';
import type { TaigaUserSummary } from './taiga-user.model';

export interface TaigaProjectSummary {
  readonly id: TaigaId;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly is_private: boolean;
  readonly is_member: boolean;
  readonly is_admin: boolean;
  readonly is_owner: boolean;
  readonly logo_small_url: string | null;
  readonly owner?: TaigaUserSummary;
}
