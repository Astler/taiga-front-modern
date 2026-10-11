import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { TaigaId } from '../../../shared/models';
import { IssuesApiService, type IssueAttachment } from '../data';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pf-issue-attachments',
  templateUrl: './issue-attachments.html',
  styleUrl: './issue-attachments.scss',
})
export class IssueAttachments implements OnDestroy {
  readonly projectId = input.required<TaigaId>();
  readonly issueId = input<TaigaId | null>(null);
  readonly canManage = input(false);
  readonly busy = input(false);
  readonly stagedFilesChanged = output<readonly File[]>();

  private readonly api = inject(IssuesApiService);
  private readonly refreshRevision = signal(0);
  private readonly previewUrls = new Map<File, string>();

  // Staged files are not sent to Taiga until the issue has been created.
  readonly stagedFiles = signal<readonly File[]>([]);
  protected readonly attachments = signal<readonly IssueAttachment[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);
  protected readonly processing = signal(false);
  protected readonly failedUploads = signal<readonly File[]>([]);

  constructor() {
    effect((onCleanup) => {
      this.refreshRevision();
      const projectId = this.projectId();
      const issueId = this.issueId();
      this.loadError.set(null);

      if (issueId === null) {
        this.attachments.set([]);
        this.loading.set(false);
        return;
      }

      this.loading.set(true);
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

  ngOnDestroy(): void {
    for (const url of this.previewUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.previewUrls.clear();
  }

  protected retry(): void {
    this.refreshRevision.update((revision) => revision + 1);
  }

  protected pickFiles(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    this.addFiles(files);
  }

  /** Called by the file picker and by the editor's clipboard paste handler. */
  addFiles(files: readonly File[]): void {
    if (!files.length || !this.canManage() || this.busy() || this.processing()) return;

    if (this.issueId() !== null) {
      void this.uploadFiles(files);
      return;
    }

    for (const file of files) {
      if (file.type.startsWith('image/') && typeof URL.createObjectURL === 'function') {
        this.previewUrls.set(file, URL.createObjectURL(file));
      }
    }
    const staged = [...this.stagedFiles(), ...files];
    this.stagedFiles.set(staged);
    this.stagedFilesChanged.emit(staged);
  }

  protected removeStaged(index: number): void {
    if (!this.canManage() || this.busy() || this.processing()) return;
    const staged = [...this.stagedFiles()];
    const [removed] = staged.splice(index, 1);
    if (!removed) return;
    const url = this.previewUrls.get(removed);
    if (url) URL.revokeObjectURL(url);
    this.previewUrls.delete(removed);
    this.stagedFiles.set(staged);
    this.stagedFilesChanged.emit(staged);
  }

  protected previewFor(file: File): string | null {
    return this.previewUrls.get(file) ?? null;
  }

  protected retryFailedUploads(): void {
    if (this.failedUploads().length) void this.uploadFiles(this.failedUploads());
  }

  private async uploadFiles(files: readonly File[]): Promise<void> {
    const issueId = this.issueId();
    if (issueId === null || this.processing() || !this.canManage() || this.busy()) return;

    this.processing.set(true);
    this.actionError.set(null);
    const failed: File[] = [];
    try {
      for (const file of files) {
        try {
          await firstValueFrom(this.api.uploadAttachment(this.projectId(), issueId, file));
        } catch {
          failed.push(file);
        }
      }
      this.failedUploads.set(failed);
      if (failed.length) {
        this.actionError.set('Could not upload ' + failed.length + ' file(s).');
      }
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
