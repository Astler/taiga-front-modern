import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { UiDensityService, type UiDensity } from '../../shared/ui-density.service';
import {
  StoryEditorLayoutService,
  type StoryEditorLayoutMode,
} from '../../shared/story-editor-layout.service';

interface EditorLayoutOption {
  readonly value: StoryEditorLayoutMode;
  readonly label: string;
  readonly description: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pf-profile-panel',
  styleUrl: './profile-panel.scss',
  templateUrl: './profile-panel.html',
})
export class ProfilePanel {
  readonly name = input.required<string>();
  readonly initials = input.required<string>();
  readonly username = input<string>('');
  readonly logoutRequested = output<void>();

  protected readonly editorLayout = inject(StoryEditorLayoutService);
  protected readonly density = inject(UiDensityService);
  protected readonly densityOptions: readonly { value: UiDensity; label: string; description: string }[] = [
    { value: 'comfortable', label: 'Comfortable', description: 'More room between items' },
    { value: 'compact', label: 'Compact', description: 'Less spacing across all screens' },
  ];
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly editorLayoutOptions: readonly EditorLayoutOption[] = [
    { value: 'auto', label: 'Auto', description: 'Fullscreen on smaller screens' },
    { value: 'side', label: 'Side panel', description: 'Always docked on the right' },
    { value: 'fullscreen', label: 'Fullscreen', description: 'Always full screen' },
  ];

  protected handleLayoutKeydown(event: KeyboardEvent): void {
    const delta =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0;
    if (delta === 0) {
      return;
    }

    event.preventDefault();
    const selectedIndex = this.editorLayoutOptions.findIndex(
      ({ value }) => value === this.editorLayout.mode(),
    );
    const nextIndex =
      (selectedIndex + delta + this.editorLayoutOptions.length) %
      this.editorLayoutOptions.length;
    const nextMode = this.editorLayoutOptions[nextIndex]!.value;
    this.editorLayout.setMode(nextMode);

    queueMicrotask(() => {
      this.element.nativeElement
        .querySelector<HTMLButtonElement>(`[data-layout="${nextMode}"]`)
        ?.focus();
    });
  }

  protected handleDensityKeydown(event: KeyboardEvent): void {
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(event.key)) return;
    event.preventDefault();
    const next = this.density.compact() ? 'comfortable' : 'compact';
    this.density.setMode(next);
    queueMicrotask(() => this.element.nativeElement
      .querySelector<HTMLButtonElement>(`[data-density="${next}"]`)?.focus());
  }
}
