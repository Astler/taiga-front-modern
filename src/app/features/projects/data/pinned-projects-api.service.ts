import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AuthTokenStorage } from '../../../core/auth';
import { RuntimeConfigService } from '../../../core/config';
import { PINNED_PROJECTS_STORAGE_KEY } from './pinned-projects.storage';

interface UserStorageResponse {
  readonly key: string;
  readonly value: unknown;
}

@Injectable({ providedIn: 'root' })
export class PinnedProjectsApiService {
  private readonly authTokens = inject(AuthTokenStorage);
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  load(): Observable<readonly number[]> {
    return this.http
      .get<UserStorageResponse>(
        `${this.config.resolveApiPath('user-storage')}/${PINNED_PROJECTS_STORAGE_KEY}`,
      )
      .pipe(map(({ value }) => normalizeRemotePinnedIds(value)));
  }

  save(ids: readonly number[]): Observable<void> {
    const sessionRevision = this.authTokens.revision();
    const baseUrl = this.config.resolveApiPath('user-storage');
    const body = { key: PINNED_PROJECTS_STORAGE_KEY, value: normalizeRemotePinnedIds(ids) };
    return this.http.put<void>(`${baseUrl}/${PINNED_PROJECTS_STORAGE_KEY}`, body).pipe(
      catchError((error: unknown) =>
        this.authTokens.revision() === sessionRevision &&
        error instanceof HttpErrorResponse &&
        error.status === 404
          ? this.http.post<void>(baseUrl, body)
          : throwError(() => error),
      ),
      map(() => undefined),
    );
  }
}

export function normalizeRemotePinnedIds(value: unknown): readonly number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value
    .map((candidate) =>
      typeof candidate === 'string' && /^\d+$/.test(candidate) ? Number(candidate) : candidate,
    )
    .filter(
      (candidate): candidate is number =>
        typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0,
    );
  return [...new Set(ids)];
}
