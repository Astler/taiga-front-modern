import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { IssueComment } from '../data/issues.models';

@Component({
  selector: 'pf-issue-discussion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './issue-discussion.html',
  styleUrl: './issue-discussion.scss',
})
export class IssueDiscussion {
  readonly comments = input<readonly IssueComment[]>([]);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly canComment = input(false);
  readonly busy = input(false);
  readonly blocked = input(false);
  readonly sentRevision = input(0);
  readonly send = output<string>();
  readonly retry = output<void>();
  readonly draft = signal('');

  constructor() {
    effect(() => {
      this.sentRevision();
      this.draft.set('');
    });
  }

  protected submit(): void {
    if (!this.canComment() || this.busy() || this.blocked() || !this.draft().trim()) return;
    this.send.emit(this.draft().trim());
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.submit();
    }
  }
}
