import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from './runtime-config.service';
import { RUNTIME_CONFIG_URL } from './runtime-config.tokens';

describe('RuntimeConfigService', () => {
  let httpTesting: HttpTestingController;
  let service: RuntimeConfigService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: RUNTIME_CONFIG_URL, useValue: '/test-config.json' },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(RuntimeConfigService);
  });

  afterEach(() => httpTesting.verify());

  it('loads the config once and exposes URL helpers', async () => {
    const firstLoad = service.load();
    const secondLoad = service.load();

    expect(secondLoad).toBe(firstLoad);
    httpTesting.expectOne('/test-config.json').flush({ api: '/api/v1' });
    await firstLoad;

    expect(service.snapshot().api).toBe('/api/v1/');
    expect(service.resolveApiPath('/users/me')).toBe('/api/v1/users/me');
    expect(service.isApiRequest('/api/v1/projects')).toBe(true);
    expect(service.isApiRequest('/api/v10/projects')).toBe(false);
    expect(service.isApiEndpoint('/api/v1/auth/', 'auth')).toBe(true);

    await service.load();
    httpTesting.expectNone('/test-config.json');
  });

  it('fails fast when config is read before bootstrap', () => {
    expect(() => service.snapshot()).toThrow(/not loaded/i);
  });
});
