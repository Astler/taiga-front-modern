import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StoryEditorLayoutService,
  type StoryEditorLayoutMode,
} from '../../shared/story-editor-layout.service';
import { ProfilePanel } from './profile-panel';

describe('ProfilePanel', () => {
  const layoutMode = signal<StoryEditorLayoutMode>('auto');
  const syncState = signal<'synced' | 'saving' | 'loading' | 'local'>('synced');
  const setMode = vi.fn((mode: StoryEditorLayoutMode) => layoutMode.set(mode));

  beforeEach(async () => {
    layoutMode.set('auto');
    syncState.set('synced');
    setMode.mockClear();
    await TestBed.configureTestingModule({
      imports: [ProfilePanel],
      providers: [{
        provide: StoryEditorLayoutService,
        useValue: {
          mode: layoutMode.asReadonly(),
          syncState: syncState.asReadonly(),
          setMode,
        },
      }],
    }).compileComponents();
  });

  it('renders real styled selection cards, not Material menu items', () => {
    const fixture = TestBed.createComponent(ProfilePanel);
    fixture.componentRef.setInput('name', 'Ada Lovelace');
    fixture.componentRef.setInput('username', 'ada');
    fixture.componentRef.setInput('initials', 'AL');
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const panel = host.querySelector<HTMLElement>('.profile-panel')!;
    const radios = [...host.querySelectorAll<HTMLButtonElement>('.profile-layout-card')];

    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.querySelector('.profile-panel-person')?.textContent).toContain('Ada Lovelace');
    expect(getComputedStyle(panel).display).toBe('block');
    expect(radios).toHaveLength(3);
    expect(getComputedStyle(radios[0]!).display).toBe('grid');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual([
      'true', 'false', 'false',
    ]);
    expect(radios[0]!.getAttribute('tabindex')).toBe('0');
    expect(radios[1]!.getAttribute('tabindex')).toBe('-1');

    radios[1]!.click();
    fixture.detectChanges();
    expect(setMode).toHaveBeenCalledWith('side');
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true');
    expect(radios[1]!.getAttribute('tabindex')).toBe('0');
  });

  it('uses arrow keys for choosing a layout and emits sign-out', async () => {
    const fixture = TestBed.createComponent(ProfilePanel);
    fixture.componentRef.setInput('name', 'Ada');
    fixture.componentRef.setInput('username', 'ada');
    fixture.componentRef.setInput('initials', 'AL');
    let logouts = 0;
    fixture.componentInstance.logoutRequested.subscribe(() => { logouts++; });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const auto = host.querySelector<HTMLButtonElement>('[data-layout="auto"]')!;
    auto.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight', bubbles: true, cancelable: true,
    }));
    fixture.detectChanges();
    await Promise.resolve();
    expect(layoutMode()).toBe('side');
    expect(host.querySelector<HTMLButtonElement>('[data-layout="side"]')?.getAttribute('aria-checked'))
      .toBe('true');

    host.querySelector<HTMLButtonElement>('.profile-logout')!.click();
    expect(logouts).toBe(1);
  });
});
