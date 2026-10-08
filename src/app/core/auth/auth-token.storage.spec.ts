import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AUTH_STORAGE, AuthTokenStorage } from './auth-token.storage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('AuthTokenStorage', () => {
  let browserStorage: MemoryStorage;

  beforeEach(() => {
    browserStorage = new MemoryStorage();
  });

  function createService(): AuthTokenStorage {
    TestBed.configureTestingModule({
      providers: [{ provide: AUTH_STORAGE, useValue: browserStorage }],
    });
    return TestBed.inject(AuthTokenStorage);
  }

  it('reads the legacy stable Taiga token keys', () => {
    browserStorage.setItem('token', JSON.stringify('access'));
    browserStorage.setItem('refresh', JSON.stringify('refresh'));

    const service = createService();

    expect(service.accessToken()).toBe('access');
    expect(service.refreshToken()).toBe('refresh');
    expect(service.hasSession()).toBe(true);
  });

  it('keeps storage and reactive state in sync', () => {
    const service = createService();
    const initialRevision = service.revision();

    service.setFromResponse({ auth_token: ' new-access ', refresh: ' new-refresh ' });
    expect(service.tokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    expect(browserStorage.getItem('token')).toBe(JSON.stringify('new-access'));
    expect(browserStorage.getItem('refresh')).toBe(JSON.stringify('new-refresh'));
    expect(service.revision()).toBe(initialRevision + 1);

    service.clear();
    expect(service.hasSession()).toBe(false);
    expect(browserStorage.length).toBe(0);
    expect(service.revision()).toBe(initialRevision + 2);
  });

  it('can migrate raw tokens written by an early modern frontend build', () => {
    browserStorage.setItem('token', 'raw-access');
    browserStorage.setItem('refresh', 'raw-refresh');

    const service = createService();

    expect(service.tokens()).toEqual({
      accessToken: 'raw-access',
      refreshToken: 'raw-refresh',
    });
  });

  it('keeps classic Taiga userInfo compatible with token rotation', () => {
    const service = createService();
    service.setTokens({ accessToken: 'access', refreshToken: 'refresh' });
    service.setLegacyUser({ id: 7, username: 'ada' });
    service.rotateTokens({ auth_token: 'rotated-access', refresh: 'rotated-refresh' });

    expect(JSON.parse(browserStorage.getItem('userInfo') ?? '{}')).toMatchObject({
      id: 7,
      username: 'ada',
      auth_token: 'rotated-access',
      refresh: 'rotated-refresh',
    });
  });

  it('synchronizes credentials changed by another browser tab', async () => {
    const service = createService();
    const initialExternalRevision = service.externalSyncRevision();
    browserStorage.setItem('token', JSON.stringify('external-access'));
    browserStorage.setItem('refresh', JSON.stringify('external-refresh'));

    window.dispatchEvent(new StorageEvent('storage', { key: 'token' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'refresh' }));
    await Promise.resolve();

    expect(service.tokens()).toEqual({
      accessToken: 'external-access',
      refreshToken: 'external-refresh',
    });
    expect(service.externalSyncRevision()).toBe(initialExternalRevision + 1);
  });
});
