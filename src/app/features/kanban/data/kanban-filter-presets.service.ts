import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, defer, map, of, throwError } from 'rxjs';
import { AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import type { TaigaId } from '../../../shared/models';
import type {
  KanbanFilterCategory,
  KanbanFilterClause,
  KanbanFilterMode,
  KanbanFilterPreset,
  KanbanSortMode,
} from './kanban.models';

interface UserStorageResponse {
  readonly key: string;
  readonly value: unknown;
}

const FILTER_CATEGORIES: readonly KanbanFilterCategory[] = [
  'tags',
  'assigned_users',
  'role',
  'owner',
  'epic',
  'milestone',
  'focus',
];
const FILTER_MODES: readonly KanbanFilterMode[] = ['include', 'exclude'];
const SORT_MODES: readonly KanbanSortMode[] = [
  'manual',
  'newest',
  'updated',
  'due',
  'points',
  'title',
];

@Injectable({ providedIn: 'root' })
export class KanbanFilterPresetsService {
  private readonly authTokens = inject(AuthTokenStorage);
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  load(projectId: TaigaId): Observable<readonly KanbanFilterPreset[]> {
    return this.http
      .get<UserStorageResponse>(`${this.storageUrl()}/${presetStorageKey(projectId)}`)
      .pipe(
        map(({ value }) => normalizeKanbanFilterPresets(value)),
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse && error.status === 404
            ? of([])
            : throwError(() => error),
        ),
      );
  }

  save(projectId: TaigaId, presets: readonly KanbanFilterPreset[]): Observable<void> {
    const sessionRevision = this.authTokens.revision();
    const key = presetStorageKey(projectId);
    const value = normalizeKanbanFilterPresets(presets);
    const body = { key, value };
    return defer(() => {
      if (this.authTokens.revision() !== sessionRevision) {
        return throwError(() => new StaleKanbanPresetSessionError());
      }

      return this.http.put<void>(`${this.storageUrl()}/${key}`, body).pipe(
        catchError((error: unknown) =>
          this.authTokens.revision() === sessionRevision &&
          error instanceof HttpErrorResponse &&
          error.status === 404
            ? this.http.post<void>(this.storageUrl(), body)
            : throwError(() => error),
        ),
        map(() => undefined),
      );
    });
  }

  private storageUrl(): string {
    return this.config.resolveApiPath('user-storage');
  }
}

export class StaleKanbanPresetSessionError extends Error {
  constructor() {
    super('The authentication session changed before the Kanban presets could be saved.');
    this.name = 'StaleKanbanPresetSessionError';
  }
}

export function presetStorageKey(projectId: TaigaId): string {
  return `pressf-kanban-filter-presets-${projectId}`;
}

export function normalizeKanbanFilterPresets(value: unknown): readonly KanbanFilterPreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const presets: KanbanFilterPreset[] = [];
  const seenIds = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    const id = cleanText(candidate['id'], 80);
    const name = cleanText(candidate['name'], 60);
    const sort = candidate['sort'];
    if (!id || !name || !SORT_MODES.includes(sort as KanbanSortMode) || seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    presets.push({
      id,
      name,
      query: cleanText(candidate['query'], 200) ?? '',
      sort: sort as KanbanSortMode,
      filters: normalizeClauses(candidate['filters']),
    });
  }
  return presets;
}

function normalizeClauses(value: unknown): readonly KanbanFilterClause[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const clauses: KanbanFilterClause[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) {
      continue;
    }
    const category = candidate['category'];
    const mode = candidate['mode'];
    const filterValue = cleanText(candidate['value'], 120);
    const label = cleanText(candidate['label'], 160);
    if (
      !FILTER_CATEGORIES.includes(category as KanbanFilterCategory) ||
      !FILTER_MODES.includes(mode as KanbanFilterMode) ||
      !filterValue ||
      !label
    ) {
      continue;
    }
    const key = `${category}:${mode}:${filterValue}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const color = candidate['color'];
    clauses.push({
      category: category as KanbanFilterCategory,
      mode: mode as KanbanFilterMode,
      value: filterValue,
      label,
      ...(color === null || typeof color === 'string' ? { color } : {}),
    });
  }
  return clauses;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
