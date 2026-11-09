import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { ModalTopLayerDirective } from '../modal-top-layer.directive';

export type AttachmentMediaKind = 'image' | 'video';
export interface AttachmentGalleryImage {
  readonly id: number;
  readonly name: string;
  readonly src: string;
  readonly downloadUrl: string | null;
}
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
  readonly images = input<readonly AttachmentGalleryImage[]>([]);
  readonly imageId = input<number | null>(null);
  readonly imageSelected = output<number>();
  readonly closed = output<void>();
  protected readonly imageIndex = computed(() =>
    this.images().findIndex((image) => image.id === this.imageId()),
  );
  protected readonly hasGallery = computed(
    () => this.kind() === 'image' && this.images().length > 1 && this.imageIndex() >= 0,
  );
  protected readonly canSwipe = computed(() => this.hasGallery() && !this.zoomed());
  private swipeStart: { id: number; x: number; y: number } | null = null;
  protected readonly failed = signal(false);
  protected readonly loaded = signal(false);
  protected readonly zoomed = signal(false);

  constructor() {
    effect(() => {
      this.src();
      this.imageId();
      this.swipeStart = null;
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
    if (
      this.hasGallery() &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault();
      this.navigate(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  protected navigate(direction: -1 | 1): void {
    if (!this.hasGallery()) return;
    const images = this.images();
    const index = (this.imageIndex() + direction + images.length) % images.length;
    this.imageSelected.emit(images[index]!.id);
  }
  protected pointerDown(event: PointerEvent): void {
    if (!this.canSwipe() || event.pointerType !== 'touch' || !event.isPrimary) {
      this.swipeStart = null;
      return;
    }
    this.swipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  protected pointerUp(event: PointerEvent): void {
    const start = this.swipeStart;
    this.swipeStart = null;
    if (!start || !this.canSwipe() || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    // Ignore taps and vertical scrolling. Zoomed images retain normal two-axis panning.
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      event.preventDefault();
      this.navigate(dx < 0 ? 1 : -1);
    }
  }
  protected pointerCancel(): void {
    this.swipeStart = null;
  }
  protected retry(): void {
    this.failed.set(false);
    this.loaded.set(false);
  }
}
