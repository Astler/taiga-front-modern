import type { TaigaUser } from '../../shared/models';

export interface AuthLoginRequest {
  readonly username: string;
  readonly password: string;
  readonly type?: string;
  readonly invitation_token?: string;
}

export interface AuthRefreshRequest {
  readonly refresh: string;
}

export interface AuthTokenResponse {
  readonly auth_token: string;
  readonly refresh: string;
}

export interface AuthLoginResponse extends TaigaUser, AuthTokenResponse {}

export interface AuthTokens {
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
}

export type AuthStatus =
  'anonymous' | 'authenticating' | 'restoring' | 'authenticated' | 'restore-error';
