import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { ModalTopLayerDirective } from '../modal-top-layer.directive';

export type AttachmentMediaKind = 'image' | 'video';
export function attachmentMediaKind(name: string): AttachmentMediaKind | null {
  const path = name.split(/[?#]/, 1)[0] ?? '';
  if (/\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i.test(path)) return 'image';
  if (/\.(mp4|webm|ogv|ogg|mov)$/i.test(path)) return 'video';
  return null;
}

@Component({
  selector: 'pf-attachment-preview',
  imports: [ModalTopLayerDirective],
  templateUrl: './attachment-preview.html',
  styleUrl: './attachment-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttachmentPreview {
  readonly name = input.required<string>();
  readonly src = input.required<string>();
  readonly downloadUrl = input<string | null>(null);
  readonly kind = input<AttachmentMediaKind>('image');
  readonly closed = output<void>();
  protected readonly failed = signal(false);
  protected readonly loaded = signal(false);
  protected readonly zoomed = signal(false);

  constructor() {
    effect(() => {
      this.src();
      this.failed.set(false);
      this.loaded.set(false);
      this.zoomed.set(false);
    });
  }

  protected close(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.closed.emit();
  }
  protected backdropClick(event: MouseEvent): void {
    event.stopPropagation();
    if (event.target === event.currentTarget) this.close();
  }
  protected keydown(event: KeyboardEvent): void {
    // Keep shortcuts in the underlying issue/story editor from consuming preview keys.
    event.stopPropagation();
    if (event.key === 'Escape') this.close(event);
  }
  protected retry(): void {
    this.failed.set(false);
    this.loaded.set(false);
  }
}
