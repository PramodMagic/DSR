// Manifest Scan sync (Vercel Hobby + Upstash). Same env vars and DSR_KEY as api/dsr.js.
// Non-admin may remove single scans (pure 'del' chunks, max 20); date deletes (clr / clear-date / clear) are admin-only (ADMIN_KEY).
// Stores small chunks of scan records so a scan done on a mobile can be downloaded later from a computer (and the other way round).
const crypto = require('crypto');
const URL_ = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOK = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
async function cmd(args) {
  const r = await fetch(URL_(), { method: 'POST', headers: { Authorization: 'Bearer ' + TOK(), 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'Upstash HTTP ' + r.status);
  return j.result;
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!URL_() || !TOK()) return res.status(500).json({ error: 'Upstash environment variables are missing in Vercel' });
    const K = process.env.DSR_KEY;
    if (!K) return res.status(500).json({ error: 'DSR_KEY environment variable is missing in Vercel' });
    const k = String(req.headers['x-dsr-key'] || '');
    if (k.length !== K.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(K))) return res.status(401).json({ error: 'Wrong access key' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const AK = process.env.ADMIN_KEY, ak = String(req.headers['x-admin-key'] || '');
    const isAdmin = !!AK && ak.length === AK.length && crypto.timingSafeEqual(Buffer.from(ak), Buffer.from(AK));
    const noAdmin = () => res.status(403).json({ error: AK ? 'Only the admin can delete' : 'ADMIN_KEY environment variable is missing in Vercel (needed to delete)' });
    if (b.op === 'admin-check') return isAdmin ? res.json({ ok: true }) : (AK ? res.status(403).json({ error: 'Wrong admin password' }) : noAdmin());
    const id = String(b.id || ''), okId = /^[A-Za-z0-9_-]{6,48}$/.test(id);
    if (b.op === 'meta-get') { const m = await cmd(['GET', 'scan:meta']); return res.json({ meta: m ? JSON.parse(m) : null }); }
    if (b.op === 'meta-set') {
      if (typeof b.data !== 'string' || b.data.length > 20000) return res.status(400).json({ error: 'Bad meta' });
      await cmd(['SET', 'scan:meta', b.data]); return res.json({ ok: true });
    }
    if (b.op === 'addr-get') { const m = await cmd(['GET', 'scan:addr']); return res.json({ list: m ? JSON.parse(m) : null }); }
    if (b.op === 'addr-set') {
      if (typeof b.data !== 'string' || b.data.length > 50000) return res.status(400).json({ error: 'Bad list' });
      let data = b.data;
      if (!isAdmin) { // non-admin can add addresses but never remove one
        try { const old = JSON.parse((await cmd(['GET', 'scan:addr'])) || '[]'), nw = JSON.parse(b.data); data = JSON.stringify(old.concat(nw.filter(x => !old.includes(x)))); } catch (e) { return res.status(400).json({ error: 'Bad list' }); }
      }
      await cmd(['SET', 'scan:addr', data]); return res.json({ ok: true });
    }
    if (b.op === 'add') {
      if (!okId || typeof b.data !== 'string' || b.data.length > 900000) return res.status(400).json({ error: 'Bad chunk' });
      if (!isAdmin) { let arr; try { arr = JSON.parse(b.data); } catch (e) { return res.status(400).json({ error: 'Bad chunk' }); } if (!Array.isArray(arr)) return res.status(400).json({ error: 'Bad chunk' }); if (arr.some(x => x && x.clr)) return noAdmin(); const dl = arr.filter(x => x && x.del); if (dl.length && (dl.length !== arr.length || dl.length > 20)) return noAdmin(); }
      await cmd(['SET', 'scan:c:' + id, b.data]); await cmd(['RPUSH', 'scan:idx', id]); return res.json({ ok: true });
    }
    if (b.op === 'idx') { const l = await cmd(['LRANGE', 'scan:idx', 0, -1]); return res.json({ ids: l || [] }); }
    if (b.op === 'get') {
      if (!okId) return res.status(400).json({ error: 'Bad chunk' });
      const d = await cmd(['GET', 'scan:c:' + id]); if (d == null) return res.status(404).json({ error: 'Chunk missing' }); return res.json({ data: d });
    }
    if ((b.op === 'clear-date' || b.op === 'clear') && !isAdmin) return noAdmin();
    if (b.op === 'clear-date') { // delete the chunks of one date (ids are prefixed YYYY-MM-DD_)
      const d = String(b.d || ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'Bad date' });
      const l = ((await cmd(['LRANGE', 'scan:idx', 0, -1])) || []).filter(x => String(x).startsWith(d + '_'));
      if (l.length) { await cmd(['DEL', ...l.map(x => 'scan:c:' + x)]); for (const x of l) await cmd(['LREM', 'scan:idx', 0, x]); }
      return res.json({ ok: true, removed: l.length });
    }
    if (b.op === 'clear') {
      const l = (await cmd(['LRANGE', 'scan:idx', 0, -1])) || [];
      const ks = l.map(x => 'scan:c:' + x).concat(['scan:idx', 'scan:meta']);
      await cmd(['DEL', ...ks]); return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown op' });
  } catch (e) { return res.status(500).json({ error: String(e.message || e) }); }
};
