import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import {
  EPIC_FILTER_CATEGORIES,
  type EpicFiltersData,
  type EpicListPage,
  type EpicListQuery,
  type TaigaEpic,
} from './epics.models';

const UNPAGINATED_HEADERS = new HttpHeaders({ 'X-Disable-Pagination': '1' });

@Injectable({ providedIn: 'root' })
export class EpicsApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  list(projectId: TaigaId, query: EpicListQuery): Observable<EpicListPage> {
    const params = epicFilterParams(projectId, query).set('page', Math.max(1, query.page));

    return this.http
      .get<readonly TaigaEpic[]>(this.config.resolveApiPath('epics'), {
        observe: 'response',
        params,
      })
      .pipe(map((response) => this.toPage(response, query.page)));
  }

  filters(projectId: TaigaId, query: EpicListQuery): Observable<EpicFiltersData> {
    return this.http.get<EpicFiltersData>(this.config.resolveApiPath('epics/filters_data'), {
      headers: UNPAGINATED_HEADERS,
      params: epicFilterParams(projectId, query),
    });
  }

  private toPage(
    response: HttpResponse<readonly TaigaEpic[]>,
    requestedPage: number,
  ): EpicListPage {
    const items = response.body ?? [];
    const total = nonNegativeHeader(response, 'X-Pagination-Count') ?? items.length;
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

function epicFilterParams(projectId: TaigaId, query: EpicListQuery): HttpParams {
  let params = new HttpParams().set('project', projectId);
  const search = query.q.trim();
  if (search) {
    params = params.set('q', search);
  }

  for (const category of EPIC_FILTER_CATEGORIES) {
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

function nonNegativeHeader(response: HttpResponse<unknown>, name: string): number | null {
  const rawValue = response.headers.get(name);
  if (rawValue === null) {
    return null;
  }
  const value = Number(rawValue);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
