import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RuntimeConfigService } from '../../../core/config';

export const WORKFLOW_KINDS = [
  { key: 'userstory-statuses', label: 'Story statuses', closed: true, color: true },
  { key: 'task-statuses', label: 'Task statuses', closed: true, color: true },
  { key: 'issue-statuses', label: 'Issue statuses', closed: true, color: true },
  { key: 'epic-statuses', label: 'Epic statuses', closed: true, color: true },
  { key: 'issue-types', label: 'Issue types', closed: false, color: true },
  { key: 'priorities', label: 'Priorities', closed: false, color: true },
  { key: 'severities', label: 'Severities', closed: false, color: true },
  { key: 'points', label: 'Points', closed: false, color: false },
] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number]['key'];
export type SettingsResource = WorkflowKind | 'roles';
export interface ConfigurationValue {
  readonly id: number;
  readonly name: string;
  readonly order: number;
  readonly color?: string;
  readonly is_closed?: boolean;
  readonly is_archived?: boolean;
  readonly wip_limit?: number | null;
  readonly value?: number | null;
  readonly computable?: boolean;
  readonly permissions?: readonly string[];
}
export type ConfigurationChanges = Partial<Omit<ConfigurationValue, 'id'>>;
export interface ProjectChanges {
  readonly name?: string;
  readonly description?: string;
  readonly is_private?: boolean;
  readonly is_backlog_activated?: boolean;
  readonly is_kanban_activated?: boolean;
  readonly is_issues_activated?: boolean;
  readonly is_epics_activated?: boolean;
  readonly is_wiki_activated?: boolean;
}

@Injectable({ providedIn: 'root' })
export class SettingsApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  updateProject(id: number, changes: ProjectChanges): Observable<unknown> {
    return this.http.patch(this.url(`projects/${id}`), changes);
  }

  list(projectId: number, resource: SettingsResource): Observable<readonly ConfigurationValue[]> {
    return this.http.get<readonly ConfigurationValue[]>(this.url(resource), {
      params: new HttpParams().set('project', projectId),
      headers: new HttpHeaders({ 'X-Disable-Pagination': '1' }),
    });
  }

  create(
    projectId: number,
    resource: SettingsResource,
    changes: ConfigurationChanges,
  ): Observable<ConfigurationValue> {
    return this.http.post<ConfigurationValue>(this.url(resource), {
      ...changes,
      project: projectId,
    });
  }

  update(
    resource: SettingsResource,
    id: number,
    changes: ConfigurationChanges,
  ): Observable<ConfigurationValue> {
    return this.http.patch<ConfigurationValue>(this.url(`${resource}/${id}`), changes);
  }

  createTag(projectId: number, tag: string, color: string | null): Observable<unknown> {
    return this.http.post(this.url(`projects/${projectId}/create_tag`), { tag, color });
  }

  editTag(projectId: number, from: string, to: string, color: string | null): Observable<unknown> {
    return this.http.post(this.url(`projects/${projectId}/edit_tag`), {
      from_tag: from,
      ...(from === to ? {} : { to_tag: to }),
      color,
    });
  }

  private url(path: string): string {
    return this.config.resolveApiPath(path);
  }
}
