import { Injectable, computed, inject, signal } from '@angular/core';
import type { TaigaId } from '../../../shared/models';
import { TeamApiService } from './team-api.service';
import {
  DEFAULT_TEAM_QUERY,
  type TaigaMembership,
  type TeamQuery,
  type TeamRoleSummary,
  type TeamStatusFilter,
} from './team.models';

export type TeamLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

@Injectable()
export class TeamStore {
  private readonly api = inject(TeamApiService);
  private readonly projectIdState = signal<TaigaId | null>(null);
  private readonly statusState = signal<TeamLoadStatus>('idle');
  private readonly membershipsState = signal<readonly TaigaMembership[]>([]);
  private readonly queryState = signal<TeamQuery>(DEFAULT_TEAM_QUERY);
  private readonly errorState = signal<string | null>(null);
  private requestRevision = 0;

  readonly projectId = this.projectIdState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly memberships = this.membershipsState.asReadonly();
  readonly query = this.queryState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly roles = computed<readonly TeamRoleSummary[]>(() => {
    const roles = new Map<TaigaId, TeamRoleSummary>();
    for (const member of this.membershipsState()) {
      const existing = roles.get(member.role);
      roles.set(member.role, {
        id: member.role,
        name: member.role_name,
        count: (existing?.count ?? 0) + 1,
      });
    }
    return [...roles.values()].sort((left, right) => left.name.localeCompare(right.name));
  });
  readonly activeCount = computed(
    () => this.membershipsState().filter((member) => isActiveMember(member)).length,
  );
  readonly inactiveCount = computed(
    () =>
      this.membershipsState().filter((member) => member.user !== null && !member.is_user_active)
        .length,
  );
  readonly pendingCount = computed(
    () => this.membershipsState().filter((member) => member.user === null).length,
  );
  readonly filteredMemberships = computed(() => {
    const query = this.queryState();
    const search = query.search.trim().toLocaleLowerCase();

    return this.membershipsState().filter((member) => {
      if (query.role !== null && member.role !== query.role) {
        return false;
      }
      if (!matchesStatus(member, query.status)) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        member.full_name_display,
        member.full_name,
        member.username,
        member.user_email,
        member.email,
        member.role_name,
      ].some((value) => value?.toLocaleLowerCase().includes(search));
    });
  });
  readonly hasActiveFilters = computed(() => {
    const query = this.queryState();
    return query.search.length > 0 || query.role !== null || query.status !== 'all';
  });

  loadProject(projectId: TaigaId): void {
    if (this.projectIdState() === projectId && this.statusState() !== 'error') {
      return;
    }

    this.projectIdState.set(projectId);
    this.membershipsState.set([]);
    this.queryState.set(DEFAULT_TEAM_QUERY);
    this.startRequest();
    const revision = ++this.requestRevision;

    this.api.listMemberships(projectId).subscribe({
      next: (memberships) => {
        if (revision !== this.requestRevision) {
          return;
        }
        this.membershipsState.set(sortMemberships(memberships));
        this.statusState.set('loaded');
      },
      error: () => this.fail(revision),
    });
  }

  setSearch(search: string): void {
    this.queryState.update((query) => ({ ...query, search: search.trim() }));
  }

  setRole(role: TaigaId | null): void {
    this.queryState.update((query) => ({ ...query, role }));
  }

  setStatus(status: TeamStatusFilter): void {
    this.queryState.update((query) => ({ ...query, status }));
  }

  clearFilters(): void {
    this.queryState.set(DEFAULT_TEAM_QUERY);
  }

  retry(): void {
    const projectId = this.projectIdState();
    if (projectId === null) {
      return;
    }
    this.projectIdState.set(null);
    this.loadProject(projectId);
  }

  private startRequest(): void {
    this.statusState.set('loading');
    this.errorState.set(null);
  }

  private fail(revision: number): void {
    if (revision !== this.requestRevision) {
      return;
    }
    this.statusState.set('error');
    this.errorState.set('Team members could not be loaded. Check the connection and try again.');
  }
}

function sortMemberships(memberships: readonly TaigaMembership[]): readonly TaigaMembership[] {
  return [...memberships].sort((left, right) => {
    const rankDifference = memberRank(left) - memberRank(right);
    if (rankDifference !== 0) {
      return rankDifference;
    }
    return displayName(left).localeCompare(displayName(right));
  });
}

function memberRank(member: TaigaMembership): number {
  if (member.is_owner) return 0;
  if (member.is_admin) return 1;
  if (isActiveMember(member)) return 2;
  if (member.user !== null) return 3;
  return 4;
}

function displayName(member: TaigaMembership): string {
  return (
    member.full_name_display ||
    member.full_name ||
    member.username ||
    member.user_email ||
    member.email ||
    'Pending member'
  );
}

function isActiveMember(member: TaigaMembership): boolean {
  return member.user !== null && member.is_user_active;
}

function matchesStatus(member: TaigaMembership, status: TeamStatusFilter): boolean {
  switch (status) {
    case 'active':
      return isActiveMember(member);
    case 'inactive':
      return member.user !== null && !member.is_user_active;
    case 'pending':
      return member.user === null;
    default:
      return true;
  }
}
