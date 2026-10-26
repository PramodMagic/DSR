/* DSR core: reads/writes large xlsx files via streaming (up to 300,000 rows x 75 columns). Runs in both browser and Node. */
(function () {
'use strict';
const root = typeof window !== 'undefined' ? window : globalThis;
const ff = root.fflate || require('fflate');
const un = s => s.indexOf('&') < 0 ? s : s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#\d+);/g, (m, e) => e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" : String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)));
const esc = s => s.replace(/[&<>]/g, c => c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const colName = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26 } return s };
const colIdx = l => { let n = 0; for (let i = 0; i < l.length; i++) n = n * 26 + l.charCodeAt(i) - 64; return n - 1 };
const tick = () => new Promise(r => setTimeout(r, 0));
async function* chunks(src) {
  if (src[Symbol.asyncIterator]) { yield* src; return }
  const r = src.getReader(); for (;;) { const { done, value } = await r.read(); if (done) return; yield value }
}

/* ---------- formulas ---------- */
const REF = /(?<![A-Za-z0-9_.$])(\$?[A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z])/g;
function compileFormula(f, trow) {
  const segs = []; let pos = 0, m; REF.lastIndex = 0;
  while ((m = REF.exec(f))) { segs.push(f.slice(pos, m.index), [m[1], m[2] === '$', +m[3]]); pos = REF.lastIndex }
  segs.push(f.slice(pos));
  return R => { const d = R - trow; let o = '='; for (const s of segs) o += typeof s === 'string' ? s : (s[1] ? s[0] + s[2] : s[0] + (s[2] + d)); return o };
}

/* ---------- read xlsx ---------- */
const siText = x => { x = x.replace(/<rPh[\s\S]*?<\/rPh>/g, ''); let o = '', m; const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g; while ((m = re.exec(x))) o += m[1]; return un(o) };
const BUILT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const isDateFmt = (id, code) => code === undefined ? BUILT.has(id) : (!/general/i.test(code) && /[ymdhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\.|_.|\*./g, '')));
function parseStyles(x) {
  const fm = {}; for (const m of x.matchAll(/<numFmt\b[^>]*>/g)) { const id = /numFmtId="(\d+)"/.exec(m[0]), c = /formatCode="([^"]*)"/.exec(m[0]); if (id && c) fm[id[1]] = un(c[1]) }
  const cx = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(x), out = [];
  if (cx) for (const m of cx[1].matchAll(/<xf\b[^>]*>/g)) { const id = +((/numFmtId="(\d+)"/.exec(m[0]) || [0, 0])[1]); out.push(isDateFmt(id, fm[id])) }
  return out;
}
async function unzipPass(getStream, wanted, onProgress) {
  const uz = new ff.Unzip(); uz.register(ff.UnzipInflate); uz.register(ff.UnzipPassThrough);
  uz.onfile = f => { const h = wanted(f.name, f); if (!h) return; const dec = new TextDecoder(); f.ondata = (err, c, fin) => { if (err) throw err; h(dec.decode(c, { stream: !fin }), fin) }; f.start() };
  let n = 0, ly = 0;
  for await (const c of chunks(getStream())) { uz.push(c, false); n += c.length; if (n - ly > 4194304) { ly = n; onProgress && onProgress(n); await tick() } }
  uz.push(new Uint8Array(0), true);
}
const FAST = /^r="([A-Z]+)\d+"(?: s="(\d+)")?(?: t="(\w+)")?/;
async function readXlsx(getStream, onProgress, sheetIdx = -1, headerRow = 0) {
  const txt = {}, sst = [], sizes = {}; let sbuf = '';
  await unzipPass(getStream, (n, f) => {
    sizes[n] = f.originalSize ?? f.size;
    if (n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/styles.xml') { txt[n] = ''; return t => { txt[n] += t } }
    if (n === 'xl/sharedStrings.xml') return t => { sbuf += t; const re = /<si>([\s\S]*?)<\/si>|<si\/>/g; let m, last = 0; while ((m = re.exec(sbuf))) { sst.push(m[1] === undefined ? '' : siText(m[1])); last = re.lastIndex } sbuf = sbuf.slice(last) };
    return null;
  }, onProgress);
  const relMap = {};
  for (const m of (txt['xl/_rels/workbook.xml.rels'] || '').matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]); if (id && t) relMap[id[1]] = t[1][0] === '/' ? t[1].slice(1) : 'xl/' + t[1] }
  const sheets = [...(txt['xl/workbook.xml'] || '').matchAll(/<sheet\b[^>]*>/g)].map(m => { const nm = /name="([^"]*)"/.exec(m[0]), r = /r:id="([^"]+)"/.exec(m[0]); const path = r ? relMap[r[1]] : null; return { name: nm ? un(nm[1]) : 'Sheet', path, size: sizes[path] } });
  if (!sheets.length) throw new Error('Sheet not found');
  if (sheetIdx < 0) { sheetIdx = 0; let best = -1; sheets.forEach((x, i) => { if (x.size !== undefined && x.size > best) { best = x.size; sheetIdx = i } }) }
  if (!sheets[sheetIdx]) throw new Error('Sheet not found');
  const path = sheets[sheetIdx].path;
  const isDate = parseStyles(txt['xl/styles.xml'] || '');
  let H = null, W = 0, F = {}, buf = '', auto = 0, hdrRow = 0, hIdx = -1, preview = []; const rows = [], pre = [], dateCols = new Set(), K = 30;
  const cellRe = /<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  function parse(inner, cap, dense) {
    const row = dense ? new Array(W).fill(null) : [], fm = cap ? {} : null; let m, any = false; cellRe.lastIndex = 0;
    while ((m = cellRe.exec(inner))) {
      const body = m[2]; if (body === undefined) continue; const a = m[1]; let cl, s, t, fa = FAST.exec(a);
      if (fa) { cl = fa[1]; s = fa[2]; t = fa[3] } else { const x = /r="([A-Z]+)/.exec(a); if (!x) continue; cl = x[1]; s = (/ s="(\d+)"/.exec(a) || [])[1]; t = (/ t="(\w+)"/.exec(a) || [])[1] }
      const ci = colIdx(cl); if (dense && ci >= W) continue;
      let v = null, val = null; const vi = body.indexOf('<v>');
      if (vi >= 0) v = body.slice(vi + 3, body.indexOf('</v>', vi));
      if (t === 's') val = v === null ? null : (sst[+v] ?? null);
      else if (t === 'str') val = v === null ? null : un(v);
      else if (t === 'inlineStr') val = siText(body);
      else if (t === 'b') val = v === '1';
      else if (t === 'e') val = null;
      else if (v !== null && v !== '') { val = +v; if (val !== val) val = null; else if (s !== undefined && isDate[+s]) dateCols.add(ci) }
      if (cap) { const fx = /<f(?:\s[^>]*)?>([\s\S]*?)<\/f>/.exec(body); if (fx && fx[1]) fm[ci] = { f: un(fx[1]) } }
      if (val !== null && val !== '') { row[ci] = val; any = true }
    }
    return { row, fm, any };
  }
  const dens = r => { const o = new Array(W).fill(null); for (let i = 0; i < W && i < r.length; i++) if (r[i] !== undefined) o[i] = r[i]; return o };
  function finalize(h) {
    preview = pre.slice(0, 12).map(p => ({ rn: p.rn, cells: Array.from({ length: 12 }, (_, i) => p.row[i] ?? null) }));
    const hr = pre[h]; hdrRow = hr.rn; W = hr.row.length; H = [];
    for (let i = 0; i < W; i++) { const v = hr.row[i]; H.push(v == null || v === '' ? 'Col' + (i + 1) : String(v).trim()) }
    const first = pre[h + 1]; if (first) for (const c of Object.keys(first.fm)) if (+c < W) F[c] = { f: first.fm[c].f, row: first.rn };
    for (let i = h + 1; i < pre.length; i++) if (pre[i].any) rows.push(dens(pre[i].row));
    pre.length = 0;
  }
  function autoPick() {
    const cnt = pre.map(p => { let c = 0; for (let i = 0; i < p.row.length; i++) { const v = p.row[i]; if (v != null && v !== '') c++ } return c });
    const th = Math.max(2, Math.ceil(Math.max(0, ...cnt) * 0.8)), h = cnt.findIndex(c => c >= th); return h < 0 ? 0 : h;
  }
  function handleRow(inner, rn) {
    if (H === null) {
      const p = parse(inner, true, false); p.rn = rn; pre.push(p);
      if (headerRow) { if (hIdx < 0 && rn >= headerRow) hIdx = pre.length - 1; if (hIdx >= 0 && pre.length > hIdx + 1) finalize(hIdx) }
      else if (pre.length >= K) finalize(autoPick());
      return;
    }
    const p = parse(inner, false, true); if (p.any) rows.push(p.row);
  }
  await unzipPass(getStream, n => n !== path ? null : (t, fin) => {
    buf += t;
    for (;;) {
      const s = buf.indexOf('<row'); if (s < 0) { buf = fin ? '' : buf.slice(Math.max(0, buf.length - 5)); break }
      const k = buf.indexOf('>', s); if (k < 0) break;
      if (buf.charCodeAt(k - 1) === 47) { buf = buf.slice(k + 1); continue }
      const e = buf.indexOf('</row>', k); if (e < 0) { buf = buf.slice(s); break }
      const rm = /\br="(\d+)"/.exec(buf.slice(s, k)); handleRow(buf.slice(k + 1, e), rm ? +rm[1] : ++auto); buf = buf.slice(e + 6);
    }
  }, onProgress);
  if (H === null) { if (!pre.length) throw new Error('Sheet is empty'); finalize(headerRow ? (hIdx >= 0 ? hIdx : pre.length - 1) : autoPick()) }
  return { H, rows, F, dateCols: [...dateCols], hdrRow, preview, dataPath: path, sheets: sheets.map(x => ({ name: x.name, size: x.size, path: x.path })), sheetIdx };
}

/* ---------- csv ---------- */
function readCsvText(t, headerRow = 0) {
  const out = []; let row = [], f = '', q = false, i = 0; const n = t.length; if (t.charCodeAt(0) === 0xFEFF) i = 1;
  const num = s => /^-?(0|[1-9]\d*)(\.\d+)?$/.test(s) ? +s : s;
  for (; i < n; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++ } else q = false } else f += c }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); f = ''; out.push(row); row = [] } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); out.push(row) }
  let h = 0;
  if (headerRow) h = Math.min(Math.max(headerRow - 1, 0), Math.max(out.length - 1, 0));
  else { const cnt = out.slice(0, 30).map(r => r.filter(x => x !== '').length), th = Math.max(2, Math.ceil(Math.max(0, ...cnt) * 0.8)); h = Math.max(0, cnt.findIndex(c => c >= th)) }
  const H = (out[h] || []).map((x, i) => x.trim() || 'Col' + (i + 1)), W = H.length;
  const rows = out.slice(h + 1).filter(r => r.some(x => x !== '')).map(r => { const o = new Array(W).fill(null); for (let c = 0; c < W; c++) { const v = r[c]; if (v !== undefined && v !== '') o[c] = num(v) } return o });
  return { H, rows, F: {}, dateCols: [], hdrRow: h + 1, sheets: [], sheetIdx: 0, preview: out.slice(0, 12).map((r, i) => ({ rn: i + 1, cells: Array.from({ length: 12 }, (_, k) => (r[k] === '' ? null : r[k]) ?? null) })) };
}

/* ---------- write xlsx ---------- */
const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const mkZip = parts => new ff.Zip((err, chunk) => { if (err) throw err; parts.push(chunk) });
const addText = (zip, name, str) => { const f = new ff.ZipDeflate(name, { level: 1 }); zip.add(f); f.push(new TextEncoder().encode(str), true) };
/* data sheet XML (header row = o.hdr, date style = o.ds, header style = o.hs) */
async function sheetPart(zip, d, o) {
  const { H, rows, F } = d, W = H.length, n = rows.length, hdr = o.hdr || 1, dc = new Set(d.dateCols || []), enc = new TextEncoder();
  const fa = new Array(W); for (const c of Object.keys(F || {})) if (+c < W) fa[+c] = compileFormula(F[c].f, F[c].row);
  const sh = new ff.ZipDeflate(o.path, { level: 1 }); zip.add(sh);
  const cn = Array.from({ length: W }, (_, i) => colName(i)), last = cn[W - 1] + (hdr + n), dsa = o.ds != null ? ' s="' + o.ds + '"' : '', hsa = o.hs != null ? ' s="' + o.hs + '"' : '';
  const cf = d.colFmt || {}, sty = new Array(W).fill(null), zero = !!o.zero, bsa = o.bs != null ? ' s="' + o.bs + '"' : '';
  for (let c = 0; c < W; c++) { const k = cf[c]; if (k === 't1' && o.t1 != null) sty[c] = ' s="' + o.t1 + '"'; else if (k === 't2' && o.t2 != null) sty[c] = ' s="' + o.t2 + '"'; else if ((k === 'date' || dc.has(c)) && o.ds != null) sty[c] = dsa }
  const wd = H.map(h => Math.min(40, Math.max(10, String(h).length * 1.15 + 3)));
  for (let k = 0; k < Math.min(n, 300); k++) { const row = rows[k]; for (let c = 0; c < W; c++) { const v = row[c]; if (v != null) { const L = typeof v === 'string' ? Math.min(45, v.length + 2) : 13; if (L > wd[c]) wd[c] = L } } }
  for (let c = 0; c < W; c++) { const k = cf[c]; if (k === 't2') wd[c] = Math.max(wd[c], 22); else if (k === 't1') wd[c] = Math.max(wd[c], 11); else if (k === 'date' || dc.has(c)) wd[c] = Math.max(wd[c], 13) }
  const cols = '<cols>' + wd.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w.toFixed(1)}" customWidth="1"/>`).join('') + '</cols>';
  let s = X + `<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="${hdr}" topLeftCell="A${hdr + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData><row r="${hdr}" ht="32" customHeight="1">`;
  for (let c = 0; c < W; c++) s += `<c r="${cn[c]}${hdr}"${hsa} t="inlineStr"><is><t xml:space="preserve">${esc(String(H[c]))}</t></is></c>`;
  s += '</row>'; sh.push(enc.encode(s), false);
  const B = 2000;
  for (let k0 = 0; k0 < n; k0 += B) {
    let out = ''; const k1 = Math.min(n, k0 + B);
    for (let k = k0; k < k1; k++) {
      const r = hdr + k + 1, row = rows[k]; out += '<row r="' + r + '">';
      for (let c = 0; c < W; c++) {
        const fx = fa[c];
        if (fx !== undefined) { out += '<c r="' + cn[c] + r + '"' + bsa + '><f>' + esc(fx(r).slice(1)) + '</f></c>'; continue }
        let v = row[c]; if (v == null || v === '') { if (!zero) continue; v = 0 } const t = typeof v;
        if (t === 'number') { if (v === v && v !== Infinity && v !== -Infinity) { const sy = sty[c]; out += '<c r="' + cn[c] + r + '"' + (sy && v !== 0 ? sy : bsa) + '><v>' + v + '</v></c>' } }
        else if (t === 'string') { out += '<c r="' + cn[c] + r + '"' + bsa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>' }
        else if (t === 'boolean') out += '<c r="' + cn[c] + r + '"' + bsa + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      }
      out += '</row>';
    }
    sh.push(enc.encode(out), false); o.onProgress && o.onProgress(k1, n); await tick();
  }
  sh.push(enc.encode(`</sheetData><autoFilter ref="A${hdr}:${last}"/></worksheet>`), true);
}

/* ---------- Report Dashboard sheet (new sheet added on download) ---------- */
const DASH_NAME = 'Report Dashboard', DASH_PATH = 'xl/worksheets/dsr_dashboard.xml';
/* style key: [font, fill(-1 = none), border(0/1), align, indent, numFmt] */
const DASH_SPEC = {
  title: [0, 0, 0, 'left', 1, 0], sub: [1, 0, 0, 'left', 1, 0], kpiL: [6, 4, 0, 'center', 0, 0], kpiV: [5, 4, 0, 'center', 0, 3],
  rep: [11, 0, 0, 'left', 1, 0], hdr: [2, 0, 1, 'center', 0, 0], hdrL: [2, 0, 1, 'left', 1, 0],
  secL: [3, 1, 1, 'left', 1, 0], secN: [3, 1, 1, 'center', 0, 197], secT: [3, 3, 1, 'center', 0, 197],
  rowL: [4, -1, 1, 'left', 2, 0], rowN: [4, -1, 1, 'center', 0, 197], rowLz: [4, 2, 1, 'left', 2, 0], rowNz: [4, 2, 1, 'center', 0, 197], rowT: [3, 2, 1, 'center', 0, 197],
  note: [7, -1, 0, 'left', 0, 0], hl: [3, 4, 0, 'left', 1, 0] };
for (let i = 0; i < 7; i++) { DASH_SPEC['kL' + i] = [9, 5 + i, 0, 'center', 0, 0]; DASH_SPEC['kV' + i] = [10, 5 + i, 0, 'center', 0, 3]; }
function dashStyles(fb, flb, bb) {
  const F = [['b', 20, 'FFFFFFFF'], ['', 10, 'FFD6EADF'], ['b', 11, 'FFFFFFFF'], ['b', 11, 'FF1F2937'], ['', 11, 'FF1F2937'], ['b', 20, 'FF1E6B52'], ['b', 9, 'FF6B7280'], ['i', 9, 'FF6B7280'], ['b', 13, 'FF1E6B52'], ['b', 9, 'FFFFFFFF'], ['b', 24, 'FFFFFFFF'], ['b', 14, 'FFFFFFFF']];
  const L = ['FF1E6B52', 'FFE3F1EA', 'FFF6F9F7', 'FFCFE5DA', 'FFEEF4F1', 'FF0F766E', 'FF4F46E5', 'FF10B981', 'FFDC2626', 'FFD97706', 'FF0284C7', 'FF7C3AED'], keys = Object.keys(DASH_SPEC);
  return {
    keys, nF: F.length, nFl: L.length, nX: keys.length,
    fonts: F.map(([b, z, c]) => `<font>${b === 'b' ? '<b/>' : b === 'i' ? '<i/>' : ''}<sz val="${z}"/><color rgb="${c}"/><name val="Calibri"/></font>`).join(''),
    fills: L.map(c => `<fill><patternFill patternType="solid"><fgColor rgb="${c}"/><bgColor indexed="64"/></patternFill></fill>`).join(''),
    border: '<border><left style="thin"><color rgb="FFBFD3CA"/></left><right style="thin"><color rgb="FFBFD3CA"/></right><top style="thin"><color rgb="FFBFD3CA"/></top><bottom style="thin"><color rgb="FFBFD3CA"/></bottom><diagonal/></border>',
    xfs: keys.map(k => { const [f, fl, b, h, ind, nf] = DASH_SPEC[k]; return `<xf numFmtId="${nf}" fontId="${fb + f}" fillId="${fl < 0 ? 0 : flb + fl}" borderId="${b ? bb : 0}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="center"${ind ? ` indent="${ind}"` : ''}${k === 'note' ? ' wrapText="1"' : ''}/></xf>` }).join('') };
}
/* adds the dashboard fonts/fills/borders/xfs to styles.xml; returns {t, sid} (sid = style key -> cellXfs index) */
function addDashStyles(t) {
  const gc = tag => { const r = new RegExp('<' + tag + '\\b[^>]*?count="(\\d+)"').exec(t); return r ? +r[1] : null };
  const fb = gc('fonts'), flb = gc('fills'), bb = gc('borders'), xb = gc('cellXfs');
  if (fb == null || flb == null || bb == null || xb == null) return null;
  const s = dashStyles(fb, flb, bb);
  const bump = (tag, n, xml) => { const c0 = gc(tag); t = t.replace(new RegExp('<' + tag + '\\b([^>]*?)count="\\d+"'), (a, r) => `<${tag}${r}count="${c0 + n}"`).replace('</' + tag + '>', xml + '</' + tag + '>') };
  bump('fonts', s.nF, s.fonts); bump('fills', s.nFl, s.fills); bump('borders', 1, s.border); bump('cellXfs', s.nX, s.xfs);
  const nf = '<numFmt numFmtId="197" formatCode="#,##0;\\-#,##0;&quot;–&quot;"/>';
  if (/<numFmts count="\d+"/.test(t)) t = t.replace(/<numFmts count="(\d+)"([^>]*)>/, (a, c, r) => `<numFmts count="${+c + 1}"${r}>`).replace('</numFmts>', nf + '</numFmts>');
  else t = t.replace(/(<styleSheet\b[^>]*>)/, `$1<numFmts count="1">${nf}</numFmts>`);
  const sid = {}; s.keys.forEach((k, i) => { sid[k] = xb + i });
  return { t, sid };
}
const zeroSid = () => Object.fromEntries(Object.keys(DASH_SPEC).map(k => [k, 0]));
/* m = {widths:[..], rows:[{ht, c:[[value, styleKey], ...]}], merges:['A1:G1']} */
async function dashPart(zip, m, sid, path) {
  let s = X + `<worksheet ${NS}><sheetPr><tabColor rgb="FF1E6B52"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>` +
    m.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols><sheetData>';
  m.rows.forEach((r, i) => {
    const rn = i + 1; s += `<row r="${rn}"${r.ht ? ` ht="${r.ht}" customHeight="1"` : ''}>`;
    (r.c || []).forEach(([v, k], ci) => {
      if (k == null) return; const ref = colName(ci) + rn, sa = ` s="${sid[k] || 0}"`;
      if (typeof v === 'number' && v === v) s += `<c r="${ref}"${sa}><v>${v}</v></c>`;
      else if (v == null || v === '') s += `<c r="${ref}"${sa}/>`;
      else s += `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    });
    s += '</row>';
  });
  s += '</sheetData>' + (m.merges && m.merges.length ? `<mergeCells count="${m.merges.length}">` + m.merges.map(x => `<mergeCell ref="${x}"/>`).join('') + '</mergeCells>' : '') + (m.cf || []).map(([r1, r2, ci, col], i) => `<conditionalFormatting sqref="${colName(ci)}${r1}:${colName(ci)}${r2}"><cfRule type="dataBar" priority="${i + 1}"><dataBar><cfvo type="num" val="0"/><cfvo type="max"/><color rgb="FF${col.slice(1)}"/></dataBar></cfRule></conditionalFormatting>`).join('') + '</worksheet>';
  const f = new ff.ZipDeflate(path, { level: 1 }); zip.add(f); f.push(new TextEncoder().encode(s), true);
}
/* simple: new workbook (single sheet only) */
async function writeXlsx(d, opt = {}) {
  const sheet = opt.sheet || 'DSR', parts = [], zip = mkZip(parts);
  addText(zip, '[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' + (opt.dash ? '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : '') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  addText(zip, '_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  addText(zip, 'xl/workbook.xml', X + `<workbook ${NS} ${RNS}><sheets><sheet name="${esc(sheet)}" sheetId="1" r:id="rId1"/>${opt.dash ? `<sheet name="${DASH_NAME}" sheetId="2" r:id="rId3"/>` : ''}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  addText(zip, 'xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' + (opt.dash ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' : '') + '</Relationships>');
  let sty = X + `<styleSheet ${NS}><numFmts count="3"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/><numFmt numFmtId="165" formatCode="hh:mm:ss"/><numFmt numFmtId="166" formatCode="dd\\-mm\\-yyyy\\ hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E6B52"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`; let sid = null; if (opt.dash) { const r = addDashStyles(sty); if (r) { sty = r.t; sid = r.sid } } addText(zip, 'xl/styles.xml', sty);
  await sheetPart(zip, d, { path: 'xl/worksheets/sheet1.xml', hdr: 1, ds: 1, hs: 2, t1: 3, t2: 4, bs: 5, zero: opt.zero, onProgress: opt.onProgress }); if (opt.dash) await dashPart(zip, opt.dash, sid || zeroSid(), 'xl/worksheets/sheet2.xml'); zip.end();
  return parts;
}
/* uses the original file as base and replaces only the data sheet: other sheets, formulas and pivots are preserved */
async function writeXlsxPreserve(d, getStream, opt = {}) {
  const parts = [], zip = mkZip(parts), dp = d.dataPath, rel = dp.replace('worksheets/', 'worksheets/_rels/') + '.rels', hdr = d.hdrRow || 1;
  const last = colName(d.H.length - 1) + (hdr + d.rows.length); let ds = null, t1 = null, t2 = null, hs = null, bs = null, dsid = null;
  const patch = (n, t) => {
    if (n === '[Content_Types].xml') { t = t.replace(/<Override[^>]*calcChain[^>]*\/>/g, ''); if (opt.dash) { if (d.dashPath) t = t.replace(/<Override\b[^>]*>/g, m => m.includes('PartName="/' + d.dashPath + '"') ? '' : m); t = t.replace('</Types>', '<Override PartName="/' + DASH_PATH + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') } return t }
    if (n === 'xl/_rels/workbook.xml.rels') { t = t.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/g, ''); if (opt.dash) { if (d.dashPath) { const tg = d.dashPath.replace(/^xl\//, ''); t = t.replace(/<Relationship\b[^>]*>/g, m => (m.includes('Target="' + tg + '"') || m.includes('Target="/' + d.dashPath + '"')) ? '' : m) } t = t.replace('</Relationships>', '<Relationship Id="rIdDsrDash" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/dsr_dashboard.xml"/></Relationships>') } return t }
    if (n === 'xl/workbook.xml') {
      t = t.replace(/<definedName\b[^>]*name="_xlnm\._FilterDatabase"[^>]*>[^<]*<\/definedName>/g, '').replace(/<definedNames>\s*<\/definedNames>/g, '');
      if (opt.dash) { if (d.dashPath) t = t.replace(/<sheet\b[^>]*name="Report Dashboard"[^>]*\/>/, ''); const ids = [...t.matchAll(/<sheet\b[^>]*sheetId="(\d+)"/g)].map(q => +q[1]); t = t.replace('</sheets>', `<sheet name="${DASH_NAME}" sheetId="${Math.max(0, ...ids) + 1}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDsrDash"/></sheets>`) }
      if (/<calcPr\b[^>]*\/>/.test(t)) return t.replace(/<calcPr\b([^>]*?)\s*\/>/, (m, a) => /fullCalcOnLoad/.test(a) ? m : `<calcPr${a} fullCalcOnLoad="1"/>`);
      return t.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
    }
    if (n === 'xl/styles.xml') {
      const m = /<cellXfs count="(\d+)"/.exec(t); if (!m) return t; const base = +m[1]; ds = base; t1 = base + 1; t2 = base + 2;
      const nf = '<numFmt numFmtId="196" formatCode="dd\\-mm\\-yyyy\\ hh:mm:ss"/>';
      if (/<numFmts count="\d+"/.test(t)) t = t.replace(/<numFmts count="(\d+)"([^>]*)>/, (a, c, r) => `<numFmts count="${+c + 1}"${r}>`).replace('</numFmts>', nf + '</numFmts>');
      else t = t.replace(/(<styleSheet\b[^>]*>)/, `$1<numFmts count="1">${nf}</numFmts>`);
      const gc = tag => { const r = new RegExp('<' + tag + '\\b[^>]*?count="(\\d+)"').exec(t); return r ? +r[1] : null };
      const fN = gc('fonts'), flN = gc('fills'), bN = gc('borders'), fancy = fN != null && flN != null && bN != null; let bid = 0;
      if (fancy) {
        bid = bN;
        const bump = (tag, xml) => { const c0 = gc(tag); t = t.replace(new RegExp('<' + tag + '\\b([^>]*?)count="\\d+"'), (a, r) => `<${tag}${r}count="${c0 + 1}"`).replace('</' + tag + '>', xml + '</' + tag + '>') };
        bump('fonts', '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>');
        bump('fills', '<fill><patternFill patternType="solid"><fgColor rgb="FF1E6B52"/><bgColor indexed="64"/></patternFill></fill>');
        bump('borders', '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>');
      }
      const xf = (nfid, extra = '', inner = '') => { const h = extra.includes('H'), at = `<xf numFmtId="${nfid}" fontId="${h ? fN : 0}" fillId="${h ? flN : 0}" borderId="${bid}" xfId="0" applyNumberFormat="1" applyBorder="1"${h ? ' applyFont="1" applyFill="1" applyAlignment="1"' : ''}`; return inner ? at + '>' + inner + '</xf>' : at + '/>' };
      let xs = xf(14) + xf(21) + xf(196);
      if (fancy) { xs += xf(0, 'H', '<alignment horizontal="center" vertical="center" wrapText="1"/>') + xf(0); hs = base + 3; bs = base + 4 }
      t = t.replace(m[0], `<cellXfs count="${base + 3 + (fancy ? 2 : 0)}"`).replace('</cellXfs>', xs + '</cellXfs>');
      if (opt.dash && fancy) { const r = addDashStyles(t); if (r) { t = r.t; dsid = r.sid } }
      return t;
    }
    if (/pivotCacheDefinition\d+\.xml$/.test(n)) {
      t = /refreshOnLoad=/.test(t) ? t : t.replace(/<pivotCacheDefinition\b/, '<pivotCacheDefinition refreshOnLoad="1"');
      return t.replace(/<worksheetSource\b[^>]*>/, m => (d.sheetName && m.includes('sheet="' + esc(d.sheetName).replace(/"/g, '&quot;') + '"')) ? m.replace(/ref="[^"]*"/, `ref="A${hdr}:${last}"`) : m);
    }
    return t;
  };
  const isPatch = n => n === '[Content_Types].xml' || n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/styles.xml' || /^xl\/pivotCache\/pivotCacheDefinition\d+\.xml$/.test(n);
  const uz = new ff.Unzip(); uz.register(ff.UnzipInflate); uz.register(ff.UnzipPassThrough);
  uz.onfile = f => {
    if (f.name === dp || f.name === rel || f.name === 'xl/calcChain.xml') return;
    if (opt.dash && (f.name === DASH_PATH || (d.dashPath && (f.name === d.dashPath || f.name === d.dashPath.replace('worksheets/', 'worksheets/_rels/') + '.rels')))) return;
    if (isPatch(f.name)) { let t = ''; const dec = new TextDecoder(); f.ondata = (err, c, fin) => { if (err) throw err; t += dec.decode(c, { stream: !fin }); if (fin) addText(zip, f.name, patch(f.name, t)) }; f.start(); return }
    const out = new ff.ZipDeflate(f.name, { level: 1 }); zip.add(out); f.ondata = (err, c, fin) => { if (err) throw err; out.push(c, fin) }; f.start();
  };
  let n = 0, ly = 0;
  for await (const c of chunks(getStream())) { uz.push(c, false); n += c.length; if (n - ly > 4194304) { ly = n; opt.onCopy && opt.onCopy(n); await tick() } }
  uz.push(new Uint8Array(0), true);
  await sheetPart(zip, d, { path: dp, hdr, ds, hs, bs, t1, t2, zero: opt.zero, onProgress: opt.onProgress }); if (opt.dash) await dashPart(zip, opt.dash, dsid || zeroSid(), DASH_PATH); zip.end();
  return parts;
}
const api = { readXlsx, readCsvText, writeXlsx, writeXlsxPreserve, compileFormula, colName, colIdx };
root.DSRCore = api; if (typeof module !== 'undefined') module.exports = api;
})();
