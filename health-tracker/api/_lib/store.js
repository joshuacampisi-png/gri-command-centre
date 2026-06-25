// JSON key/value store with two backends:
//  - Vercel KV / Upstash Redis (REST) when its env vars are present — required
//    for persistence on Vercel's ephemeral serverless filesystem.
//  - Local JSON files otherwise — used by `npm run dev` and `npm start`.
// No npm dependency: Vercel KV speaks the Upstash REST protocol over fetch.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useKV = !!(KV_URL && KV_TOKEN);

// On Vercel without KV, fall back to /tmp so writes don't crash (won't persist).
const FILE_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'vitals') : path.join(process.cwd(), 'data');

export const persistenceMode = useKV ? 'kv' : process.env.VERCEL ? 'ephemeral' : 'file';

async function kvCmd(command) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV ${res.status}`);
  return (await res.json()).result;
}

export async function getKey(key, fallback) {
  if (useKV) {
    const v = await kvCmd(['GET', `vitals:${key}`]);
    return v == null ? fallback : JSON.parse(v);
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(FILE_DIR, `${key}.json`), 'utf8'));
  } catch {
    return fallback;
  }
}

export async function setKey(key, value) {
  if (useKV) {
    await kvCmd(['SET', `vitals:${key}`, JSON.stringify(value)]);
    return;
  }
  fs.mkdirSync(FILE_DIR, { recursive: true });
  fs.writeFileSync(path.join(FILE_DIR, `${key}.json`), JSON.stringify(value, null, 2));
}
