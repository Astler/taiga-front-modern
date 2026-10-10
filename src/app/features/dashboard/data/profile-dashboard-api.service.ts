import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { ProfileDashboardPayload, ProfileWorkItem, ProfileWorkType } from './profile-dashboard.models';

const ALL_RESULTS_HEADERS = new HttpHeaders({ 'X-Disable-Pagination': '1' });

interface WorkItemResponse {
  readonly id: number;
  readonly ref?: number | null;
  readonly type?: string | null;
  readonly project?: number | null;
  readonly project_extra_info?: { readonly name?: string; readonly slug?: string } | null;
  readonly project_name?: string | null;
  readonly project_slug?: string | null;
  readonly slug?: string | null;
  readonly name?: string | null;
  readonly subject?: string | null;
  readonly status?: number | string | null;
  readonly status_color?: string | null;
  readonly status_extra_info?: {
    readonly name?: string;
    readonly color?: string;
    readonly is_closed?: boolean;
  } | null;
  readonly is_closed?: boolean;
  readonly is_blocked?: boolean;
  readonly assigned_to?: number | null;
  readonly assigned_users?: readonly number[] | null;
  readonly due_date?: string | null;
  readonly modified_date?: string | null;
  readonly created_date?: string | null;
  readonly user_story?: number | null;
}

interface SourceResult {
  readonly items: readonly WorkItemResponse[];
  readonly available: boolean;
}

const WORK_TYPES: readonly ProfileWorkType[] = ['userstory', 'task', 'issue', 'epic', 'project'];

@Injectable({ providedIn: 'root' })
export class ProfileDashboardApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  load(userId: number): Observable<ProfileDashboardPayload> {
    // No project param: these calls cover everything visible to the signed-in user.
    // Fetch both legacy and multiple-assignee user stories, deduplicating the overlap.
    return forkJoin({
      stories: this.list('userstories', 'assigned_to', userId),
      multiStories: this.list('userstories', 'assigned_users', userId),
      tasks: this.list('tasks', 'assigned_to', userId),
      issues: this.list('issues', 'assigned_to', userId),
      epics: this.list('epics', 'assigned_to', userId),
      watching: this.getList(`users/${userId}/watched`),
    }).pipe(
      map(({ stories, multiStories, tasks, issues, epics, watching }) => {
        const sources = [stories, multiStories, tasks, issues, epics, watching];
        if (!sources.some(({ available }) => available)) {
          throw new Error('All dashboard requests failed.');
        }

        const warnings: string[] = [];
        if (!stories.available || !multiStories.available) warnings.push('Some user stories could not be loaded.');
        if (!tasks.available) warnings.push('Tasks could not be loaded.');
        if (!issues.available) warnings.push('Issues could not be loaded.');
        if (!epics.available) warnings.push('Epics could not be loaded.');
        if (!watching.available) warnings.push('Watched items could not be loaded.');

        const assigned = deduplicate([
          ...normalizeAssigned('userstory', [...stories.items, ...multiStories.items], userId),
          ...normalizeAssigned('task', tasks.items, userId),
          ...normalizeAssigned('issue', issues.items, userId),
          ...normalizeAssigned('epic', epics.items, userId),
        ]).filter((item) => !item.isClosed);

        const watched = watching.items
          .filter((candidate) => WORK_TYPES.includes(candidate.type as ProfileWorkType))
          .map((candidate) => normalize(candidate, candidate.type as ProfileWorkType));

        return {
          assigned: byUpdatedDate(assigned),
          watching: byUpdatedDate(deduplicate(watched)),
          warnings,
        };
      }),
    );
  }

  private list(
    endpoint: string,
    assigneeParameter: 'assigned_to' | 'assigned_users',
    userId: number,
  ): Observable<SourceResult> {
    const params = new HttpParams()
      .set(assigneeParameter, userId)
      .set('status__is_closed', false);

    return this.getList(endpoint, params);
  }

  private getList(endpoint: string, params?: HttpParams): Observable<SourceResult> {
    return this.http.get<readonly WorkItemResponse[]>(this.config.resolveApiPath(endpoint), {
      headers: ALL_RESULTS_HEADERS,
      ...(params ? { params } : {}),
    }).pipe(
      map((items) => ({
        items: Array.isArray(items) ? items : [],
        available: Array.isArray(items),
      })),
      catchError(() => of({ items: [], available: false })),
    );
  }
}

function normalizeAssigned(
  type: ProfileWorkType,
  items: readonly WorkItemResponse[],
  userId: number,
): readonly ProfileWorkItem[] {
  return items
    // Filter once more client-side if an older Taiga instance ignores assigned_users.
    .filter((item) =>
      item.assigned_to === userId ||
      (type === 'userstory' && Array.isArray(item.assigned_users) && item.assigned_users.includes(userId)),
    )
    .map((item) => normalize(item, type));
}

function normalize(item: WorkItemResponse, type: ProfileWorkType): ProfileWorkItem {
  const isProject = type === 'project';
  const projectId = isProject ? item.id : item.project ?? null;
  return {
    id: item.id,
    ref: item.ref ?? null,
    type,
    projectId,
    projectSlug: isProject
      ? item.slug ?? item.project_slug ?? null
      : item.project_extra_info?.slug ?? item.project_slug ?? null,
    projectName: isProject
      ? item.name ?? null
      : item.project_extra_info?.name ?? item.project_name ?? null,
    title: item.subject || item.name || 'Untitled item',
    statusName: item.status_extra_info?.name ||
      (typeof item.status === 'string' ? item.status : null),
    statusColor: item.status_extra_info?.color ?? item.status_color ?? null,
    isClosed: item.is_closed === true || item.status_extra_info?.is_closed === true,
    isBlocked: item.is_blocked === true,
    dueDate: item.due_date ?? null,
    updatedAt: item.modified_date ?? item.created_date ?? null,
    parentStoryId: item.user_story ?? null,
  };
}

function deduplicate(items: readonly ProfileWorkItem[]): readonly ProfileWorkItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byUpdatedDate(items: readonly ProfileWorkItem[]): readonly ProfileWorkItem[] {
  return [...items].sort(
    (left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt),
  );
}

function dateValue(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
