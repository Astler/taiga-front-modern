import type { TaigaId } from './taiga-common.model';

export interface TaigaUserSummary {
  readonly id: TaigaId;
  readonly username: string;
  readonly full_name_display: string;
  readonly photo: string | null;
  readonly big_photo?: string | null;
  readonly is_active?: boolean;
}

export interface TaigaUser extends TaigaUserSummary {
  readonly email?: string;
  readonly full_name?: string;
  readonly lang?: string;
  readonly theme?: string;
  readonly timezone?: string;
  readonly bio?: string;
  readonly color?: string;
  readonly date_joined?: string;
  readonly max_private_projects?: number | null;
  readonly max_public_projects?: number | null;
  readonly total_private_projects?: number;
  readonly total_public_projects?: number;
}
