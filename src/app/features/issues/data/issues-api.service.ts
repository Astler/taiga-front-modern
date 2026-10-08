import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import {
  ISSUE_FILTER_CATEGORIES,
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
    let params = new HttpParams()
      .set('project', projectId)
      .set('page', Math.max(1, query.page))
      .set('order_by', query.orderBy);

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

    return this.http
      .get<readonly TaigaIssue[]>(this.config.resolveApiPath('issues'), {
        observe: 'response',
        params,
      })
      .pipe(map((response) => this.toPage(response, query.page)));
  }

  filters(projectId: TaigaId): Observable<IssueFiltersData> {
    return this.http.get<IssueFiltersData>(this.config.resolveApiPath('issues/filters_data'), {
      headers: UNPAGINATED_HEADERS,
      params: new HttpParams().set('project', projectId),
    });
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

function positiveHeader(response: HttpResponse<unknown>, name: string): number | null {
  const value = Number(response.headers.get(name));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
