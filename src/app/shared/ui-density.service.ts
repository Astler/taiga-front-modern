import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

export type UiDensity = 'comfortable' | 'compact';
const STORAGE_KEY = 'taiga-modern:compact-mode';

@Injectable({ providedIn: 'root' })
export class UiDensityService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modeState = signal<UiDensity>(this.readMode());
  readonly mode = this.modeState.asReadonly();
  readonly compact = computed(() => this.modeState() === 'compact');

  constructor() {
    this.applyMode();
    const window = this.document.defaultView;
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        this.modeState.set(this.readMode());
        this.applyMode();
      }
    };
    window?.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window?.removeEventListener('storage', onStorage));
  }

  setMode(mode: UiDensity): void {
    this.modeState.set(mode);
    this.applyMode();
    try {
      this.document.defaultView?.localStorage.setItem(STORAGE_KEY, String(mode === 'compact'));
    } catch {
      // Keep the preference working for this session when storage is unavailable.
    }
  }

  private readMode(): UiDensity {
    try {
      return this.document.defaultView?.localStorage.getItem(STORAGE_KEY) === 'true'
        ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  }

  private applyMode(): void {
    this.document.documentElement.setAttribute('data-ui-density', this.modeState());
  }
}
