import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import type {
  KanbanCreateRequest,
  KanbanAttachmentSummary,
  KanbanAttachmentUploadRequest,
  KanbanFiltersData,
  KanbanMilestone,
  KanbanMoveRequest,
  KanbanOrderUpdate,
  KanbanSwimlane,
  KanbanUserStory,
  KanbanStoryUpdateRequest,
  KanbanTaskSummary,
  KanbanTaskStatus,
  KanbanTaskUpdate,
  KanbanStoryHistoryEntry,
} from './kanban.models';

export interface KanbanPayload {
  readonly swimlanes: readonly KanbanSwimlane[];
  readonly userStories: readonly KanbanUserStory[];
  readonly filtersData?: KanbanFiltersData;
  readonly milestones?: readonly KanbanMilestone[];
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
      filtersData: this.filtersData(projectId).pipe(catchError(() => of({}))),
      milestones: this.listMilestones(projectId).pipe(catchError(() => of([]))),
    });
  }

  listMilestones(projectId: TaigaId): Observable<readonly KanbanMilestone[]> {
    return this.http.get<readonly KanbanMilestone[]>(this.config.resolveApiPath('milestones'), {
      headers: UNPAGINATED_HEADERS,
      params: new HttpParams().set('project', projectId),
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
        params: new HttpParams().set('project', projectId),
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

  updateUserStory(request: KanbanStoryUpdateRequest): Observable<KanbanUserStory> {
    return this.http.patch<KanbanUserStory>(
      `${this.config.resolveApiPath('userstories')}/${request.storyId}`,
      {
        ...request.changes,
        ...(request.version === undefined ? {} : { version: request.version }),
      },
    );
  }

  listTaskStatuses(projectId: TaigaId): Observable<readonly KanbanTaskStatus[]> {
    return this.http.get<readonly KanbanTaskStatus[]>(
      this.config.resolveApiPath('task-statuses'),
      {
        headers: UNPAGINATED_HEADERS,
        params: new HttpParams().set('project', projectId),
      },
    );
  }

  createTask(projectId: TaigaId, storyId: TaigaId, subject: string): Observable<KanbanTaskSummary> {
    return this.http.post<KanbanTaskSummary>(this.config.resolveApiPath('tasks'), {
      project: projectId,
      user_story: storyId,
      subject,
    });
  }

  updateTask(
    taskId: TaigaId,
    changes: KanbanTaskUpdate,
    version?: number,
  ): Observable<KanbanTaskSummary> {
    return this.http.patch<KanbanTaskSummary>(
      `${this.config.resolveApiPath('tasks')}/${taskId}`,
      { ...changes, ...(version === undefined ? {} : { version }) },
    );
  }

  deleteTask(taskId: TaigaId): Observable<void> {
    return this.http.delete<void>(`${this.config.resolveApiPath('tasks')}/${taskId}`);
  }

  getStoryHistory(storyId: TaigaId): Observable<readonly KanbanStoryHistoryEntry[]> {
    return this.http.get<readonly KanbanStoryHistoryEntry[]>(
      `${this.config.resolveApiPath('history/userstory')}/${storyId}`,
    );
  }

  editStoryHistoryComment(
    storyId: TaigaId,
    historyId: string,
    comment: string,
  ): Observable<void> {
    return this.http.post<void>(
      `${this.config.resolveApiPath('history/userstory')}/${storyId}/edit_comment`,
      { comment },
      { params: new HttpParams().set('id', historyId) },
    );
  }

  deleteStoryHistoryComment(storyId: TaigaId, historyId: string): Observable<void> {
    return this.http.post<void>(
      `${this.config.resolveApiPath('history/userstory')}/${storyId}/delete_comment`,
      {},
      { params: new HttpParams().set('id', historyId) },
    );
  }

  updateStoryPoints(
    storyId: TaigaId,
    points: Readonly<Record<string, TaigaId>>,
    version?: number,
  ): Observable<KanbanUserStory> {
    return this.http.patch<KanbanUserStory>(
      `${this.config.resolveApiPath('userstories')}/${storyId}`,
      { points, ...(version === undefined ? {} : { version }) },
    );
  }

  addStoryComment(
    storyId: TaigaId,
    comment: string,
    version?: number,
  ): Observable<KanbanUserStory> {
    return this.http.patch<KanbanUserStory>(
      `${this.config.resolveApiPath('userstories')}/${storyId}`,
      { comment, ...(version === undefined ? {} : { version }) },
    );
  }

  deleteUserStory(storyId: TaigaId): Observable<void> {
    return this.http.delete<void>(`${this.config.resolveApiPath('userstories')}/${storyId}`);
  }

  /** Story detail embeds only tiny thumbnails; this endpoint returns full file metadata. */
  listAttachments(projectId: TaigaId, storyId: TaigaId): Observable<readonly KanbanAttachmentSummary[]> {
    return this.http.get<readonly KanbanAttachmentSummary[]>(
      this.config.resolveApiPath('userstories/attachments'),
      {
        headers: UNPAGINATED_HEADERS,
        params: new HttpParams().set('project', projectId).set('object_id', storyId),
      },
    );
  }

  uploadAttachment(request: KanbanAttachmentUploadRequest): Observable<KanbanAttachmentSummary> {
    const body = new FormData();
    body.append('project', String(request.projectId));
    body.append('object_id', String(request.storyId));
    body.append('attached_file', request.file, request.file.name);
    body.append('from_comment', 'false');
    return this.http.post<KanbanAttachmentSummary>(
      this.config.resolveApiPath('userstories/attachments'),
      body,
    );
  }

  deleteAttachment(attachmentId: TaigaId): Observable<void> {
    return this.http.delete<void>(
      `${this.config.resolveApiPath('userstories/attachments')}/${attachmentId}`,
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
