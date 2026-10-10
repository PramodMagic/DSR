# DSR Updater

Static tool (sirf `index.html`), koi build step nahi. Sab kuch browser me chalta hai; data kahin upload nahi hota.

## GitHub + Vercel
1. GitHub par naya repo banao aur `index.html` (aur ye README) upload/commit karo.
2. vercel.com → Add New → Project → us repo ko Import karo.
3. Framework Preset: **Other**, Build Command aur Output Directory khali chhodo → Deploy.

## Flow
1. Master DSR upload karo, important columns (Warehouse, Payment Status, Final Remark, Remark, AWB) confirm karo.
2. Order Data: match column chuno → Check → missing rows add → Remark rules.
3. Last Mile, Invoice, FM Mile files: match column + copy columns + filters.
4. "Final DSR Download" (upar hamesha available).
