# DSR Updater (3 lakh rows × 75 columns tak) — GitHub + Vercel

Static site: `index.html`, `core.js`, `fflate.min.js` (teeno ek hi folder me rahne chahiye). Koi build step nahi.

## Deploy
1. GitHub repo me ye teeno files commit karo.
2. Vercel → Add New → Project → repo Import → Framework Preset **Other** → Deploy.
Sab kuch aapke browser me chalta hai, data kahin upload nahi hota.

## Use karne ke liye
- Desktop Chrome / Edge (64-bit), **8 GB RAM** ya zyada. 3 lakh × 75 columns me ~1.5-2 GB memory lagti hai.
- Master load: ~1-2 min. Final Excel banana: ~1-2 min. Us waqt upar status me progress dikhta hai, tab band mat karo.
- Har file ke baad pehle ① **Lookup** (DSR ka column ↔ file ka column) chuno, phir ② **DSR column ← file column** jodo (naam alag ho to bhi chalega; "Same naam wale auto jodo" button bhi hai). Koi bhi auto-select nahi hota.
- **Header row:** tool apne aap pehchanta hai (upar Pivot filter / title rows ho to bhi). Galat ho to file ke bagal me "Header row no." me sahi Excel row number likh kar "Dobara padho" dabao. Header ke upar ke cells (absolute refs jaise $A$1) final file me nahi aate.
- Flow: 1 Master (important columns khud select) → 2 Order Data → 3 Last Mile → 4 Invoice → 5 FM Mile → 6 Dekho/Download. Download button upar hamesha hai.

## Limits / dhyan dene wali baatein
- Sirf **.xlsx / .xlsm / .csv** (purani .xls nahi). Sirf **pehli sheet** padhi aur likhi jati hai; dusri sheets final file me nahi aati (agar formulas unhe refer karte hain to wo toot jayenge).
- Formula columns pehli data row se detect hote hain aur final file me **har row** (purani + nayi) ke liye row-wise dobara likhe jate hain. Cached values nahi hoti; Excel khulte hi calculate karta hai.
- Colours/borders/column widths copy nahi hote (header bold + freeze + filter lagta hai). Date columns date format me rehte hain.
- Undo: pichle 5 steps. Page refresh karne par data chala jata hai, isliye kaam ke beech final DSR download kar lena.
- 3 lakh se bahut zyada rows (8-9 lakh) ke liye `dsr-updater-pro` (Python, PC par) use karo.
