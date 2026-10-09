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
  readonly my_permissions?: readonly string[];
  readonly archived_code?: string | null;
  readonly blocked_code?: string | null;
  readonly tags?: readonly string[];
  readonly tags_colors?: Readonly<Record<string, string | null>>;
}

export interface KanbanAssignee {
  readonly id: TaigaId;
  readonly username: string;
  readonly full_name_display: string;
  readonly photo: string | null;
  readonly role?: TaigaId | null;
  readonly role_name?: string | null;
}

export type KanbanTag = readonly [name: string, color: string | null];

export interface KanbanTaskSummary {
  readonly id: TaigaId;
  readonly is_closed: boolean;
  readonly subject?: string;
  readonly ref?: number;
}

export interface KanbanEpicSummary {
  readonly id: TaigaId;
  readonly ref?: number;
  readonly subject?: string;
  readonly color?: string | null;
}

export interface KanbanAttachmentSummary {
  readonly id: TaigaId;
  readonly name: string;
  readonly url?: string;
  readonly thumbnail_card_url?: string | null;
  readonly size?: number;
  readonly created_date?: string;
}

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
  readonly owner?: TaigaId | null;
  readonly owner_extra_info?: KanbanAssignee | null;
  readonly tags: readonly KanbanTag[];
  readonly description?: string;
  readonly created_date?: string;
  readonly modified_date?: string;
  readonly total_points?: number | null;
  readonly due_date?: string | null;
  readonly due_date_reason?: string;
  readonly milestone?: TaigaId | null;
  readonly milestone_name?: string | null;
  readonly version?: number;
  readonly is_blocked?: boolean;
  readonly blocked_note?: string;
  readonly client_requirement?: boolean;
  readonly team_requirement?: boolean;
  readonly total_attachments?: number;
  readonly total_comments?: number;
  readonly watchers?: readonly TaigaId[];
  readonly tasks?: readonly KanbanTaskSummary[];
  readonly attachments?: readonly KanbanAttachmentSummary[];
  readonly epics?: readonly KanbanEpicSummary[];
}

export interface KanbanMoveCommand {
  readonly projectId: TaigaId;
  readonly storyId: TaigaId;
  readonly statusId: TaigaId;
  readonly swimlaneId: TaigaId | null;
  readonly destinationIndex: number;
  readonly beforeStoryId?: TaigaId;
  readonly afterStoryId?: TaigaId;
}

export interface KanbanMoveRequest {
  readonly projectId: TaigaId;
  readonly statusId: TaigaId;
  readonly swimlaneId: TaigaId | null;
  readonly storyIds: readonly TaigaId[];
  readonly beforeStoryId?: TaigaId;
  readonly afterStoryId?: TaigaId;
}

export interface KanbanOrderUpdate {
  readonly id: TaigaId;
  readonly status: TaigaId;
  readonly swimlane: TaigaId | null;
  readonly kanban_order: number;
}

export interface KanbanCreateRequest {
  readonly projectId: TaigaId;
  readonly statusId: TaigaId;
  readonly swimlaneId: TaigaId | null;
  readonly subjects: string;
}

export interface KanbanStoryUpdate {
  readonly subject: string;
  readonly description: string;
  readonly status: TaigaId;
  readonly assigned_users: readonly TaigaId[];
  readonly milestone: TaigaId | null;
  readonly due_date: string | null;
  readonly tags: readonly string[];
  readonly is_blocked: boolean;
  readonly blocked_note: string;
}

export interface KanbanStoryUpdateRequest {
  readonly projectId: TaigaId;
  readonly storyId: TaigaId;
  readonly version?: number;
  readonly changes: KanbanStoryUpdate;
}

export interface KanbanAttachmentUploadRequest {
  readonly projectId: TaigaId;
  readonly storyId: TaigaId;
  readonly file: File;
}

export interface KanbanMilestone {
  readonly id: TaigaId;
  readonly name: string;
  readonly closed: boolean;
  readonly estimated_start?: string | null;
  readonly estimated_finish?: string | null;
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

export type KanbanFilterCategory =
  'tags' | 'assigned_users' | 'role' | 'owner' | 'epic' | 'milestone' | 'focus';

export type KanbanFilterMode = 'include' | 'exclude';

export interface KanbanFilterClause {
  readonly category: KanbanFilterCategory;
  readonly value: string;
  readonly label: string;
  readonly mode: KanbanFilterMode;
  readonly color?: string | null;
}

export interface KanbanFilterOption {
  readonly value: string;
  readonly label: string;
  readonly color?: string | null | undefined;
  readonly count?: number | undefined;
}

export type KanbanSortMode = 'manual' | 'newest' | 'updated' | 'due' | 'points' | 'title';

export interface KanbanFilterPreset {
  readonly id: string;
  readonly name: string;
  readonly query: string;
  readonly sort: KanbanSortMode;
  readonly filters: readonly KanbanFilterClause[];
}

export interface KanbanFiltersDataOption {
  readonly id?: TaigaId | null;
  readonly name?: string;
  readonly full_name?: string;
  readonly color?: string | null;
  readonly count?: number;
  readonly ref?: number;
  readonly subject?: string;
}

export interface KanbanFiltersData {
  readonly tags?: readonly KanbanFiltersDataOption[];
  readonly assigned_users?: readonly KanbanFiltersDataOption[];
  readonly roles?: readonly KanbanFiltersDataOption[];
  readonly owners?: readonly KanbanFiltersDataOption[];
  readonly epics?: readonly KanbanFiltersDataOption[];
}

export interface KanbanLane {
  readonly id: TaigaId | null;
  readonly name: string | null;
}
