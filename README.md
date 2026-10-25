# cWeb Forge JavaScript / TypeScript SDK

Official client for browser apps and Node.js, whether hosted on cWeb or elsewhere.
Public package name is proposed pending namespace registration; this repository
can be installed locally with `npm install ../cweb-forge-js` before publication.

Documentation entry point: https://cweb.app/docs/forge/
JavaScript guide: https://cweb.app/docs/forge/javascript
These pages are publication targets; release documentation must be published
before advertising the package publicly.

```js
import { ForgeClient, createForgeAuth } from '@cweb/forge';
const endpoint = 'https://my-app.forge.cweb.app/v1/';
const auth = await createForgeAuth({ endpoint,
  redirectUri: window.location.origin + '/auth/callback',
  onLoad: 'login-required' });
// Register this exact callback and its origin in Forge → Authentication.
const forge = new ForgeClient({ endpoint, token: auth.token });
const record = await forge.collection('records').create({ title: 'Hello' });
await forge.collection('records').update(record.id, { title: 'Updated' },
  { version: record.version });
```

Your frontend must serve `/auth/callback` and initialize `createForgeAuth` on
that route to complete sign-in. `onLoad: 'login-required'` redirects visitors
to application sign-in when needed. You can instead omit `onLoad` and connect
`auth.login()` / `auth.signup()` to your own Sign in / Create account buttons.

`auth.token` is an **async function**, not a service key or a token copied from
the dashboard. `ForgeClient` calls it before each request; the helper refreshes
the application user's access token when necessary. Pass the function itself
instead of capturing a token once with `await auth.token()`.

The browser can see its own user's bearer token. This is expected: the API
validates its signature, expiry, application and collection access policies.
With the default owner policy, Alice's token cannot read Bob's documents.
Treat user tokens as credentials and never share or log them. A user's token
does not grant cWeb dashboard or platform-administrator access.

Tokens remain in the OIDC adapter's memory; don't copy them into localStorage.
The default collection is private to each signed-in user. Public reads require
an explicit collection policy. Origins are browser controls, not authentication.

In Node.js use a scoped key from a server-side secret store:

```js
const forge = new ForgeClient({ endpoint, token: process.env.CWEB_FORGE_KEY });
for await (const row of forge.iterate('records', { limit: 100 })) {
  console.log(row.id); // avoid logging private contents
}
```

`list({where:{field:'status',equals:'active'},limit:50,after:cursor})` supports
bounded equality filtering. `replace`, `update` and `delete` require a version;
a 409 means reload and resolve concurrent changes. `create` accepts a stable
`idempotencyKey` for retrying uncertain network outcomes within 24 hours. No
automatic write retry occurs. AbortSignal and per-client timeouts are supported.

Handle `ForgeError.status`, `.code` and `.requestId`. 401 requires sign-in/key
renewal; 403 is an access policy; 429 is a rate/plan allowance; 503 means retry
later. Never put a service key in browser code or public frontend environment
variables. Users and management credentials are separate from application data.
Do not place service keys in `VITE_*`, `NEXT_PUBLIC_*` or other variables that
your framework includes in the browser bundle. The browser SDK rejects Forge
service keys to catch mistakes, but keeping keys on the server is the actual
security boundary. A key's scopes can permit access across application users.

## Reusing sign-in across your application

Initialize `createForgeAuth` once in a shared browser module or app-level
provider, then reuse the same promise/client across components. The helper does
not cache instances: calling it separately on every page/component can initiate
another sign-in redirect even while an SSO session exists. Normal SPA navigation
can reuse the client; full reloads and new tabs initialize authentication again.
Keep tokens in memory rather than persisting them to avoid the initialization.

## Reading public collections without login

In Forge, open **Collections & rules → Configure** and set **Who can read?** to
**Anyone (public)**. Register your frontend origin under Authentication for
browser requests. Then omit `token` entirely:

```js
import { ForgeClient } from '@cweb/forge';

const forge = new ForgeClient({
  endpoint: 'https://my-app.forge.cweb.app/v1/',
});
const { items, next_cursor } = await forge.collection('products').list();
```

No sign-in helper or service key is required for these reads. Every document in
the public collection is readable, so do not place private fields there.
Anonymous writes are not supported: creating, updating and deleting still need
an authorized application user or a backend service key. Private collections
remain inaccessible anonymously. Request, transfer and rate limits still apply;
allowed origins are browser controls, not a confidentiality boundary.

SDK lifecycle: `npm test`; `npm pack --dry-run`; publish signed releases from a
reviewed tag using registry trusted publishing. This repository contains no
service credentials or server source. Breaking changes require a major version.
