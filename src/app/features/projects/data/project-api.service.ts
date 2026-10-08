import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';
import {
  type TaigaProjectDetail,
  type TaigaProjectListItem,
  type TaigaTagColors,
  isTagColors,
  normalizeProjectDetail,
} from './project.models';

const DISABLE_PAGINATION = new HttpHeaders({ 'x-disable-pagination': '1' });
// This is the public alias handled by stable Taiga's UserOrderFilterBackend.
// `memberships__user_order` is the ORM path, not the API contract used by the legacy client.
const MEMBER_PROJECT_ORDER = 'user_order';

@Injectable({ providedIn: 'root' })
export class ProjectApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  listByMember(memberId: number): Observable<readonly TaigaProjectListItem[]> {
    const params = new HttpParams()
      .set('member', memberId)
      .set('order_by', MEMBER_PROJECT_ORDER)
      .set('slight', true);

    return this.http.get<readonly TaigaProjectListItem[]>(this.projectsUrl(), {
      headers: DISABLE_PAGINATION,
      params,
    });
  }

  getBySlug(slug: string): Observable<TaigaProjectDetail> {
    const params = new HttpParams().set('slug', slug);
    return this.http
      .get<TaigaProjectListItem & Partial<TaigaProjectDetail>>(`${this.projectsUrl()}/by_slug`, {
        params,
      })
      .pipe(switchMap((project) => this.withTagColors(project)));
  }

  getById(projectId: number): Observable<TaigaProjectDetail> {
    return this.http
      .get<TaigaProjectListItem & Partial<TaigaProjectDetail>>(`${this.projectsUrl()}/${projectId}`)
      .pipe(switchMap((project) => this.withTagColors(project)));
  }

  private withTagColors(
    project: TaigaProjectListItem & Partial<TaigaProjectDetail>,
  ): Observable<TaigaProjectDetail> {
    if (isTagColors(project.tags_colors)) {
      return of(normalizeProjectDetail(project));
    }

    return this.http.get<TaigaTagColors>(`${this.projectsUrl()}/${project.id}/tags_colors`).pipe(
      map((tagColors) => normalizeProjectDetail(project, tagColors)),
      // Older stable installations may omit this endpoint for restricted projects.
      // Project navigation should still work, with an empty tag palette.
      catchError(() => of(normalizeProjectDetail(project))),
    );
  }

  private projectsUrl(): string {
    return this.config.resolveApiPath('projects');
  }
}
