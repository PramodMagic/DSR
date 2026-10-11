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
- **Special rule (Username):** DSR ke Username column me `onestopbulk` ho to Final Remark `Order Cancelled`, Remark `DF Order Cancelled` (Step 2 me editable). Ye rule sabse pehle lagta hai, baaki warehouse rules us row ko nahi chhuate, aur Last Mile bhi uska Remark nahi badalta. Payment Status dropdown se "Sirf PR" bhi chun sakte ho. Jin rows ka Final Remark pehle se Delivered to end buyer / Last Mile Intrasit / Order Cancelled hai (list editable) unpar ye rule aur baaki rules kuch nahi lagta, wo as it is rehti hain.
- **⑤ Order Date se columns (tab 6):** Month = mahine ka naam (October), Week = Week1.. (default: mahine ka week, 1-7 = Week1; ISO week bhi chun sakte ho), Time of order = sirf time, Payment by reseller = sirf date. Download se pehle aur "Sab ek saath chalao" ke aakhir me apne aap chalta hai (checkbox). In columns me pehle formula ho to ab seedha value ban jati hai (Undo se wapas).
- **🔄 Update Order Data (upar header me):** ek click me: missing orders add → status update → Courier → Remark rules (Special rule samet) → Order Date columns. Khatam hone par summary dikhti hai aur seedha Download ka button milta hai. (Pehle Master + Step 2 me Order file upload karni hoti hai.)
- **Page saaf rakhne ke liye:** Step 2 ke sections (② mapping, ③ Courier, ④ status update, advanced rules) folded rehte hain, "Sab kholo / Sab band karo" se control karo. Header ka "ℹ️ Help text" checkbox lambi samjhane wali lines dikhata/chhupata hai (browser yaad rakhta hai).
- **Download formatting:** header hara rang + bold safed text + wrap, patli border har cell par, column ki chaudai apne aap, header freeze aur filter. "⚙ Download options" me: dusri sheets rakho, aur **khali cells 0 se bharo** (formula wale columns chhodkar; sirf downloaded file me, DSR data nahi badalta).
- **Step 3 Last Mile (Logistics_Logic.docx ke hisaab se):** ① Lookup (DSR column ↔ logistics column) + extra lookup columns jo serial wise try hote hain (pehla na mile to agla). Phir A, B, C teen steps, har ek me DSR date column ← logistics date column:
  - **A Pickup:** date sirf tab bharti hai jab DSR me khali ho. Pickup date bhari (nayi ya purani) ho aur Final Remark in 5 me ho (Bulk9 Order Pending, Dispatch Pending at india wh, FM Intrasit, Invoice Not Prepared, WH Not Assigned) → Last Mile Intrasit / Last Mile Intrasit.
  - **B Delivery:** delivery date bhari ho aur Final Remark in 6 me ho (upar ke 5 + Last Mile Intrasit) → Delivered to end buyer / Shipment Delivered.
  - **C RTO:** RTO date (ek ya zyada columns) bhari ho to koi bhi Final Remark/Remark ho → Order Cancelled / RTO Received.
  Teeno A → B → C order me chalte hain (baad wala pehle ko override karta hai). Username special rule (DF Order Cancelled) wali rows ko ye steps nahi chhuate. Text dates (2026-10-05, 05-10-2026) apne aap Excel date ban jati hain. Remark/list sab editable hain.
- Flow: 1 Master (important columns khud select) → 2 Order Data → 3 Last Mile → 4 Invoice → 5 FM Mile → 6 Dekho/Download. Download button upar hamesha hai.

## Limits / dhyan dene wali baatein
- Sirf **.xlsx / .xlsm / .csv** (purani .xls nahi). Tool ek sheet (data sheet) padhta aur update karta hai. Download ke upar "Dusri sheets/pivot rakho" tick ho to final file original file ko base bana kar banti hai: summary/dusri sheets aur unke formulas jas ke tas rehte hain, sirf data sheet badalti hai (data sheet ki cell colours/column widths nahi bachti). Tick hata do to sirf ek sheet wali file banti hai. Pivot table par refresh-on-open laga hota hai; real pivot par ye abhi test nahi hua, na refresh ho to Excel me Data → Refresh All dabao.
- Formula columns pehli data row se detect hote hain aur final file me **har row** (purani + nayi) ke liye row-wise dobara likhe jate hain. Cached values nahi hoti; Excel khulte hi calculate karta hai.
- Colours/borders/column widths copy nahi hote (header bold + freeze + filter lagta hai). Date columns date format me rehte hain.
- Undo: pichle 5 steps. Page refresh karne par data chala jata hai, isliye kaam ke beech final DSR download kar lena.
- 3 lakh se bahut zyada rows (8-9 lakh) ke liye `dsr-updater-pro` (Python, PC par) use karo.
