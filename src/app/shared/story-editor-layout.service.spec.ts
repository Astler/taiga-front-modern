import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, AuthTokenStorage } from '../core/auth';
import { RuntimeConfigService } from '../core/config';
import {
  STORY_EDITOR_LAYOUT_STORAGE,
  StoryEditorLayoutService,
  parseStoryEditorLayoutMode,
} from './story-editor-layout.service';

describe('StoryEditorLayoutService', () => {
  const user = signal<{ id: number } | null>({ id: 7 });
  const session = signal(1);
  const local = new Map<string, string>();
  const viewportListeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches: false,
    addEventListener: (_event: string, callback: (event: MediaQueryListEvent) => void) => {
      viewportListeners.add(callback);
    },
    removeEventListener: (_event: string, callback: (event: MediaQueryListEvent) => void) => {
      viewportListeners.delete(callback);
    },
  };
  let service: StoryEditorLayoutService;
  let http: HttpTestingController;

  beforeEach(() => {
    user.set({ id: 7 });
    session.set(1);
    local.clear();
    media.matches = false;
    viewportListeners.clear();
    vi.stubGlobal('matchMedia', vi.fn(() => media));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: user.asReadonly() } },
        { provide: AuthTokenStorage, useValue: { revision: session.asReadonly() } },
        { provide: RuntimeConfigService, useValue: {
          resolveApiPath: (path: string) => `/api/v1/${path}`,
        } },
        { provide: STORY_EDITOR_LAYOUT_STORAGE, useValue: {
          getItem: (key: string) => local.get(key) ?? null,
          setItem: (key: string, value: string) => { local.set(key, value); },
        } },
      ],
    });
    service = TestBed.inject(StoryEditorLayoutService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('automatically expands on smaller screens and follows viewport changes', () => {
    http.expectOne('/api/v1/user-storage/pressf-story-editor-layout')
      .flush({ key: 'pressf-story-editor-layout', value: 'auto' });
    expect(service.mode()).toBe('auto');
    expect(service.fullscreen()).toBe(false);

    media.matches = true;
    for (const listener of viewportListeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }
    expect(service.fullscreen()).toBe(true);

    media.matches = false;
    for (const listener of viewportListeners) {
      listener({ matches: false } as MediaQueryListEvent);
    }
    expect(service.fullscreen()).toBe(false);
    http.verify();
  });

  it('starts in Auto and restores an existing profile preference across sessions', () => {
    expect(service.mode()).toBe('auto');
    const get = http.expectOne('/api/v1/user-storage/pressf-story-editor-layout');
    get.flush({ key: 'pressf-story-editor-layout', value: 'side' });
    expect(service.mode()).toBe('side');
    expect(service.syncState()).toBe('synced');
    expect(local.get('taiga-modern:story-editor-layout:7')).toBe('side');
    http.verify();
  });

  it('writes a choice through Taiga user storage with a local fallback', async () => {
    http.expectOne('/api/v1/user-storage/pressf-story-editor-layout').flush(null, {
      status: 404, statusText: 'Not found',
    });
    service.setMode('fullscreen');
    expect(service.mode()).toBe('fullscreen');
    expect(local.get('taiga-modern:story-editor-layout:7')).toBe('fullscreen');

    await Promise.resolve();
    http.expectOne('/api/v1/user-storage/pressf-story-editor-layout').flush(null, {
      status: 404, statusText: 'Not found',
    });
    http.expectOne('/api/v1/user-storage').flush({});
    await Promise.resolve();
    expect(service.syncState()).toBe('synced');
    http.verify();
  });

  it('keeps a newer local choice if the remote read finishes later', async () => {
    const load = http.expectOne('/api/v1/user-storage/pressf-story-editor-layout');
    service.setMode('fullscreen');
    load.flush({ key: 'pressf-story-editor-layout', value: 'side' });
    expect(service.mode()).toBe('fullscreen');
    await Promise.resolve();
    http.expectOne('/api/v1/user-storage/pressf-story-editor-layout').flush({});
    await Promise.resolve();
    expect(service.mode()).toBe('fullscreen');
    http.verify();
  });

  it('isolates preferences per account when the signed-in user changes', () => {
    const oldGet = http.expectOne('/api/v1/user-storage/pressf-story-editor-layout');
    local.set('taiga-modern:story-editor-layout:8', 'fullscreen');
    user.set({ id: 8 });
    session.set(2);
    TestBed.tick();
    expect(service.mode()).toBe('fullscreen');
    const nextGet = http.expectOne('/api/v1/user-storage/pressf-story-editor-layout');
    oldGet.flush({ key: 'pressf-story-editor-layout', value: 'side' });
    expect(service.mode()).toBe('fullscreen');
    nextGet.flush({ key: 'pressf-story-editor-layout', value: 'fullscreen' });
    expect(service.mode()).toBe('fullscreen');
    http.verify();
  });

  it('keeps mode parsing strict', () => {
    expect(parseStoryEditorLayoutMode('auto')).toBe('auto');
    expect(parseStoryEditorLayoutMode('side')).toBe('side');
    expect(parseStoryEditorLayoutMode('fullscreen')).toBe('fullscreen');
    expect(parseStoryEditorLayoutMode({ mode: 'fullscreen' })).toBeNull();
  });
});
