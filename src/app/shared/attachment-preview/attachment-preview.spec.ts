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
  it('recognises image/video names without treating ordinary files as images', () => {
    expect(attachmentMediaKind('shot.PNG?token=1')).toBe('image');
    expect(attachmentMediaKind('clip.webm')).toBe('video');
    expect(attachmentMediaKind('data.zip')).toBeNull();
    expect(attachmentMediaKind('project.psd')).toBeNull();
  });
});
