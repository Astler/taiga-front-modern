import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { UiDensityService } from './ui-density.service';

const key = 'taiga-modern:compact-mode';
afterEach(() => {
  localStorage.removeItem(key);
  document.documentElement.removeAttribute('data-ui-density');
});

describe('UiDensityService', () => {
  it('keeps the existing compact preference when upgrading', () => {
    localStorage.setItem(key, 'true');
    const density = TestBed.inject(UiDensityService);
    expect(density.mode()).toBe('compact');
    expect(document.documentElement.dataset['uiDensity']).toBe('compact');
  });

  it('applies and persists a choice for every route', () => {
    const density = TestBed.inject(UiDensityService);
    density.setMode('compact');
    expect(density.compact()).toBe(true);
    expect(localStorage.getItem(key)).toBe('true');
    density.setMode('comfortable');
    expect(document.documentElement.dataset['uiDensity']).toBe('comfortable');
    expect(localStorage.getItem(key)).toBe('false');
  });

  it('updates an already open tab when the preference changes in another tab', () => {
    const density = TestBed.inject(UiDensityService);
    localStorage.setItem(key, 'true');
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'true' }));
    expect(density.compact()).toBe(true);
  });
});
