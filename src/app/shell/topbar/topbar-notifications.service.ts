import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RuntimeConfigService } from '../../core';

export interface TopbarNotificationUser {
  readonly id?: number;
  readonly name?: string;
  readonly username?: string;
  readonly photo?: string | null;
}

export interface TopbarNotificationProject {
  readonly id?: number;
  readonly logo_small_url?: string | null;
  readonly name?: string;
  readonly slug?: string;
}

export interface TopbarNotificationObject {
  readonly id?: number;
  readonly ref?: number;
  readonly subject?: string;
  readonly content_type?: string;
}

export interface TopbarNotification {
  readonly id: number;
  readonly event_type: number;
  readonly read: boolean;
  readonly created?: string;
  readonly data?: {
    readonly user?: TopbarNotificationUser;
    readonly project?: TopbarNotificationProject;
    readonly obj?: TopbarNotificationObject;
  };
}

export interface TopbarNotificationsResponse {
  readonly total: number;
  readonly objects: readonly TopbarNotification[];
}

@Injectable({ providedIn: 'root' })
export class TopbarNotificationsService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);

  listUnread(): Observable<TopbarNotificationsResponse> {
    return this.http.get<TopbarNotificationsResponse>(
      this.config.resolveApiPath('web-notifications'),
      {
        headers: new HttpHeaders({ 'X-Lazy-Pagination': '1' }),
        params: new HttpParams().set('page', 1).set('only_unread', true),
      },
    );
  }

  markAsRead(notificationId: number): Observable<void> {
    return this.http.patch<void>(
      `${this.config.resolveApiPath('web-notifications')}/${notificationId}/set-as-read`,
      null,
    );
  }

  markAllAsRead(): Observable<void> {
    return this.http.post<void>(
      `${this.config.resolveApiPath('web-notifications')}/set-as-read`,
      null,
    );
  }
}
