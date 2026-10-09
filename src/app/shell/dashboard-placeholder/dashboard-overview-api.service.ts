import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { RuntimeConfigService } from '../../core/config';
import type { KanbanUserStory } from '../../features/kanban/data';
import type { TaigaId } from '../../shared/models';
import type { DashboardOverviewPayload, OverviewMilestone } from './dashboard-overview.models';

const UNPAGINATED_HEADERS = new HttpHeaders({ 'X-Disable-Pagination': '1' });

@Injectable({ providedIn: 'root' })
export class DashboardOverviewApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  load(projectId: TaigaId): Observable<DashboardOverviewPayload> {
    return forkJoin({
      stories: this.listStories(projectId),
      milestones: this.listOpenMilestones(projectId).pipe(catchError(() => of([]))),
    });
  }

  listStories(projectId: TaigaId): Observable<readonly KanbanUserStory[]> {
    const params = new HttpParams()
      .set('project', projectId)
      .set('status__is_archived', false)
      .set('include_attachments', 1)
      .set('include_tasks', 1);
    return this.http.get<readonly KanbanUserStory[]>(this.config.resolveApiPath('userstories'), {
      headers: UNPAGINATED_HEADERS,
      params,
    });
  }

  listOpenMilestones(projectId: TaigaId): Observable<readonly OverviewMilestone[]> {
    return this.http.get<readonly OverviewMilestone[]>(this.config.resolveApiPath('milestones'), {
      headers: UNPAGINATED_HEADERS,
      params: new HttpParams().set('project', projectId).set('closed', false),
    });
  }
}
