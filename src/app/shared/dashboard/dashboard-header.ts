import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'pf-dashboard-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule],
  styleUrl: './dashboard-header.scss',
  template: `
    <header class="page-header">
      <h1 [id]="titleId()">{{ heading() }}</h1>
      <button
        mat-icon-button
        type="button"
        class="refresh-button"
        [attr.aria-label]="busy() ? 'Refreshing dashboard' : 'Refresh dashboard'"
        title="Refresh dashboard"
        [disabled]="busy()"
        (click)="refreshRequested.emit()"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
        </svg>
      </button>
    </header>
  `,
})
export class DashboardHeader {
  readonly heading = input.required<string>();
  readonly titleId = input('dashboard-title');
  readonly busy = input(false);
  readonly refreshRequested = output<void>();
}
