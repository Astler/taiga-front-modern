import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { TaigaId } from '../../../shared/models';
import type { TaigaProjectDetail } from '../../projects/data';
import { TeamStore, type TaigaMembership, type TeamStatusFilter } from '../data';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, MatTooltipModule],
  providers: [TeamStore],
  selector: 'pf-team-workspace',
  styleUrl: './team-workspace.scss',
  templateUrl: './team-workspace.html',
})
export class TeamWorkspace {
  readonly project = input.required<TaigaProjectDetail>();

  protected readonly store = inject(TeamStore);
  private loadedProjectId: TaigaId | null = null;

  constructor() {
    effect(() => {
      const projectId = this.project().id;
      untracked(() => {
        if (projectId === this.loadedProjectId) {
          return;
        }
        this.loadedProjectId = projectId;
        this.store.loadProject(projectId);
      });
    });
  }

  protected updateSearch(event: Event): void {
    this.store.setSearch((event.target as HTMLInputElement).value);
  }

  protected updateRole(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.store.setRole(value === '' ? null : Number(value));
  }

  protected updateStatus(event: Event): void {
    this.store.setStatus((event.target as HTMLSelectElement).value as TeamStatusFilter);
  }

  protected displayName(member: TaigaMembership): string {
    return (
      member.full_name_display ||
      member.full_name ||
      member.username ||
      member.user_email ||
      member.email ||
      'Pending member'
    );
  }

  protected memberEmail(member: TaigaMembership): string {
    return member.user_email || member.email || '';
  }

  protected initials(member: TaigaMembership): string {
    const source = this.displayName(member);
    return source
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase();
  }

  protected memberStatus(member: TaigaMembership): string {
    if (member.user === null) {
      return 'Invitation pending';
    }
    return member.is_user_active ? 'Active' : 'Inactive';
  }
}
