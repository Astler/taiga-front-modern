import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../core';
import { TopbarSearchService } from './topbar-search.service';

describe('TopbarSearchService', () => {
  it('searches the selected project through Taiga search', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (path: string) => `https://taiga.test/api/v1/${path}` },
        },
      ],
    });
    const service = TestBed.inject(TopbarSearchService);
    const http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(service.search(17, ' release '));
    const request = http.expectOne(
      (candidate) =>
        candidate.url === 'https://taiga.test/api/v1/search' &&
        candidate.params.get('project') === '17' &&
        candidate.params.get('text') === 'release' &&
        candidate.params.get('get_all') === 'false',
    );
    request.flush({
      userstories: [{ id: 2, ref: 41, subject: 'Release checklist' }],
      issues: null,
    });

    await expect(result).resolves.toEqual({
      epics: [],
      issues: [],
      userstories: [{ id: 2, ref: 41, subject: 'Release checklist' }],
    });
    http.verify();
  });
});
