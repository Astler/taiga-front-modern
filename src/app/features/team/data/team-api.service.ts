import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import type { TaigaMembership } from './team.models';

const UNPAGINATED_HEADERS = new HttpHeaders({ 'X-Disable-Pagination': '1' });

@Injectable({ providedIn: 'root' })
export class TeamApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  listMemberships(projectId: TaigaId): Observable<readonly TaigaMembership[]> {
    return this.http.get<readonly TaigaMembership[]>(this.config.resolveApiPath('memberships'), {
      headers: UNPAGINATED_HEADERS,
      params: new HttpParams().set('project', projectId),
    });
  }
}
