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
- **Sheet:** agar file me kai sheets hain to tool sabse badi sheet (asli data) apne aap chunta hai. Galat ho to file ke bagal ke "Sheet" dropdown se sahi sheet chuno.
- **Header row:** tool apne aap pehchanta hai (upar Pivot filter / title rows ho to bhi). Galat ho to file ke bagal me "Header row no." me sahi Excel row number likh kar "Dobara padho" dabao. Header ke upar ke cells (absolute refs jaise $A$1) final file me nahi aate.
- **Order Data mapping:** Order file upload karte hi VC preset (SKU←SKU, Warehouse←Process By, AWB←Tracking Number ... 14 jodiyan) apne aap lag jati hai. "⚡ Auto mapping" button se dobara lagao, ya apni mapping file (2 columns: DSR | Order Data) upload karo. Manual badalna hamesha ho sakta hai. Mapping DSR ke **purane aur naye dono naamon** par chalti hai: DSR me agar column ka naam order file ke naam jaisa badal diya gaya hai (jaise Warehouse -> Process By), to wahi column apne aap mil jata hai. Mapping file ka format: pehla column = **DSR ke column ka naam**, dusra = **Order data ke column ka naam** (sample: DSR_VC_Order_Data_correct.xlsx). Upload ki hui mapping file browser me save hoti hai aur agli baar apne aap lagti hai (jo naam nahi milte wo laal rang me dikhte hain); "Original preset par wapas" se purani preset aa jati hai.
- **Courier column (nayi rows):** Step 2 me ③ Courier column hai. DSR ka Tracking column me tracking ID ho to Courier me `AWB`, nahi (blank/0) to `0` jata hai. Dono dropdown auto-select hote hain (Courier / Tracking Number), badal sakte ho.
- **④ Existing rows ka status update:** jo orders DSR me pehle se hain unke chune hue columns (default: Process By, Tracking Number, Payment Status, Order Status) Order data se update hote hain (order data me blank ho to DSR ki purani value rehti hai). ③ ka Courier rule (tracking ho to AWB, warna 0) in rows par bhi lagta hai. Update ke baad matched rows par Final Remark/Remark rules wapas chalte hain (checkbox, default tick). "▶ Sab ek saath chalao" button: missing rows add → status update → Courier → Remark rules, ek click me.
- Flow: 1 Master (important columns khud select) → 2 Order Data → 3 Last Mile → 4 Invoice → 5 FM Mile → 6 Dekho/Download. Download button upar hamesha hai.

## Limits / dhyan dene wali baatein
- Sirf **.xlsx / .xlsm / .csv** (purani .xls nahi). Tool ek sheet (data sheet) padhta aur update karta hai. Download ke upar "Dusri sheets/pivot rakho" tick ho to final file original file ko base bana kar banti hai: summary/dusri sheets aur unke formulas jas ke tas rehte hain, sirf data sheet badalti hai (data sheet ki cell colours/column widths nahi bachti). Tick hata do to sirf ek sheet wali file banti hai. Pivot table par refresh-on-open laga hota hai; real pivot par ye abhi test nahi hua, na refresh ho to Excel me Data → Refresh All dabao.
- Formula columns pehli data row se detect hote hain aur final file me **har row** (purani + nayi) ke liye row-wise dobara likhe jate hain. Cached values nahi hoti; Excel khulte hi calculate karta hai.
- Colours/borders/column widths copy nahi hote (header bold + freeze + filter lagta hai). Date columns date format me rehte hain.
- Undo: pichle 5 steps. Page refresh karne par data chala jata hai, isliye kaam ke beech final DSR download kar lena.
- 3 lakh se bahut zyada rows (8-9 lakh) ke liye `dsr-updater-pro` (Python, PC par) use karo.
