import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { RuntimeConfigService } from '../../core';
import { TopbarNotificationsService } from './topbar-notifications.service';

describe('TopbarNotificationsService', () => {
  let http: HttpTestingController;
  let service: TopbarNotificationsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (path: string) => `/api/v1/${path}` },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(TopbarNotificationsService);
  });

  afterEach(() => http.verify());

  it('loads unread notifications from the stable Taiga endpoint', async () => {
    const result = firstValueFrom(service.listUnread());
    const request = http.expectOne('/api/v1/web-notifications?page=1&only_unread=true');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-lazy-pagination')).toBe('1');
    request.flush({ total: 1, objects: [{ id: 4, event_type: 5, read: false }] });
    await expect(result).resolves.toEqual({
      total: 1,
      objects: [{ id: 4, event_type: 5, read: false }],
    });
  });

  it('marks one or all notifications as read', async () => {
    const one = firstValueFrom(service.markAsRead(4));
    const oneRequest = http.expectOne('/api/v1/web-notifications/4/set-as-read');
    expect(oneRequest.request.method).toBe('PATCH');
    oneRequest.flush(null);
    await expect(one).resolves.toBeNull();

    const all = firstValueFrom(service.markAllAsRead());
    const allRequest = http.expectOne('/api/v1/web-notifications/set-as-read');
    expect(allRequest.request.method).toBe('POST');
    allRequest.flush(null);
    await expect(all).resolves.toBeNull();
  });
});
