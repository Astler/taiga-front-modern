import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ShellProjectContext } from '../project-context/shell-project-context';

interface DashboardMetric {
  readonly change: string;
  readonly label: string;
  readonly tone: 'primary' | 'tertiary' | 'warning';
  readonly value: string;
}

interface DashboardActivity {
  readonly actor: string;
  readonly detail: string;
  readonly initials: string;
  readonly time: string;
  readonly title: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule],
  selector: 'pf-dashboard-placeholder',
  styleUrl: './dashboard-placeholder.scss',
  templateUrl: './dashboard-placeholder.html',
})
export class DashboardPlaceholder {
  protected readonly projectContext = inject(ShellProjectContext);
  protected readonly pageTitle: string;
  protected readonly pageDescription: string;

  protected readonly metrics: readonly DashboardMetric[] = [
    { change: '+8 this week', label: 'Open stories', tone: 'primary', value: '42' },
    { change: '4 ready now', label: 'In progress', tone: 'warning', value: '16' },
    { change: '73% completion', label: 'Sprint health', tone: 'tertiary', value: 'Good' },
  ];

  protected readonly activities: readonly DashboardActivity[] = [
    {
      actor: 'Vlady',
      detail: 'moved a story to Ready for test',
      initials: 'VP',
      time: '8 min',
      title: '#138 Remove PostProc',
    },
    {
      actor: 'Nadia',
      detail: 'commented on an issue',
      initials: 'NA',
      time: '24 min',
      title: '#22 Sound of puzzle pieces moving',
    },
    {
      actor: 'Maks',
      detail: 'closed an achievement task',
      initials: 'MK',
      time: '1 hr',
      title: '#132 Shared edge case',
    },
  ];

  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.pageTitle = (this.route.snapshot.data['title'] as string | undefined) ?? 'Overview';
    this.pageDescription =
      (this.route.snapshot.data['description'] as string | undefined) ??
      'A focused view of what is moving, what needs attention, and what comes next.';
  }
}
