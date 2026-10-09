import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal, type Signal } from '@angular/core';

export interface CompactKanbanSortOption {
  readonly label: string;
  readonly value: string;
}

export interface CompactKanbanToolbar {
  readonly activeFilterCount: Signal<number>;
  readonly activePresetId: Signal<string | null>;
  readonly filterPanelOpen: Signal<boolean>;
  readonly hasActiveFilters: Signal<boolean>;
  readonly hasMyWork: Signal<boolean>;
  readonly matchingCount: Signal<number>;
  readonly openCount: Signal<number>;
  readonly query: Signal<string>;
  readonly sortLabel: Signal<string>;
  readonly sortMode: Signal<string>;
  readonly sortOptions: readonly CompactKanbanSortOption[];
  readonly totalCount: Signal<number>;
  readonly applyAllWork: () => void;
  readonly applyMyWork: () => void;
  readonly selectSort: (mode: string) => void;
  readonly setQuery: (query: string) => void;
  readonly toggleFilters: () => void;
}

@Injectable({ providedIn: 'root' })
export class CompactKanbanToolbarService {
  private readonly activeToolbar = signal<CompactKanbanToolbar | null>(null);
  private readonly document = inject(DOCUMENT);
  private readonly compactState = signal(readCompactMode());

  readonly toolbar = this.activeToolbar.asReadonly();
  readonly compactMode = this.compactState.asReadonly();

  constructor() {
    this.applyCompactMode(this.compactState());
  }

  toggleCompactMode(): void {
    const compact = !this.compactState();
    this.compactState.set(compact);
    this.applyCompactMode(compact);
    persistCompactMode(compact);
  }

  connect(toolbar: CompactKanbanToolbar): () => void {
    this.activeToolbar.set(toolbar);
    return () => {
      if (this.activeToolbar() === toolbar) {
        this.activeToolbar.set(null);
      }
    };
  }

  private applyCompactMode(compact: boolean): void {
    this.document.documentElement.setAttribute(
      'data-ui-density',
      compact ? 'compact' : 'comfortable',
    );
  }
}

const COMPACT_MODE_STORAGE_KEY = 'taiga-modern:compact-mode';

function readCompactMode(): boolean {
  try {
    return globalThis.localStorage?.getItem(COMPACT_MODE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function persistCompactMode(compact: boolean): void {
  try {
    globalThis.localStorage?.setItem(COMPACT_MODE_STORAGE_KEY, String(compact));
  } catch {
    // Density remains available for the current session when storage is unavailable.
  }
}
