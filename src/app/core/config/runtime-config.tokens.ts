import { InjectionToken } from '@angular/core';
import type { RuntimeConfig } from './runtime-config.model';

export const RUNTIME_CONFIG_URL = new InjectionToken<string>('TAIGA_RUNTIME_CONFIG_URL');

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('TAIGA_RUNTIME_CONFIG');
