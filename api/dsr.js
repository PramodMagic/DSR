// Vercel serverless function (Hobby plan friendly): stores the DSR in Upstash Redis in small chunks.
// Env vars (Vercel -> Settings -> Environment Variables):
//   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN  (or KV_REST_API_URL / KV_REST_API_TOKEN from the Vercel-Upstash integration)
//   DSR_KEY  = a long password you choose; the tool asks for it once.
const crypto = require('crypto');
const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOK = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
async function cmd(args) {
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOK(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'Upstash HTTP ' + r.status);
  return j.result;
}
const keysOf = m => { const k = []; Object.entries((m && m.parts) || {}).forEach(([p, n]) => { const id = p === 'x' ? (m.xid || m.id) : m.id; for (let i = 0; i < n; i++) k.push(`dsr:${id}:${p}:${i}`) }); return k; };
const delMany = async ks => { for (let i = 0; i < ks.length; i += 200) await cmd(['DEL', ...ks.slice(i, i + 200)]); };
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!URL_() || !TOK()) return res.status(500).json({ error: 'Upstash environment variables are missing in Vercel' });
    const K = process.env.DSR_KEY;
    if (!K) return res.status(500).json({ error: 'DSR_KEY environment variable is missing in Vercel' });
    const k = String(req.headers['x-dsr-key'] || '');
    if (k.length !== K.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(K))) return res.status(401).json({ error: 'Wrong access key' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = String(b.id || ''), part = String(b.part || ''), i = Number(b.i);
    const okChunk = /^\d{10,}$/.test(id) && /^[dx]$/.test(part) && Number.isInteger(i) && i >= 0 && i < 2000;
    if (b.op === 'meta') { const m = await cmd(['GET', 'dsr:meta']); return res.json({ meta: m ? JSON.parse(m) : null }); }
    if (b.op === 'put') {
      if (!okChunk || typeof b.data !== 'string' || b.data.length > 900000) return res.status(400).json({ error: 'Bad chunk' });
      await cmd(['SET', `dsr:${id}:${part}:${i}`, b.data]); return res.json({ ok: true });
    }
    if (b.op === 'get') {
      if (!okChunk) return res.status(400).json({ error: 'Bad chunk' });
      const d = await cmd(['GET', `dsr:${id}:${part}:${i}`]); if (d == null) return res.status(404).json({ error: 'Chunk missing' }); return res.json({ data: d });
    }
    if (b.op === 'commit') { // switch to the new version, then delete the old chunks
      const old = await cmd(['GET', 'dsr:meta']), m = b.meta;
      if (!m || !/^\d{10,}$/.test(String(m.id))) return res.status(400).json({ error: 'Bad meta' });
      await cmd(['SET', 'dsr:meta', JSON.stringify(m)]);
      const nk = new Set(keysOf(m)), ok = (old ? keysOf(JSON.parse(old)) : []).filter(k => !nk.has(k)); // keep chunks shared with the new version (reused original Excel)
      await delMany(ok);
      return res.json({ ok: true, removed: ok.length });
    }
    if (b.op === 'gc') { // delete leftovers of failed / cancelled saves (older than 10 minutes, not part of the current version)
      const m = await cmd(['GET', 'dsr:meta']), keep = new Set(m ? keysOf(JSON.parse(m)) : []); const cut = Date.now() - 600000; let cur = '0'; const del = [];
      do { const r = await cmd(['SCAN', cur, 'MATCH', 'dsr:*', 'COUNT', '1000']); cur = String(r[0]); for (const k of r[1]) { if (keep.has(k)) continue; const mm = /^dsr:(\d{10,}):[dx]:\d+$/.exec(k); if (mm && Number(mm[1]) < cut) del.push(k); } } while (cur !== '0');
      await delMany(del); return res.json({ ok: true, removed: del.length });
    }
    if (b.op === 'clear') { const old = await cmd(['GET', 'dsr:meta']); const ks = old ? keysOf(JSON.parse(old)) : []; await cmd(['DEL', 'dsr:meta']); await delMany(ks); return res.json({ ok: true }); }
    return res.status(400).json({ error: 'Unknown op' });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
