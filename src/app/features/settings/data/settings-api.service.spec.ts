import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuntimeConfigService } from '../../../core/config';
import { SettingsApiService } from './settings-api.service';

describe('SettingsApiService', () => {
  let api: SettingsApiService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RuntimeConfigService,
          useValue: { resolveApiPath: (p: string) => '/api/v1/' + p },
        },
      ],
    });
    api = TestBed.inject(SettingsApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('patches project fields without overwriting unrelated configuration', async () => {
    const result = firstValueFrom(
      api.updateProject(7, { name: 'Changed', is_epics_activated: true }),
    );
    const request = http.expectOne('/api/v1/projects/7');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ name: 'Changed', is_epics_activated: true });
    request.flush({});
    await result;
  });
  it('loads all configuration values filtered by project', async () => {
    const result = firstValueFrom(api.list(7, 'userstory-statuses'));
    const request = http.expectOne('/api/v1/userstory-statuses?project=7');
    expect(request.request.headers.get('X-Disable-Pagination')).toBe('1');
    request.flush([]);
    await expect(result).resolves.toEqual([]);
  });
  it('creates a status in the project and patches existing roles separately', async () => {
    const created = firstValueFrom(
      api.create(7, 'issue-statuses', { name: 'Review', color: '#123456' }),
    );
    const request = http.expectOne('/api/v1/issue-statuses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Review', color: '#123456', project: 7 });
    request.flush({ id: 12 });
    await created;
    const patched = firstValueFrom(
      api.update('roles', 12, { permissions: ['view_project', 'view_us'] }),
    );
    const update = http.expectOne('/api/v1/roles/12');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual({ permissions: ['view_project', 'view_us'] });
    update.flush({ id: 12 });
    await patched;
  });
  it('uses Taiga project tag actions instead of replacing the tag catalogue', async () => {
    const created = firstValueFrom(api.createTag(7, 'new', null));
    const create = http.expectOne('/api/v1/projects/7/create_tag');
    expect(create.request.body).toEqual({ tag: 'new', color: null });
    create.flush(null);
    await created;
    const edited = firstValueFrom(api.editTag(7, 'old', 'new', '#123456'));
    const edit = http.expectOne('/api/v1/projects/7/edit_tag');
    expect(edit.request.method).toBe('POST');
    expect(edit.request.body).toEqual({ from_tag: 'old', to_tag: 'new', color: '#123456' });
    edit.flush(null);
    await edited;
  });
});
