export class ForgeError extends Error {
  constructor(message, { status = 0, code = 'network_error', requestId = '' } = {}) {
    super(message); this.name = 'ForgeError'; this.status = status; this.code = code; this.requestId = requestId;
  }
}

function endpoint(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost');
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.search || url.hash) throw new TypeError('Use an HTTPS Forge endpoint; HTTP is permitted only for local development.');
  return url.href.replace(/\/$/, '');
}
const name = value => {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(value)) throw new TypeError('Invalid collection name.');
  return value;
};
const id = value => {
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new TypeError('Invalid document ID.');
  return value;
};

export class ForgeClient {
  constructor({ endpoint: address, token, fetch: transport = globalThis.fetch, timeoutMs = 15000 }) {
    this.endpoint = endpoint(address); this.token = token; this.fetch = transport; this.timeoutMs = timeoutMs;
    if (typeof window !== 'undefined' && typeof token === 'string' && token.startsWith('fg_')) throw new TypeError('Service keys must never be included in browser applications.');
  }
  async request(method, path, { body, headers = {}, signal } = {}) {
    const token = typeof this.token === 'function' ? await this.token() : this.token;
    if (typeof window !== 'undefined' && token?.startsWith('fg_')) throw new TypeError('Service keys cannot be used in browser applications.');
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.endpoint + path, { method, credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const value = response.status === 204 ? undefined : await response.json();
      if (!response.ok) throw new ForgeError(value?.error?.message || `Forge request failed (${response.status}).`, { status: response.status, code: value?.error?.code, requestId: response.headers.get('X-Request-ID') || '' });
      return value;
    } catch (error) {
      if (error instanceof ForgeError || error.name === 'AbortError') throw error;
      throw new ForgeError('Unable to complete the Forge request. Check the connection.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  collection(collectionName) {
    const path = `/collections/${name(collectionName)}/documents`;
    return {
      list: (options = {}) => {
        const params = new URLSearchParams();
        if (options.limit !== undefined) params.set('limit', String(options.limit));
        if (options.after) params.set('after', options.after);
        if (options.where) { params.set('field', options.where.field); params.set('value', JSON.stringify(options.where.equals)); }
        return this.request('GET', path + (params.size ? '?' + params : ''), { signal: options.signal });
      },
      get: (documentId, options) => this.request('GET', `${path}/${id(documentId)}`, options),
      create: (data, { idempotencyKey = globalThis.crypto.randomUUID(), signal } = {}) => this.request('POST', path, { body: data, headers: { 'Idempotency-Key': idempotencyKey }, signal }),
      replace: (documentId, data, { version, signal }) => this.request('PUT', `${path}/${id(documentId)}`, { body: data, headers: { 'If-Match': `"${version}"` }, signal }),
      update: (documentId, data, { version, signal }) => this.request('PATCH', `${path}/${id(documentId)}`, { body: data, headers: { 'If-Match': `"${version}"` }, signal }),
      delete: (documentId, { version, signal }) => this.request('DELETE', `${path}/${id(documentId)}`, { headers: { 'If-Match': `"${version}"` }, signal }),
    };
  }
  async *iterate(collectionName, options = {}) {
    let after;
    do {
      const result = await this.collection(collectionName).list({ ...options, after });
      for (const document of result.items) yield document;
      if (result.next_cursor && result.next_cursor === after) throw new ForgeError('Invalid pagination cursor.', { code: 'invalid_response' });
      after = result.next_cursor;
    } while (after);
  }
}

/** Browser-only OIDC via the upstream adapter. Tokens stay in memory. */
export async function createForgeAuth({ endpoint: address, redirectUri = window.location.href, ...options }) {
  const base = endpoint(address);
  const response = await fetch(base + '/config', { credentials: 'omit', redirect: 'error' });
  if (!response.ok) throw new ForgeError('Application authentication is unavailable.', { status: response.status });
  const { auth } = await response.json();
  const { default: Keycloak } = await import('keycloak-js');
  const adapter = new Keycloak(auth);
  await adapter.init({ pkceMethod: 'S256', checkLoginIframe: false, redirectUri, ...options });
  return {
    login: () => adapter.login({ redirectUri }),
    signup: () => adapter.register({ redirectUri }),
    logout: () => adapter.logout({ redirectUri }),
    token: async () => { if (!adapter.authenticated) return undefined; await adapter.updateToken(30); return adapter.token; },
    get authenticated() { return Boolean(adapter.authenticated); },
  };
}
