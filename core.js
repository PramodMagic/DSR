/* DSR core: badi xlsx ko stream karke padhta/likhta hai (3 lakh rows x 75 columns tak). Browser aur Node dono me chalta hai. */
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
  uz.onfile = f => { const h = wanted(f.name); if (!h) return; const dec = new TextDecoder(); f.ondata = (err, c, fin) => { if (err) throw err; h(dec.decode(c, { stream: !fin }), fin) }; f.start() };
  let n = 0, ly = 0;
  for await (const c of chunks(getStream())) { uz.push(c, false); n += c.length; if (n - ly > 4194304) { ly = n; onProgress && onProgress(n); await tick() } }
  uz.push(new Uint8Array(0), true);
}
const FAST = /^r="([A-Z]+)\d+"(?: s="(\d+)")?(?: t="(\w+)")?/;
async function readXlsx(getStream, onProgress, sheetIdx = 0, headerRow = 0) {
  const txt = {}, sst = []; let sbuf = '';
  await unzipPass(getStream, n => {
    if (n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/styles.xml') { txt[n] = ''; return t => { txt[n] += t } }
    if (n === 'xl/sharedStrings.xml') return t => { sbuf += t; const re = /<si>([\s\S]*?)<\/si>|<si\/>/g; let m, last = 0; while ((m = re.exec(sbuf))) { sst.push(m[1] === undefined ? '' : siText(m[1])); last = re.lastIndex } sbuf = sbuf.slice(last) };
    return null;
  }, onProgress);
  const sheets = [...(txt['xl/workbook.xml'] || '').matchAll(/<sheet\b[^>]*>/g)].map(m => m[0]);
  if (!sheets[sheetIdx]) throw new Error('Sheet nahi mili');
  const rid = /r:id="([^"]+)"/.exec(sheets[sheetIdx])[1]; let path = null;
  for (const m of (txt['xl/_rels/workbook.xml.rels'] || '').matchAll(/<Relationship\b[^>]*>/g)) if (new RegExp('Id="' + rid + '"').test(m[0])) { const t = /Target="([^"]+)"/.exec(m[0])[1]; path = t[0] === '/' ? t.slice(1) : 'xl/' + t }
  const isDate = parseStyles(txt['xl/styles.xml'] || '');
  let H = null, W = 0, F = {}, buf = '', auto = 0, hdrRow = 0, hIdx = -1; const rows = [], pre = [], dateCols = new Set(), K = 30;
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
  if (H === null) { if (!pre.length) throw new Error('Sheet khali hai'); finalize(headerRow ? (hIdx >= 0 ? hIdx : pre.length - 1) : autoPick()) }
  return { H, rows, F, dateCols: [...dateCols], hdrRow };
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
  return { H, rows, F: {}, dateCols: [], hdrRow: h + 1 };
}

/* ---------- write xlsx ---------- */
const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', RNS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
async function writeXlsx(d, opt = {}) {
  const { H, rows, F } = d, W = H.length, n = rows.length, sheet = opt.sheet || 'DSR', dc = new Set(d.dateCols || []);
  const fm = {}; for (const c of Object.keys(F || {})) if (+c < W) fm[c] = compileFormula(F[c].f, F[c].row);
  const fa = new Array(W); for (const c of Object.keys(fm)) fa[+c] = fm[c]; const parts = []; const enc = new TextEncoder();
  const zip = new ff.Zip((err, chunk) => { if (err) throw err; parts.push(chunk) });
  const add = (name, str) => { const f = new ff.ZipDeflate(name, { level: 1 }); zip.add(f); f.push(enc.encode(str), true) };
  add('[Content_Types].xml', X + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  add('_rels/.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  add('xl/workbook.xml', X + `<workbook ${NS} ${RNS}><sheets><sheet name="${esc(sheet)}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  add('xl/_rels/workbook.xml.rels', X + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  add('xl/styles.xml', X + `<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  const sh = new ff.ZipDeflate('xl/worksheets/sheet1.xml', { level: 1 }); zip.add(sh);
  const cn = Array.from({ length: W }, (_, i) => colName(i)), last = cn[W - 1] + (n + 1);
  let s = X + `<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData><row r="1">`;
  for (let c = 0; c < W; c++) s += `<c r="${cn[c]}1" s="2" t="inlineStr"><is><t xml:space="preserve">${esc(String(H[c]))}</t></is></c>`;
  s += '</row>'; sh.push(enc.encode(s), false);
  const B = 2000;
  for (let k0 = 0; k0 < n; k0 += B) {
    let o = ''; const k1 = Math.min(n, k0 + B);
    for (let k = k0; k < k1; k++) {
      const r = k + 2, row = rows[k]; o += '<row r="' + r + '">';
      for (let c = 0; c < W; c++) {
        const fx = fa[c];
        if (fx !== undefined) { o += '<c r="' + cn[c] + r + '"><f>' + esc(fx(r).slice(1)) + '</f></c>'; continue }
        const v = row[c];
        if (v == null) continue;
        const t = typeof v;
        if (t === 'number') { if (v === v && v !== Infinity && v !== -Infinity) o += '<c r="' + cn[c] + r + (dc.has(c) ? '" s="1"' : '"') + '><v>' + v + '</v></c>' }
        else if (t === 'string') { if (v !== '') o += '<c r="' + cn[c] + r + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>' }
        else if (t === 'boolean') o += '<c r="' + cn[c] + r + '" t="b"><v>' + (v ? 1 : 0) + '</v></c>';
      }
      o += '</row>';
    }
    sh.push(enc.encode(o), false); opt.onProgress && opt.onProgress(k1, n); await tick();
  }
  sh.push(enc.encode(`</sheetData><autoFilter ref="A1:${last}"/></worksheet>`), true); zip.end();
  return parts;
}
const api = { readXlsx, readCsvText, writeXlsx, compileFormula, colName, colIdx };
root.DSRCore = api; if (typeof module !== 'undefined') module.exports = api;
})();
