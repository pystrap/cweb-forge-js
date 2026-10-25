export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Document<T = Record<string, Json>> { id: string; data: T; owner: string; version: number; created_at: string; updated_at: string }
export interface Page<T> { items: Document<T>[]; next_cursor: string | null }
export interface ListOptions { limit?: number; after?: string; where?: { field: string; equals: Json }; signal?: AbortSignal }
export interface VersionOptions { version: number; signal?: AbortSignal }
export interface Collection<T> {
  list(options?: ListOptions): Promise<Page<T>>;
  get(id: string, options?: { signal?: AbortSignal }): Promise<Document<T>>;
  create(data: T, options?: { idempotencyKey?: string; signal?: AbortSignal }): Promise<Document<T>>;
  replace(id: string, data: T, options: VersionOptions): Promise<Document<T>>;
  update(id: string, data: Partial<T>, options: VersionOptions): Promise<Document<T>>;
  delete(id: string, options: VersionOptions): Promise<void>;
}
export class ForgeError extends Error { status: number; code: string; requestId: string }
export class ForgeClient {
  constructor(options: { endpoint: string; token?: string | (() => string | undefined | Promise<string | undefined>); fetch?: typeof fetch; timeoutMs?: number });
  collection<T = Record<string, Json>>(name: string): Collection<T>;
  iterate<T = Record<string, Json>>(name: string, options?: Omit<ListOptions, 'after'>): AsyncGenerator<Document<T>>;
}
export function createForgeAuth(options: { endpoint: string; redirectUri?: string; onLoad?: 'check-sso' | 'login-required' }): Promise<{
  login(): Promise<void>; signup(): Promise<void>; logout(): Promise<void>; token(): Promise<string | undefined>; readonly authenticated: boolean;
}>;
