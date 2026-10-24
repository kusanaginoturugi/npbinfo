import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.__NPBINFO_BUILD_ID__ = 'test';
globalThis.__NPBINFO_BUILD_TIME__ = 'test';
globalThis.__NPBINFO_GIT_REVISION__ = 'test';
const { default: worker } = await import('../worker/index.js');

function ingest(body) {
  const request = new Request('https://npbinfo.example/api/ai/comments', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token' },
    body,
  });
  return worker.fetch(request, { REFRESH_TOKEN: 'test-token', DB: { prepare() {} } });
}

test('AI コメント保存は 1 MiB を超える本文を拒否する', async () => {
  const response = await ingest('x'.repeat(1024 * 1024 + 1));
  assert.equal(response.status, 413);
});

test('AI コメント保存は 50 件を超えるバッチを拒否する', async () => {
  const response = await ingest(JSON.stringify({ items: Array(51).fill({}) }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'too many items');
});
