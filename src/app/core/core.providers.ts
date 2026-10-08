import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { AuthService } from './auth/auth.service';
import {
  provideRuntimeConfig,
  type RuntimeConfigProviderOptions,
} from './config/runtime-config.providers';
import { RuntimeConfigService } from './config/runtime-config.service';
import { authSessionInterceptor } from './http/auth-session.interceptor';

export interface TaigaCoreProviderOptions {
  readonly runtimeConfig?: RuntimeConfigProviderOptions;
}

export function provideTaigaCore(options: TaigaCoreProviderOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptors([authSessionInterceptor])),
    provideRuntimeConfig(options.runtimeConfig),
    provideAppInitializer(() => {
      const config = inject(RuntimeConfigService);
      const auth = inject(AuthService);
      return config.load().then(() => {
        auth.restoreSession().subscribe({ error: () => undefined });
      });
    }),
  ]);
}
