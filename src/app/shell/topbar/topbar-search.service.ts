import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { RuntimeConfigService } from '../../core';

export interface TopbarSearchItem {
  readonly id: number;
  readonly ref?: number;
  readonly subject?: string;
  readonly slug?: string;
  readonly status_extra_info?: Readonly<{
    color?: string;
    name?: string;
  }> | null;
}

export interface TopbarSearchResults {
  readonly epics: readonly TopbarSearchItem[];
  readonly issues: readonly TopbarSearchItem[];
  readonly userstories: readonly TopbarSearchItem[];
}

interface SearchApiResponse {
  readonly epics?: readonly TopbarSearchItem[];
  readonly issues?: readonly TopbarSearchItem[];
  readonly userstories?: readonly TopbarSearchItem[];
}

export const EMPTY_TOPBAR_SEARCH_RESULTS: TopbarSearchResults = {
  epics: [],
  issues: [],
  userstories: [],
};

@Injectable({ providedIn: 'root' })
export class TopbarSearchService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  search(projectId: number, text: string): Observable<TopbarSearchResults> {
    const params = new HttpParams()
      .set('project', projectId)
      .set('text', text.trim())
      .set('get_all', false);

    return this.http.get<SearchApiResponse>(this.config.resolveApiPath('search'), { params }).pipe(
      map((response) => ({
        epics: Array.isArray(response.epics) ? response.epics : [],
        issues: Array.isArray(response.issues) ? response.issues : [],
        userstories: Array.isArray(response.userstories) ? response.userstories : [],
      })),
    );
  }
}
