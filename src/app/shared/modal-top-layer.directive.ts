import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Promotes a native dialog to the browser's modal top layer.
 *
 * CSS z-index cannot place a fixed child of mat-sidenav-content above the
 * sibling sidebar: Material transforms the content into a stacking context.
 * showModal() escapes both that context and ancestor overflow clipping
 * without moving the Angular view or losing the editor draft.
 */
@Directive({
  selector: 'dialog[pfModalTopLayer]',
  standalone: true,
})
export class ModalTopLayerDirective implements AfterViewInit, OnDestroy {
  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private shownAsModal = false;

  ngAfterViewInit(): void {
    if (typeof this.dialog.showModal === 'function') {
      try {
        this.dialog.showModal();
        this.shownAsModal = true;
        return;
      } catch {
        // Non-modal fallback for browsers/test DOMs without a working top layer.
      }
    }
    this.dialog.setAttribute('open', '');
  }

  ngOnDestroy(): void {
    if (this.shownAsModal && this.dialog.open && typeof this.dialog.close === 'function') {
      this.dialog.close();
    }
    this.dialog.removeAttribute('open');
  }
}
