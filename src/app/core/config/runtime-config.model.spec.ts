import { describe, expect, it } from 'vitest';
import { parseRuntimeConfig } from './runtime-config.model';

describe('parseRuntimeConfig', () => {
  it('normalizes stable Taiga config and applies safe defaults', () => {
    const config = parseRuntimeConfig({ api: '/api/v1', baseHref: 'workspace' });

    expect(config).toEqual({
      api: '/api/v1/',
      eventsUrl: null,
      baseHref: '/workspace/',
      legacyUrl: '/legacy/',
      debug: false,
      defaultLanguage: 'en',
      defaultTheme: 'taiga',
      themes: ['taiga'],
      defaultLoginEnabled: true,
      publicRegisterEnabled: true,
      maxUploadFileSize: null,
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.themes)).toBe(true);
  });

  it('preserves explicit supported values', () => {
    expect(
      parseRuntimeConfig({
        api: 'https://taiga.example/api/v1/',
        eventsUrl: 'wss://taiga.example/events',
        baseHref: '/',
        legacyUrl: '/classic/',
        debug: true,
        defaultLanguage: 'uk',
        defaultTheme: 'dark',
        themes: ['dark', 'light'],
        defaultLoginEnabled: false,
        publicRegisterEnabled: false,
        maxUploadFileSize: 10_000_000,
      }),
    ).toMatchObject({
      api: 'https://taiga.example/api/v1/',
      eventsUrl: 'wss://taiga.example/events',
      baseHref: '/',
      legacyUrl: '/classic/',
      debug: true,
      defaultLanguage: 'uk',
      defaultTheme: 'dark',
      themes: ['dark', 'light'],
      defaultLoginEnabled: false,
      publicRegisterEnabled: false,
      maxUploadFileSize: 10_000_000,
    });
  });

  it('rejects malformed required and optional values', () => {
    expect(() => parseRuntimeConfig({})).toThrow(/api/);
    expect(() => parseRuntimeConfig({ api: '' })).toThrow(/api/);
    expect(() => parseRuntimeConfig({ api: '/api/v1', debug: 'yes' })).toThrow(/debug/);
    expect(() => parseRuntimeConfig({ api: '/api/v1', themes: [] })).toThrow(/themes/);
  });

  it('preserves an absolute classic frontend URL', () => {
    expect(
      parseRuntimeConfig({
        api: '/api/v1',
        legacyUrl: 'https://classic.taiga.example',
      }).legacyUrl,
    ).toBe('https://classic.taiga.example/');
  });
});
