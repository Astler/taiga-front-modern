import { TestBed } from '@angular/core/testing';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamApiService } from './team-api.service';
import type { TaigaMembership } from './team.models';
import { TeamStore } from './team.store';

describe('TeamStore', () => {
  let api: {
    listMemberships: ReturnType<
      typeof vi.fn<(projectId: number) => Observable<readonly TaigaMembership[]>>
    >;
  };
  let store: TeamStore;

  beforeEach(() => {
    api = { listMemberships: vi.fn() };
    TestBed.configureTestingModule({
      providers: [TeamStore, { provide: TeamApiService, useValue: api }],
    });
    store = TestBed.inject(TeamStore);
  });

  it('sorts owners and admins first and builds role/status summaries', () => {
    api.listMemberships.mockReturnValue(
      of([
        membership(3, { full_name_display: 'Inactive User', is_user_active: false }),
        membership(2, { full_name_display: 'Ada Admin', is_admin: true }),
        membership(4, {
          full_name_display: '',
          full_name: '',
          user: null,
          username: null,
          user_email: '',
          email: 'invite@example.test',
          is_user_active: false,
        }),
        membership(1, { full_name_display: 'Olivia Owner', is_owner: true }),
      ]),
    );

    store.loadProject(17);

    expect(store.status()).toBe('loaded');
    expect(store.memberships().map(({ id }) => id)).toEqual([1, 2, 3, 4]);
    expect(store.activeCount()).toBe(2);
    expect(store.inactiveCount()).toBe(1);
    expect(store.pendingCount()).toBe(1);
    expect(store.roles()).toEqual([{ id: 2, name: 'Developer', count: 4 }]);
  });

  it('filters locally by search, role, and account status', () => {
    api.listMemberships.mockReturnValue(
      of([
        membership(1, { full_name_display: 'Ada Lovelace', role: 2, role_name: 'Developer' }),
        membership(2, {
          full_name_display: 'Grace Hopper',
          role: 3,
          role_name: 'Product',
          is_user_active: false,
        }),
      ]),
    );
    store.loadProject(17);

    store.setSearch('product');
    expect(store.filteredMemberships().map(({ id }) => id)).toEqual([2]);
    store.setSearch('');
    store.setRole(2);
    expect(store.filteredMemberships().map(({ id }) => id)).toEqual([1]);
    store.setRole(null);
    store.setStatus('inactive');
    expect(store.filteredMemberships().map(({ id }) => id)).toEqual([2]);
  });

  it('ignores a stale response when the project changes', () => {
    const older = new Subject<readonly TaigaMembership[]>();
    const newer = new Subject<readonly TaigaMembership[]>();
    api.listMemberships.mockReturnValueOnce(older).mockReturnValueOnce(newer);

    store.loadProject(17);
    store.loadProject(18);
    newer.next([membership(2, { project: 18 })]);
    newer.complete();
    older.next([membership(1)]);
    older.complete();

    expect(store.projectId()).toBe(18);
    expect(store.memberships().map(({ id }) => id)).toEqual([2]);
  });

  it('surfaces failures and retries the current project', () => {
    api.listMemberships
      .mockReturnValueOnce(throwError(() => new Error('offline')))
      .mockReturnValueOnce(of([membership(1)]));

    store.loadProject(17);
    expect(store.status()).toBe('error');
    expect(store.error()).toContain('could not be loaded');

    store.retry();
    expect(api.listMemberships).toHaveBeenCalledTimes(2);
    expect(store.status()).toBe('loaded');
    expect(store.error()).toBeNull();
  });
});

function membership(id: number, changes: Partial<TaigaMembership> = {}): TaigaMembership {
  return {
    id,
    project: 17,
    role: 2,
    role_name: 'Developer',
    is_admin: false,
    is_owner: false,
    user: id + 10,
    username: `user-${id}`,
    full_name: `User ${id}`,
    full_name_display: `User ${id}`,
    photo: null,
    gravatar_id: null,
    is_user_active: true,
    user_email: `user-${id}@example.test`,
    email: null,
    ...changes,
  };
}
