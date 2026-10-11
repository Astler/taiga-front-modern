import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import {
  ISSUE_FILTER_CATEGORIES,
  type IssueAttachment,
  type IssueChanges,
  type IssueCreateRequest,
  type IssueFiltersData,
  type IssueListPage,
  type IssueListQuery,
  type TaigaIssue,
} from './issues.models';

const UNPAGINATED_HEADERS = new HttpHeaders({ 'X-Disable-Pagination': '1' });

@Injectable({ providedIn: 'root' })
export class IssuesApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  list(projectId: TaigaId, query: IssueListQuery): Observable<IssueListPage> {
    const params = issueFilterParams(projectId, query)
      .set('page', Math.max(1, query.page))
      .set('order_by', query.orderBy);

    return this.http
      .get<readonly TaigaIssue[]>(this.config.resolveApiPath('issues'), {
        observe: 'response',
        params,
      })
      .pipe(map((response) => this.toPage(response, query.page)));
  }

  filters(projectId: TaigaId, query: IssueListQuery): Observable<IssueFiltersData> {
    return this.http.get<IssueFiltersData>(this.config.resolveApiPath('issues/filters_data'), {
      headers: UNPAGINATED_HEADERS,
      params: issueFilterParams(projectId, query),
    });
  }

  get(issueId: TaigaId): Observable<TaigaIssue> {
    return this.http.get<TaigaIssue>(`${this.config.resolveApiPath('issues')}/${issueId}`);
  }

  create(request: IssueCreateRequest): Observable<TaigaIssue> {
    return this.http.post<TaigaIssue>(this.config.resolveApiPath('issues'), request);
  }

  update(issueId: TaigaId, changes: IssueChanges, version?: number): Observable<TaigaIssue> {
    return this.http.patch<TaigaIssue>(`${this.config.resolveApiPath('issues')}/${issueId}`, {
      ...changes,
      ...(version === undefined ? {} : { version }),
    });
  }

  delete(issueId: TaigaId): Observable<void> {
    return this.http.delete<void>(`${this.config.resolveApiPath('issues')}/${issueId}`);
  }

  listAttachments(projectId: TaigaId, issueId: TaigaId): Observable<readonly IssueAttachment[]> {
    return this.http.get<readonly IssueAttachment[]>(this.config.resolveApiPath('issues/attachments'), {
      headers: UNPAGINATED_HEADERS,
      params: new HttpParams().set('project', projectId).set('object_id', issueId),
    });
  }

  uploadAttachment(projectId: TaigaId, issueId: TaigaId, file: File): Observable<IssueAttachment> {
    const body = new FormData();
    body.append('project', String(projectId));
    body.append('object_id', String(issueId));
    body.append('attached_file', file, file.name);
    return this.http.post<IssueAttachment>(this.config.resolveApiPath('issues/attachments'), body);
  }

  deleteAttachment(attachmentId: TaigaId): Observable<void> {
    return this.http.delete<void>(`${this.config.resolveApiPath('issues/attachments')}/${attachmentId}`);
  }

  private toPage(
    response: HttpResponse<readonly TaigaIssue[]>,
    requestedPage: number,
  ): IssueListPage {
    const items = response.body ?? [];
    const total = positiveHeader(response, 'X-Pagination-Count') ?? items.length;
    const page = positiveHeader(response, 'X-Pagination-Current') ?? Math.max(1, requestedPage);
    const pageSize = positiveHeader(response, 'X-Paginated-By') ?? Math.max(1, items.length);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }
}

function issueFilterParams(projectId: TaigaId, query: IssueListQuery): HttpParams {
  let params = new HttpParams().set('project', projectId);
  const search = query.q.trim();
  if (search) {
    params = params.set('q', search);
  }

  for (const category of ISSUE_FILTER_CATEGORIES) {
    const selection = query.filters[category];
    if (!selection?.value) {
      continue;
    }
    const parameter = selection.mode === 'exclude' ? `exclude_${category}` : category;
    params = params.set(parameter, selection.value);
  }
  return params;
}

function positiveHeader(response: HttpResponse<unknown>, name: string): number | null {
  const value = Number(response.headers.get(name));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
