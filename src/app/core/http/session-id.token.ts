import { InjectionToken } from '@angular/core';

export const TAIGA_SESSION_ID = new InjectionToken<string>('TAIGA_SESSION_ID', {
  providedIn: 'root',
  factory: createSessionId,
});

function createSessionId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid.replaceAll('-', '');
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
