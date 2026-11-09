import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { AttachmentPreview, attachmentMediaKind } from './attachment-preview';

describe('AttachmentPreview', () => {
  function create(kind: 'image' | 'video' = 'image') {
    TestBed.configureTestingModule({ imports: [AttachmentPreview] });
    const fixture = TestBed.createComponent(AttachmentPreview);
    fixture.componentRef.setInput('name', 'Screenshot.png');
    fixture.componentRef.setInput('src', '/media/image.png?token=signed');
    fixture.componentRef.setInput('downloadUrl', '/media/original.png');
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }
  it('embeds the image and exposes a separate explicit download', () => {
    const { host } = create();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/media/image.png?token=signed');
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe('/media/original.png');
    expect(host.querySelector('a[download]')?.getAttribute('download')).toBe('Screenshot.png');
  });
  it('closes only the preview on Escape without triggering editor shortcuts', () => {
    const { fixture, host } = create(),
      closed = vi.fn(),
      underlying = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    host.addEventListener('keydown', underlying);
    host
      .querySelector('dialog')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    expect(closed).toHaveBeenCalledOnce();
    expect(underlying).not.toHaveBeenCalled();
  });
  it('supports actual size and recovers from image load failure', () => {
    const { fixture, host } = create();
    host.querySelector<HTMLButtonElement>('[aria-label="Show image at actual size"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.is-zoomed')).toBeTruthy();
    host.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Could not display');
    host.querySelector<HTMLButtonElement>('.preview-error button')!.click();
    fixture.detectChanges();
    expect(host.querySelector('img')).toBeTruthy();
  });
  it('does not close when the image is clicked and supports video playback', () => {
    const { fixture, host } = create('video'),
      closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    host.querySelector('video')!.click();
    expect(closed).not.toHaveBeenCalled();
    expect(host.querySelector('video')?.hasAttribute('controls')).toBe(true);
  });
  function createGallery() {
    const { fixture, host } = create();
    const images = [1, 2, 3].map((id) => ({
      id,
      name: 'image-' + id + '.png',
      src: '/image-' + id + '.png',
      downloadUrl: '/original-' + id + '.png',
    }));
    fixture.componentRef.setInput('images', images);
    const select = (id: number) => {
      const image = images.find((item) => item.id === id)!;
      fixture.componentRef.setInput('imageId', id);
      fixture.componentRef.setInput('name', image.name);
      fixture.componentRef.setInput('src', image.src);
      fixture.componentRef.setInput('downloadUrl', image.downloadUrl);
    };
    select(1);
    const selected = vi.fn();
    fixture.componentInstance.imageSelected.subscribe((id) => {
      selected(id);
      select(id);
    });
    fixture.detectChanges();
    const pointer = (type: string, x: number, y: number, options = {}) => {
      const event = Object.assign(
        new Event(type, { bubbles: true, cancelable: true }),
        { clientX: x, clientY: y, pointerType: 'touch', isPrimary: true, pointerId: 1 },
        options,
      );
      host.querySelector('.attachment-lightbox-media')!.dispatchEvent(event);
      fixture.detectChanges();
    };
    return { fixture, host, selected, pointer };
  }
  it('navigates with buttons and arrow keys, wraps, and updates image, filename and download together', () => {
    const { fixture, host } = createGallery();
    const dialog = host.querySelector('dialog')!;
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(host.querySelector('.attachment-gallery-nav span')?.textContent).toContain('3 / 3');
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    expect(host.querySelector('.attachment-gallery-nav span')?.textContent).toContain('1 / 3');
    host.querySelector<HTMLButtonElement>('[aria-label="Next image"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/image-2.png');
    expect(host.querySelector('strong')?.textContent).toBe('image-2.png');
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe('/original-2.png');
    host.querySelector<HTMLButtonElement>('[aria-label="Previous image"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.attachment-gallery-nav span')?.textContent).toContain('1 / 3');
  });
  it('switches touch swipes in both directions without closing the preview', () => {
    const { fixture, selected, pointer } = createGallery(),
      closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    pointer('pointerdown', 200, 100);
    pointer('pointerup', 80, 110);
    expect(selected).toHaveBeenLastCalledWith(2);
    pointer('pointerdown', 80, 100);
    pointer('pointerup', 200, 105);
    expect(selected).toHaveBeenLastCalledWith(1);
    expect(closed).not.toHaveBeenCalled();
  });
  it('ignores taps, vertical gestures, cancelled gestures, mouse drags and pinch gestures', () => {
    const { selected, pointer } = createGallery();
    pointer('pointerdown', 200, 100);
    pointer('pointerup', 180, 105);
    pointer('pointerdown', 200, 100);
    pointer('pointerup', 100, 250);
    pointer('pointerdown', 200, 100);
    pointer('pointercancel', 200, 100);
    pointer('pointerup', 80, 100);
    pointer('pointerdown', 200, 100, { pointerType: 'mouse' });
    pointer('pointerup', 80, 100, { pointerType: 'mouse' });
    pointer('pointerdown', 200, 100);
    pointer('pointerdown', 250, 100, { pointerId: 2, isPrimary: false });
    pointer('pointerup', 80, 100);
    expect(selected).not.toHaveBeenCalled();
  });
  it('keeps touch panning at actual size and resets zoom on keyboard navigation', () => {
    const { fixture, host, selected, pointer } = createGallery();
    host.querySelector<HTMLButtonElement>('[aria-label="Show image at actual size"]')!.click();
    fixture.detectChanges();
    expect(host.querySelector('.can-swipe')).toBeNull();
    pointer('pointerdown', 200, 100);
    pointer('pointerup', 80, 100);
    expect(selected).not.toHaveBeenCalled();
    host
      .querySelector('dialog')!
      .dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
      );
    fixture.detectChanges();
    expect(selected).toHaveBeenCalledWith(2);
    expect(host.querySelector('.is-zoomed')).toBeNull();
  });
  it('hides gallery controls for a single image and leaves video arrow controls alone', () => {
    const { fixture, host } = create();
    expect(host.querySelector('.attachment-gallery-nav')).toBeNull();
    fixture.componentRef.setInput('images', [
      { id: 1, name: 'a.png', src: '/a.png', downloadUrl: null },
      { id: 2, name: 'b.png', src: '/b.png', downloadUrl: null },
    ]);
    fixture.componentRef.setInput('imageId', 1);
    fixture.componentRef.setInput('kind', 'video');
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
      cancelable: true,
    });
    host.querySelector('video')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(host.querySelector('.attachment-gallery-nav')).toBeNull();
  });
  it('recognises image/video names without treating ordinary files as images', () => {
    expect(attachmentMediaKind('shot.PNG?token=1')).toBe('image');
    expect(attachmentMediaKind('clip.webm')).toBe('video');
    expect(attachmentMediaKind('data.zip')).toBeNull();
    expect(attachmentMediaKind('project.psd')).toBeNull();
  });
});
