export interface RuntimeConfigFile {
  readonly api: string;
  readonly eventsUrl?: string | null;
  readonly baseHref?: string;
  readonly legacyUrl?: string;
  readonly debug?: boolean;
  readonly defaultLanguage?: string;
  readonly defaultTheme?: string;
  readonly themes?: readonly string[];
  readonly defaultLoginEnabled?: boolean;
  readonly publicRegisterEnabled?: boolean;
  readonly maxUploadFileSize?: number | null;
}

export interface RuntimeConfig {
  readonly api: string;
  readonly eventsUrl: string | null;
  readonly baseHref: string;
  readonly legacyUrl: string;
  readonly debug: boolean;
  readonly defaultLanguage: string;
  readonly defaultTheme: string;
  readonly themes: readonly string[];
  readonly defaultLoginEnabled: boolean;
  readonly publicRegisterEnabled: boolean;
  readonly maxUploadFileSize: number | null;
}

const DEFAULT_THEMES = Object.freeze(['taiga']);

export function parseRuntimeConfig(value: unknown): RuntimeConfig {
  if (!isRecord(value)) {
    throw new Error('Runtime config must be a JSON object.');
  }

  const api = requiredString(value, 'api');
  const themes = optionalStringArray(value, 'themes') ?? DEFAULT_THEMES;

  return Object.freeze({
    api: withTrailingSlash(api),
    eventsUrl: optionalNullableString(value, 'eventsUrl') ?? null,
    baseHref: normalizeBaseHref(optionalString(value, 'baseHref') ?? '/'),
    legacyUrl: normalizeNavigationUrl(optionalString(value, 'legacyUrl') ?? '/legacy/'),
    debug: optionalBoolean(value, 'debug') ?? false,
    defaultLanguage: optionalString(value, 'defaultLanguage') ?? 'en',
    defaultTheme: optionalString(value, 'defaultTheme') ?? themes[0] ?? 'taiga',
    themes: Object.freeze([...themes]),
    defaultLoginEnabled: optionalBoolean(value, 'defaultLoginEnabled') ?? true,
    publicRegisterEnabled: optionalBoolean(value, 'publicRegisterEnabled') ?? true,
    maxUploadFileSize: optionalNullableNumber(value, 'maxUploadFileSize') ?? null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const result = optionalString(value, key);
  if (result === undefined) {
    throw new Error(`Runtime config field "${key}" must be a non-empty string.`);
  }
  return result;
}

function optionalString(value: Record<string, unknown>, key: string): string | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (typeof candidate !== 'string' || candidate.trim().length === 0) {
    throw new Error(`Runtime config field "${key}" must be a non-empty string.`);
  }
  return candidate.trim();
}

function optionalNullableString(
  value: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (value[key] === null) {
    return null;
  }
  return optionalString(value, key);
}

function optionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (typeof candidate !== 'boolean') {
    throw new Error(`Runtime config field "${key}" must be a boolean.`);
  }
  return candidate;
}

function optionalNullableNumber(
  value: Record<string, unknown>,
  key: string,
): number | null | undefined {
  const candidate = value[key];
  if (candidate === undefined || candidate === null) {
    return candidate;
  }
  if (typeof candidate !== 'number' || !Number.isFinite(candidate) || candidate < 0) {
    throw new Error(`Runtime config field "${key}" must be a non-negative number or null.`);
  }
  return candidate;
}

function optionalStringArray(
  value: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const candidate = value[key];
  if (candidate === undefined) {
    return undefined;
  }
  if (
    !Array.isArray(candidate) ||
    candidate.length === 0 ||
    candidate.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new Error(`Runtime config field "${key}" must be a non-empty string array.`);
  }
  return candidate.map((item) => (item as string).trim());
}

function withTrailingSlash(value: string): string {
  return `${value.replace(/\/+$/, '')}/`;
}

function normalizeBaseHref(value: string): string {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withTrailingSlash(withLeadingSlash);
}

function normalizeNavigationUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? withTrailingSlash(value) : normalizeBaseHref(value);
}
