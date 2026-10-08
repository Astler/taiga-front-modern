import type { TaigaId } from '../../../shared/models';

export interface KanbanStatus {
  readonly id: TaigaId;
  readonly name: string;
  readonly color: string;
  readonly order: number;
  readonly is_archived: boolean;
  readonly is_closed: boolean;
  readonly wip_limit?: number | null;
}

export interface KanbanProjectSnapshot {
  readonly id: TaigaId;
  readonly name: string;
  readonly slug: string;
  readonly us_statuses: readonly KanbanStatus[];
  readonly members?: readonly KanbanAssignee[];
}

export interface KanbanAssignee {
  readonly id: TaigaId;
  readonly username: string;
  readonly full_name_display: string;
  readonly photo: string | null;
}

export type KanbanTag = readonly [name: string, color: string | null];

export interface KanbanUserStory {
  readonly id: TaigaId;
  readonly ref: number;
  readonly subject: string;
  readonly project: TaigaId;
  readonly status: TaigaId;
  readonly swimlane: TaigaId | null;
  readonly kanban_order: number;
  readonly is_closed: boolean;
  readonly assigned_to: TaigaId | null;
  readonly assigned_users: readonly TaigaId[];
  readonly assigned_to_extra_info: KanbanAssignee | null;
  readonly tags: readonly KanbanTag[];
  readonly total_points?: number | null;
  readonly due_date?: string | null;
}

export interface KanbanSwimlaneStatus {
  readonly id: TaigaId;
  readonly swimlane_userstory_status_id: TaigaId;
  readonly wip_limit: number | null;
}

export interface KanbanSwimlane {
  readonly id: TaigaId;
  readonly name: string;
  readonly order: number;
  readonly project: TaigaId;
  readonly statuses?: readonly KanbanSwimlaneStatus[];
}

export interface KanbanFilters {
  readonly query?: string;
  readonly tag?: string;
  readonly assignee?: TaigaId;
}

export interface KanbanLane {
  readonly id: TaigaId | null;
  readonly name: string | null;
}
