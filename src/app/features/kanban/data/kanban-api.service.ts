import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import type {
  KanbanCreateRequest,
  KanbanFiltersData,
  KanbanMoveRequest,
  KanbanOrderUpdate,
  KanbanSwimlane,
  KanbanUserStory,
} from './kanban.models';

export interface KanbanPayload {
  readonly swimlanes: readonly KanbanSwimlane[];
  readonly userStories: readonly KanbanUserStory[];
  readonly filtersData?: KanbanFiltersData;
}

const UNPAGINATED_HEADERS = new HttpHeaders({ 'X-Disable-Pagination': '1' });

@Injectable({ providedIn: 'root' })
export class KanbanApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  load(projectId: TaigaId): Observable<KanbanPayload> {
    return forkJoin({
      swimlanes: this.listSwimlanes(projectId),
      userStories: this.listUserStories(projectId),
      filtersData: this.filtersData(projectId),
    });
  }

  listUserStories(projectId: TaigaId): Observable<readonly KanbanUserStory[]> {
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

  listSwimlanes(projectId: TaigaId): Observable<readonly KanbanSwimlane[]> {
    return this.http.get<readonly KanbanSwimlane[]>(this.config.resolveApiPath('swimlanes'), {
      headers: UNPAGINATED_HEADERS,
      params: new HttpParams().set('project', projectId),
    });
  }

  filtersData(projectId: TaigaId): Observable<KanbanFiltersData> {
    return this.http.get<KanbanFiltersData>(
      this.config.resolveApiPath('userstories/filters_data'),
      {
        headers: UNPAGINATED_HEADERS,
        params: new HttpParams().set('project', projectId).set('status__is_archived', false),
      },
    );
  }

  getUserStory(storyId: TaigaId): Observable<KanbanUserStory> {
    return this.http.get<KanbanUserStory>(
      `${this.config.resolveApiPath('userstories')}/${storyId}`,
      {
        params: new HttpParams().set('include_attachments', 1).set('include_tasks', 1),
      },
    );
  }

  moveUserStories(request: KanbanMoveRequest): Observable<readonly KanbanOrderUpdate[]> {
    const body: Record<string, TaigaId | readonly TaigaId[]> = {
      project_id: request.projectId,
      status_id: request.statusId,
      bulk_userstories: request.storyIds,
    };
    if (request.swimlaneId !== null) {
      body['swimlane_id'] = request.swimlaneId;
    }
    if (request.afterStoryId !== undefined) {
      body['after_userstory_id'] = request.afterStoryId;
    } else if (request.beforeStoryId !== undefined) {
      body['before_userstory_id'] = request.beforeStoryId;
    }

    return this.http.post<readonly KanbanOrderUpdate[]>(
      this.config.resolveApiPath('userstories/bulk_update_kanban_order'),
      body,
    );
  }

  createUserStories(request: KanbanCreateRequest): Observable<readonly KanbanUserStory[]> {
    const body: Record<string, TaigaId | string> = {
      project_id: request.projectId,
      status_id: request.statusId,
      bulk_stories: request.subjects,
    };
    if (request.swimlaneId !== null) {
      body['swimlane_id'] = request.swimlaneId;
    }

    return this.http.post<readonly KanbanUserStory[]>(
      this.config.resolveApiPath('userstories/bulk_create'),
      body,
    );
  }
}
