import type { KanbanUserStory } from '../../features/kanban/data';
import type { TaigaId } from '../../shared/models';

export interface OverviewMilestone {
  readonly id: TaigaId;
  readonly name: string;
  readonly slug?: string;
  readonly estimated_start?: string | null;
  readonly estimated_finish?: string | null;
  readonly closed?: boolean;
}

export interface DashboardOverviewPayload {
  readonly stories: readonly KanbanUserStory[];
  readonly milestones: readonly OverviewMilestone[];
}

export type DashboardOverviewStatus = 'idle' | 'loading' | 'loaded' | 'error';
