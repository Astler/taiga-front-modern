import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { RuntimeConfigService } from './runtime-config.service';
import { RUNTIME_CONFIG, RUNTIME_CONFIG_URL } from './runtime-config.tokens';

export interface RuntimeConfigProviderOptions {
  readonly configUrl?: string;
}

export function provideRuntimeConfig(
  options: RuntimeConfigProviderOptions = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: RUNTIME_CONFIG_URL,
      useValue: options.configUrl ?? 'config.json',
    },
    {
      provide: RUNTIME_CONFIG,
      useFactory: () => inject(RuntimeConfigService).snapshot(),
    },
    provideAppInitializer(() => inject(RuntimeConfigService).load()),
  ]);
}
