import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalTopLayerDirective } from './modal-top-layer.directive';

@Component({
  standalone: true,
  imports: [ModalTopLayerDirective],
  template: '<dialog pfModalTopLayer aria-label="Editor"><button type="button">Close</button></dialog>',
})
class ModalHost {}

describe('ModalTopLayerDirective', () => {
  let originalShowModal: PropertyDescriptor | undefined;
  let originalClose: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalShowModal = Object.getOwnPropertyDescriptor(
      HTMLDialogElement.prototype,
      'showModal',
    );
    originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
    TestBed.configureTestingModule({ imports: [ModalHost] });
  });

  afterEach(() => {
    restoreDialogMethod('showModal', originalShowModal);
    restoreDialogMethod('close', originalClose);
  });

  it('opens and closes the browser modal top layer when supported', () => {
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    const close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: close,
    });

    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(showModal).toHaveBeenCalledOnce();

    fixture.destroy();
    expect(close).toHaveBeenCalledOnce();
    expect(dialog.open).toBe(false);
  });

  it('keeps the editor usable if showModal is unavailable in the DOM', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: undefined,
    });

    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    fixture.destroy();
    expect(dialog.open).toBe(false);
  });
});

function restoreDialogMethod(
  name: 'showModal' | 'close',
  previous: PropertyDescriptor | undefined,
): void {
  if (previous) {
    Object.defineProperty(HTMLDialogElement.prototype, name, previous);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
}
