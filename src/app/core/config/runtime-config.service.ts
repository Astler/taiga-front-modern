import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { parseRuntimeConfig, type RuntimeConfig } from './runtime-config.model';
import { RUNTIME_CONFIG_URL } from './runtime-config.tokens';

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly configUrl = inject(RUNTIME_CONFIG_URL);
  private readonly configState = signal<RuntimeConfig | null>(null);
  private loadPromise: Promise<void> | null = null;

  readonly config = this.configState.asReadonly();

  load(): Promise<void> {
    if (this.configState()) {
      return Promise.resolve();
    }
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = firstValueFrom(this.http.get<unknown>(this.configUrl))
      .then((value) => this.configState.set(parseRuntimeConfig(value)))
      .finally(() => {
        this.loadPromise = null;
      });

    return this.loadPromise;
  }

  snapshot(): RuntimeConfig {
    const config = this.configState();
    if (!config) {
      throw new Error(
        'Runtime config is not loaded. Register provideRuntimeConfig() during application bootstrap.',
      );
    }
    return config;
  }

  resolveApiPath(path: string): string {
    return `${this.snapshot().api}${path.replace(/^\/+/, '')}`;
  }

  isApiRequest(url: string): boolean {
    const target = toAbsoluteUrl(url);
    const api = toAbsoluteUrl(this.snapshot().api);
    return (
      target !== null &&
      api !== null &&
      target.origin === api.origin &&
      target.pathname.startsWith(api.pathname)
    );
  }

  isApiEndpoint(url: string, path: string): boolean {
    const target = toAbsoluteUrl(url);
    const endpoint = toAbsoluteUrl(this.resolveApiPath(path));
    return (
      target !== null &&
      endpoint !== null &&
      target.origin === endpoint.origin &&
      trimTrailingSlash(target.pathname) === trimTrailingSlash(endpoint.pathname)
    );
  }
}

function toAbsoluteUrl(value: string): URL | null {
  try {
    const baseUrl = globalThis.document?.baseURI ?? 'http://localhost/';
    return new URL(value, baseUrl);
  } catch {
    return null;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
