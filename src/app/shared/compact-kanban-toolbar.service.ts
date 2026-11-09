import { Injectable, inject, signal, type Signal } from '@angular/core';
import { UiDensityService } from './ui-density.service';

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
  readonly sortOptions: Signal<readonly CompactKanbanSortOption[]>;
  readonly totalCount: Signal<number>;
  readonly applyAllWork: () => void;
  readonly applyBlocked: () => void;
  readonly applyMyWork: () => void;
  readonly applyOverdue: () => void;
  readonly applyUnassigned: () => void;
  readonly selectSort: (mode: string) => void;
  readonly setQuery: (query: string) => void;
  readonly toggleFilters: () => void;
}

@Injectable({ providedIn: 'root' })
export class CompactKanbanToolbarService {
  private readonly activeToolbar = signal<CompactKanbanToolbar | null>(null);
  private readonly density = inject(UiDensityService);

  readonly toolbar = this.activeToolbar.asReadonly();
  readonly compactMode = this.density.compact;

  toggleCompactMode(): void {
    this.density.setMode(this.density.compact() ? 'comfortable' : 'compact');
  }

  connect(toolbar: CompactKanbanToolbar): () => void {
    this.activeToolbar.set(toolbar);
    return () => {
      if (this.activeToolbar() === toolbar) {
        this.activeToolbar.set(null);
      }
    };
  }

}
