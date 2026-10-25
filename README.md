# cWeb Forge · JavaScript & TypeScript

**Serverless data and authentication API for your next application.**

Build browser applications with user sign-in and JSON collections, or access
Forge from your Node.js backend. Your application can run on cWeb or any other
host. This is the official JavaScript and TypeScript SDK for
[cWeb Forge](https://cweb.app).

- Browser sign-in, sign-up and sign-out using OpenID Connect with PKCE.
- Create, read, update and delete documents with collection access rules.
- Cursor pagination, equality filters and asynchronous iteration.
- Version checks for concurrent edits and idempotency keys for create retries.
- TypeScript declarations, request cancellation and configurable timeouts.

[Getting started](#getting-started) · [Authentication](#authentication) ·
[Working with documents](#working-with-documents) · [Contributing](#contributing)

## Installation

Requires a modern browser or Node.js 20+. The package uses ES modules; browser
projects should use an ES-module-aware build tool such as Vite.

The first npm release is being prepared. Until it is available, clone this
repository and install it into your application using its local path:

```sh
npm install --install-links ../cweb-forge-js
```

Once published, install from npm:

```sh
npm install @cweb/forge
```

## Getting started

1. Create a Forge application in the [cWeb dashboard](https://portal.cweb.app)
   and copy its API endpoint, including `/v1/`.
2. For browser applications, register the frontend origin and exact sign-in
   callback URL under **Authentication**. Serve your application at the callback
   route as well as its usual pages.
3. Choose authentication below. Use application-user sign-in for private data
   in the browser, no token for public reads, or a scoped service key on a server.

Examples use `https://my-app.forge.cweb.app/v1/`; replace it with your endpoint.
Collection names use lowercase letters, numbers and underscores, start with a
letter, and have a maximum length of 64 characters. The application's `records`
collection is a convenient place to start. Default owner access keeps each
signed-in user's documents private to that user.

## Authentication

### Browser applications

Initialize authentication **once** in a shared browser module, then reuse the
same promise throughout your application:

```js
// forge.js — load this module only in the browser, including /auth/callback.
import { ForgeClient, createForgeAuth } from '@cweb/forge';

const endpoint = 'https://my-app.forge.cweb.app/v1/';

export const forgeReady = createForgeAuth({
  endpoint,
  redirectUri: window.location.origin + '/auth/callback',
  onLoad: 'login-required',
}).then(auth => ({
  auth,
  forge: new ForgeClient({ endpoint, token: auth.token }),
}));
```

```js
// Any page/component that needs Forge:
import { forgeReady } from './forge.js';

const { forge } = await forgeReady;
const record = await forge.collection('records').create({ title: 'Hello' });
console.log(record.id);
```

`auth.token` is an async **function**, not a service key. The client calls it
before each request to obtain the signed-in application user's access token,
refreshing it when needed. Pass `auth.token`, rather than capturing one token
with `await auth.token()` and continuing to reuse that expired value.

The helper does not cache authentication instances. Calling `createForgeAuth`
in every component can trigger repeated redirects. Reuse it during SPA
navigation; a full reload or new tab initializes it again. An existing SSO
session can complete sign-in without another password prompt, but redirects
may still occur. In server-rendered frameworks, initialize this helper in
browser code, and never share a user's authenticated client across server requests.

For optional sign-in, omit `onLoad` and call `auth.login()` or `auth.signup()`
from your buttons. `auth.logout()` signs the user out. `auth.authenticated`
reports the current sign-in state.

### Public collections: no login required

Set a collection's read policy to **Anyone (public)** in **Collections & rules**,
then omit `token` entirely. Register the frontend origin for browser requests.

```js
import { ForgeClient } from '@cweb/forge';

const forge = new ForgeClient({
  endpoint: 'https://my-app.forge.cweb.app/v1/',
});
const page = await forge.collection('products').list({ limit: 50 });
for (const document of page.items) {
  console.log(document.data);
}
```

All documents and their fields in a public collection are readable. Keep private
information in a separate collection. Anonymous writes are not supported;
creating, updating and deleting still require authorization. Public requests
remain subject to application quotas and rate limits.

### Node.js backends

Create a service key with only the collection permissions your backend needs.
Supply it through your server's environment or secret manager:

```js
import { ForgeClient } from '@cweb/forge';

if (!process.env.CWEB_FORGE_KEY) throw new Error('CWEB_FORGE_KEY is required');
const forge = new ForgeClient({
  endpoint: 'https://my-app.forge.cweb.app/v1/',
  token: process.env.CWEB_FORGE_KEY,
});

for await (const document of forge.iterate('records', { limit: 100 })) {
  console.log(document.id);
}
```

A service key can access data across application users according to its scopes.
**Never include it in browser code, mobile app bundles, `VITE_*`, `NEXT_PUBLIC_*`
or other public environment variables.** The browser client rejects Forge
service keys, but keeping credentials on the server remains your responsibility.

## Working with documents

Responses contain document metadata and your JSON object in `data`:

```js
const records = forge.collection('records');
const created = await records.create({ title: 'Draft', status: 'active' });
const saved = await records.update(created.id, { title: 'Published' }, {
  version: created.version,
});
const current = await records.get(saved.id);
console.log(current.data.title);
```

| Method | Purpose |
| --- | --- |
| `list({ limit, after, where })` | Read a page with `items` and `next_cursor`. |
| `get(id)` | Read one document. |
| `create(data, { idempotencyKey })` | Create a document; a new key is generated if omitted. |
| `update(id, data, { version })` | Patch the supplied fields. |
| `replace(id, data, { version })` | Replace the document's data. |
| `delete(id, { version })` | Delete a document. |
| `forge.iterate(name, options)` | Read successive pages as an async iterator. |

Use the latest returned `version` for each update, replacement or deletion.
A `409` conflict means fetch the current document and resolve the changes before
retrying. To retry an uncertain create request, retain and reuse the same
`idempotencyKey` for that logical operation within the server's 24-hour window.
The SDK does not automatically retry writes.

```js
const page = await records.list({
  limit: 50,
  where: { field: 'status', equals: 'active' },
});
if (page.next_cursor) {
  const nextPage = await records.list({
    limit: 50,
    after: page.next_cursor,
    where: { field: 'status', equals: 'active' },
  });
}
```

Filters support equality against a scalar field value. Page limits range from
1 to 100 documents. Use pagination rather than assuming the first page contains
the entire collection.

### TypeScript

```ts
import { ForgeClient } from '@cweb/forge';

type Product = { name: string; price: number };
const forge = new ForgeClient({ endpoint: 'https://my-app.forge.cweb.app/v1/' });
const products = forge.collection<Product>('products');
const page = await products.list();
const names: string[] = page.items.map(product => product.data.name);
```

Generics describe the data your code expects; they do not validate responses at
runtime. Validate untrusted data where your application needs stronger guarantees.

## Errors, timeouts and cancellation

API failures expose `ForgeError.status`, `code` and `requestId`. Network failures
use status `0`; request cancellation may raise `AbortError`. Handle rejected
requests rather than displaying raw diagnostics to your users.

| Status | Suggested handling |
| --- | --- |
| `401` | Sign in again or renew the backend credential. |
| `403` | Check collection rules and key permissions. |
| `409` | Reload and resolve a concurrent edit or idempotency conflict. |
| `429` | Check the error code for rate or quota limits; avoid immediate retries. |
| `503` | Retry later with bounded backoff where the operation is safe to retry. |

The default request timeout is 15 seconds. Set `timeoutMs` on `ForgeClient` and
pass an `AbortSignal` to individual collection operations when needed:

```js
const controller = new AbortController();
const pending = records.list({ signal: controller.signal });
// Call controller.abort() when the view is no longer needed.
const page = await pending;
```

## Security

- Browser user tokens stay in memory. Do not log them or store them in localStorage.
- Application-user tokens are separate from cWeb dashboard credentials.
- Allowed origins control browser access; they do not make public data private.
- Requests require HTTPS, except for localhost development. Data requests omit
  browser cookies and reject redirects.
- Use short-lived, narrowly scoped backend credentials and rotate exposed keys.

Report vulnerabilities privately using the
[security policy](https://github.com/pystrap/cweb-forge-js/blob/main/SECURITY.md).

## Contributing

Bug reports, documentation improvements and focused pull requests are welcome.
Include the SDK version, runtime and a minimal reproduction without credentials
or customer data. For account or billing help, contact cWeb Support at
[support@cweb.app](mailto:support@cweb.app).

```sh
npm ci
npm test
```

Tests use mocked HTTP responses and do not require a live Forge account. Keep
regression tests with behavior changes. Use
[GitHub issues](https://github.com/pystrap/cweb-forge-js/issues) for SDK bugs;
security reports must remain private.

## License

[MIT](https://github.com/pystrap/cweb-forge-js/blob/main/LICENSE).
Maintained by [PyStrap](https://pystrap.co.uk), the team behind cWeb.
