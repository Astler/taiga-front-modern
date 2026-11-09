import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface DashboardMetric {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone: 'primary' | 'tertiary' | 'warning' | 'error';
}

@Component({
  selector: 'pf-dashboard-metrics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dashboard-metrics.scss',
  template: `
    <div class="metrics" role="group" [attr.aria-label]="label()">
      @for (metric of metrics(); track metric.label) {
        <article class="metric-card" [attr.data-tone]="metric.tone">
          <div class="metric-heading">
            <span class="metric-indicator" aria-hidden="true"></span>
            <span>{{ metric.label }}</span>
          </div>
          <strong>{{ metric.value }}</strong>
          <small>{{ metric.detail }}</small>
        </article>
      }
    </div>
  `,
})
export class DashboardMetrics {
  readonly metrics = input.required<readonly DashboardMetric[]>();
  readonly label = input('Dashboard summary');
}
