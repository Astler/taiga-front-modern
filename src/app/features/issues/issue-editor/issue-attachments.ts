import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { IssuesApiService, type IssueAttachment } from '../data';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pf-issue-attachments',
  templateUrl: './issue-attachments.html',
  styleUrl: './issue-attachments.scss',
})
export class IssueAttachments {
  readonly projectId = input.required<TaigaId>();
  readonly issueId = input.required<TaigaId>();
  readonly canManage = input(false);
  readonly busy = input(false);

  private readonly api = inject(IssuesApiService);
  private readonly refreshRevision = signal(0);

  protected readonly attachments = signal<readonly IssueAttachment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly processing = signal(false);

  constructor() {
    effect((onCleanup) => {
      this.refreshRevision();
      const projectId = this.projectId();
      const issueId = this.issueId();
      this.loading.set(true);
      this.loadError.set(null);

      const subscription = this.api.listAttachments(projectId, issueId).subscribe({
        next: (attachments) => {
          this.attachments.set(attachments);
          this.loading.set(false);
        },
        error: () => {
          this.attachments.set([]);
          this.loadError.set('Could not load attachments.');
          this.loading.set(false);
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  protected retry(): void {
    this.refreshRevision.update((revision) => revision + 1);
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Also allow choosing the same file again after an upload failure.
    input.value = '';
    if (!files.length || !this.canManage() || this.busy() || this.processing()) return;

    const projectId = this.projectId();
    const issueId = this.issueId();
    this.processing.set(true);
    this.actionError.set(null);
    let completed = 0;

    try {
      for (const file of files) {
        await firstValueFrom(this.api.uploadAttachment(projectId, issueId, file));
        completed++;
      }
    } catch {
      this.actionError.set(completed
        ? 'Some files were uploaded, but others failed. Please retry the remaining files.'
        : 'Upload failed. Please try again.');
    } finally {
      this.processing.set(false);
      this.retry();
    }
  }

  protected async remove(attachment: IssueAttachment): Promise<void> {
    if (!this.canManage() || this.busy() || this.processing()) return;
    if (!globalThis.confirm('Remove attachment "' + attachment.name + '"?')) return;

    this.processing.set(true);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.api.deleteAttachment(attachment.id));
      this.retry();
    } catch {
      this.actionError.set('Could not remove the file. Please try again.');
    } finally {
      this.processing.set(false);
    }
  }

  protected fileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }
}
