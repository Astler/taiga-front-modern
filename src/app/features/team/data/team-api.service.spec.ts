import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { TeamApiService } from './team-api.service';
import type { TaigaMembership } from './team.models';

describe('TeamApiService', () => {
  let httpTesting: HttpTestingController;
  let service: TeamApiService;

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
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(TeamApiService);
  });

  afterEach(() => httpTesting.verify());

  it('loads the complete project membership roster from the stable endpoint', async () => {
    const response = [membership(1)];
    const result = firstValueFrom(service.listMemberships(17));
    const request = httpTesting.expectOne((candidate) => candidate.url === '/api/v1/memberships');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('project')).toBe('17');
    expect(request.request.headers.get('x-disable-pagination')).toBe('1');
    request.flush(response);

    await expect(result).resolves.toEqual(response);
  });
});

function membership(id: number): TaigaMembership {
  return {
    id,
    project: 17,
    role: 2,
    role_name: 'Developer',
    is_admin: false,
    is_owner: false,
    user: 7,
    username: 'ada',
    full_name: 'Ada Lovelace',
    full_name_display: 'Ada Lovelace',
    photo: null,
    gravatar_id: 'abc',
    is_user_active: true,
    user_email: 'ada@example.test',
    email: null,
  };
}
