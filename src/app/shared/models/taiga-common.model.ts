export type TaigaId = number;

export interface TaigaNamedResource {
  readonly id: TaigaId;
  readonly name: string;
}

export interface TaigaColoredResource extends TaigaNamedResource {
  readonly color: string | null;
}

export interface TaigaPagination {
  readonly currentPage: number;
  readonly pageSize: number;
  readonly totalCount: number;
  readonly totalPages: number;
}

export interface TaigaApiError {
  readonly _error_message?: string;
  readonly [field: string]: unknown;
}
