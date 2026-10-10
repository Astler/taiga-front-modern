export type ProfileWorkType = 'userstory' | 'task' | 'issue' | 'epic' | 'project';

export interface ProfileWorkItem {
  readonly id: number;
  readonly ref: number | null;
  readonly type: ProfileWorkType;
  readonly projectId: number | null;
  readonly projectSlug: string | null;
  readonly projectName: string | null;
  readonly title: string;
  readonly statusName: string | null;
  readonly statusColor: string | null;
  readonly isClosed: boolean;
  readonly isBlocked: boolean;
  readonly dueDate: string | null;
  readonly updatedAt: string | null;
  readonly parentStoryId: number | null;
}

export interface ProfileDashboardPayload {
  readonly assigned: readonly ProfileWorkItem[];
  readonly watching: readonly ProfileWorkItem[];
  readonly warnings: readonly string[];
}

export type ProfileDashboardStatus = 'idle' | 'loading' | 'loaded' | 'error';
