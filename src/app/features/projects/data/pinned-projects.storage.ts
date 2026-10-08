import { InjectionToken, Injectable, inject } from '@angular/core';
import type { ProjectPin } from './project.models';

export const PINNED_PROJECTS_STORAGE_KEY = 'pressf-pinned-projects';

export function pinnedProjectsStorageKey(memberId: number): string {
  return `${PINNED_PROJECTS_STORAGE_KEY}:member:${memberId}`;
}

export const PROJECT_LOCAL_STORAGE = new InjectionToken<Storage | null>('PROJECT_LOCAL_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

@Injectable({ providedIn: 'root' })
export class PinnedProjectsStorage {
  private readonly storage = inject(PROJECT_LOCAL_STORAGE);

  read(memberId: number): readonly ProjectPin[] {
    if (!this.storage) {
      return [];
    }

    try {
      const memberKey = pinnedProjectsStorageKey(memberId);
      const memberPins = this.storage.getItem(memberKey);
      if (memberPins !== null) {
        return normalizeSerializedPins(memberPins);
      }

      const legacyPins = this.storage.getItem(PINNED_PROJECTS_STORAGE_KEY);
      if (legacyPins === null) {
        return [];
      }

      const pins = normalizeSerializedPins(legacyPins);
      this.storage.setItem(memberKey, serializePins(pins));
      this.storage.removeItem(PINNED_PROJECTS_STORAGE_KEY);
      return pins;
    } catch {
      return [];
    }
  }

  write(memberId: number, pins: readonly ProjectPin[]): void {
    if (!this.storage) {
      return;
    }

    try {
      this.storage.setItem(pinnedProjectsStorageKey(memberId), serializePins(pins));
    } catch {
      // Storage can be unavailable in private browsing or when the quota is exhausted.
    }
  }
}

export function normalizeStoredPins(value: unknown): readonly ProjectPin[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return deduplicatePins(value.map(readStoredPin).filter(isProjectPin));
}

export function deduplicatePins(pins: readonly ProjectPin[]): readonly ProjectPin[] {
  const seen = new Set<string>();
  return pins.filter((pin) => {
    const key = pinKey(pin);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function pinKey(pin: ProjectPin): string {
  return `${pin.kind}:${pin.value}`;
}

function normalizeSerializedPins(serialized: string): readonly ProjectPin[] {
  return normalizeStoredPins(JSON.parse(serialized) as unknown);
}

function serializePins(pins: readonly ProjectPin[]): string {
  return JSON.stringify(
    deduplicatePins(pins).map((pin) => (pin.kind === 'id' ? pin.value : `slug:${pin.value}`)),
  );
}

function readStoredPin(value: unknown): ProjectPin | null {
  if (isTaigaId(value)) {
    return { kind: 'id', value };
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (/^\d+$/.test(normalized)) {
      const id = Number(normalized);
      return isTaigaId(id) ? { kind: 'id', value: id } : null;
    }

    const slug = normalized.startsWith('slug:') ? normalized.slice(5).trim() : normalized;
    return slug ? { kind: 'slug', value: slug } : null;
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { id?: unknown; slug?: unknown };
    if (isTaigaId(candidate.id)) {
      return { kind: 'id', value: candidate.id };
    }
    if (typeof candidate.slug === 'string' && candidate.slug.trim()) {
      return { kind: 'slug', value: candidate.slug.trim() };
    }
  }

  return null;
}

function isProjectPin(pin: ProjectPin | null): pin is ProjectPin {
  return pin !== null;
}

function isTaigaId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
