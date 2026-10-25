import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForgeClient, ForgeError } from '../src/index.js';
const address = 'https://example.forge.cweb.app/v1/';
test('sends scoped token, idempotency and version headers without cookies or redirects', async () => {
  const calls = [];
  const client = new ForgeClient({ endpoint: address, token: 'fg_test', fetch: async (url, options) => { calls.push({ url, ...options }); return new Response('{"id":"ok"}'); } });
  await client.collection('records').create({ name: 'sample' }, { idempotencyKey: 'stable' });
  await client.collection('records').update('00000000-0000-4000-8000-000000000001', { name: 'updated' }, { version: 2 });
  assert.equal(calls[0].headers['Idempotency-Key'], 'stable');
  assert.equal(calls[0].credentials, 'omit'); assert.equal(calls[0].redirect, 'error');
  assert.equal(calls[1].headers['If-Match'], '"2"');
});
test('preserves actionable quota error', async () => {
  const client = new ForgeClient({ endpoint: address, fetch: async () => new Response('{"error":{"code":"quota_exceeded","message":"Upgrade"}}', { status: 429 }) });
  await assert.rejects(client.collection('records').list(), e => e instanceof ForgeError && e.status === 429 && e.code === 'quota_exceeded');
});
test('iterates pages and prevents collection path injection', async () => {
  let page = 0;
  const client = new ForgeClient({ endpoint: address, fetch: async () => new Response(JSON.stringify({ items: [{ id: ++page }], next_cursor: page === 1 ? 'cursor' : null })) });
  const items = []; for await (const item of client.iterate('records')) items.push(item.id);
  assert.deepEqual(items, [1, 2]); assert.throws(() => client.collection('../management'));
});
test('refuses credentials in endpoints and insecure non-local transport', () => {
  assert.throws(() => new ForgeClient({ endpoint: 'http://example.com/v1' }));
  assert.throws(() => new ForgeClient({ endpoint: 'https://user:password@example.com/v1' }));
});
