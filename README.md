# DSR Updater (3 lakh rows × 75 columns tak) — GitHub + Vercel

Static site: `index.html`, `core.js`, `fflate.min.js` (teeno ek hi folder me). Koi build step nahi. Sab kuch browser me chalta hai, data kahin upload nahi hota.
Deploy: GitHub repo me teeno files commit → Vercel me Import → Framework Preset "Other" → Deploy.
Browser: desktop Chrome/Edge, 8 GB RAM. Sirf .xlsx/.xlsm/.csv. Download se pehle kaam save nahi hota (page refresh = data gaya).

## Look & feel
Naya design: stepper tabs (✓ badge jab step ho jaye), glass header, Light/Dark mode (🌙 button, yaad rehta hai), loading ke waqt upar chalti progress line, collapsible sections aur "ℹ️ Help" se lambi lines hide/show.

## Flow
Tabs: **1 Master → 2 Order Data → 3 Invoice → 4 FM Mile → 5 Last Mile → 6 Dekho & Download → 7 Report Dashboard**. Ye sirf serial hai, zaroori nahi: Master (aur 5 important columns) ke baad koi bhi step kabhi bhi, kisi bhi order me chala sakte ho.
Galat file upload ho gayi ho to bina refresh kiye dusri file chun lo: purana result/mapping hat jata hai, lookup columns (naam same ho to) wahi rehte hain, aur Step 2 me check apne aap dobara chalta hai. Same naam ki file dobara chun sakte ho. Galat file ka update ho chuka ho to ↩ Undo (pichle 5 steps), ya naya Master upload karo (sab reset ho jata hai).
Header me **🔄 Update Order Data** = Step 2 ka poora kaam ek click me. Header ka "ℹ️ Help text" lambi lines dikhata/chhupata hai.

## Step 2 · Order Data (AOrder_Data_Final_Remark_and_Remark_Rules.docx)
Lookup + column mapping (14 jodiyan auto) → missing orders add → **Phase 1** (nayi rows) → status update (④) → **Phase 2** (order data se match hui nayi+purani rows) → Courier (tracking ho to AWB, warna 0) → Special rule → Order Date se Month/Week/Time/Date.
Process By × Payment Status × Courier ke targets:
| Process By | PD | PR | PU |
|---|---|---|---|
| Bulk, India | Dispatch Pending At India WH / WH Working | Order Cancelled / WH Working | Dispatch Pending At India WH / Reseller Payment Not Done |
| Bulk9 | Bulk9 Order Dispatch Pending AT India WH / WH Working | Order Cancelled / WH Working | Bulk9 Order Dispatch Pending AT India WH / Reseller Payment Not Done |
| China, China-CJ, Courier AWB | Invoice Not Prepared / Processed By China | Order Cancelled / Processed By China | Invoice Not Prepared / Reseller Payment Not Done |
| China, China-CJ, Courier blank/0 | Not Processed By China / Not Processed By China | Order Cancelled / Cancelled By China | Not Processed By China / Reseller Payment Not Done |
| Blank/0 | WH Not Assigned / WH Not Assigned | Order Cancelled / WH Not Assigned | WH Not Assigned / Reseller Payment Not Done |
- **Phase 1:** sirf jahan Final Remark aur Remark dono blank/0.
- **Phase 2:** Final Remark blank/0 ya in me se: Bulk9 Order Dispatch Pending AT India WH, Dispatch Pending At India WH, Invoice Not Prepared, Not Processed By China, WH Not Assigned. (Blank Process By me dono blank hone chahiye.) Purana "Bulk9 Order Pending" bhi isi list ka maana jata hai; naam me capital/small ka farq nahi.
- **Special rule:** Username = onestopbulk aur Final Remark in me se (blank, Bulk9 Order Dispatch Pending AT India WH, FM Intrasit, Dispatch Pending At India WH, Invoice Not Prepared, Not Processed By China, WH Not Assigned, Reached AT India WH) → Order Cancelled / DF Order Cancelled. Payment status ki shart nahi (document me nahi hai); Payment dropdown se "Sirf PR" chun sakte ho. Phase 1/2 ke baad lagta hai. Sab editable.
- Process By ki koi aur value (jaise "Price Hold") ke liye koi rule nahi, row jaisi hai waisi rehti hai.

## Step 4 (tab 4) · FM Mile
FM file ke columns fix hain (auto mapping, "+ Column add" se aur jod sakte ho): pickup date → Pick up from SFC · Recd at SZN WH Dt. → Date of receiving in FW HUB / MCI · HAWB No. → Transporter AWB · date → Flight Connect date · Actual arrival → Date arrival at Indian Customs · customs cleared dt. → Date of Customs clerance · delivery at GGN WH → Arrival in Indian Warehouse.
Fill ke baad: DSR ke "Arrival in Indian Warehouse" me date bhari ho aur Final Remark list me ho (Bulk9 Order Dispatch Pending AT India WH, Dispatch Pending At India WH, FM Intrasit, Invoice Not Prepared, Not Processed By China, WH Not Assigned) → Reached AT India WH / WH Working. List me tick hatao = hata do, "+ Jodo" se naya remark jodo. Naya Final Remark/Remark editable. Default: sirf FM file se match hui rows (dropdown se Poori DSR).

## Step 5 (tab 5) · Last Mile (ALogistics_Logic.docx)
Sabse upar **courier / logistics company** chuno (15 courier + 10 aggregators). Us courier ke columns (lookup, A/B/C) update ke baad yaad ho jate hain aur agli baar file upload par apne aap lagte hain. Lookup serial wise (pehla na mile to agla column). Match, DSR date khali ho to hi bharti hai. Date bhari ho (nayi ya purani) aur Final Remark list me ho to:
- **A Pickup:** → Last Mile Intrasit / Last Mile Intrasit. List: blank, Bulk9…, FM Intrasit, Dispatch Pending…, Invoice Not Prepared, Not Processed By China, WH Not Assigned, Reached AT India WH.
- **B Delivery:** → Delivered to end buyer / Shipment Delivered. List: A wali + **Last Mile Intrasit**.
- **C RTO:** → Order Cancelled / RTO Received. List: B wali + Delivered to end buyer + Order Cancelled.
Date khali ho to kuch nahi badalta. Result ke neeche "Jaanch" dikhti hai (logistics column me asli value kitni rows me hai). N/A/NA/null/- khali maane jate hain.

## Step 3 (tab 3) · Invoice (AInvoice_Final_And_Remarks.docx)
Auto mapping: Shopperr Invoice Number ← invoice number, Invoice Received Date ← Received (ya Received date), SFC Qty ← QTY, SFC Value ← TOTAL PRICE(RMB), Shopperr Invoice Date ← Date (ya Invoice Date), Invoice SKU ← SKU. Ek order ki kai invoice rows ho to **SFC Qty / SFC Value jod (sum)** diye jate hain, **Invoice SKU** me alag SKU comma se aate hain. Sirf match hue orders. DSR ke saare Final Remark checkbox me dikhte hain (default: blank, Bulk9…, Dispatch Pending…, Invoice Not Prepared, Not Processed By China, WH Not Assigned). Invoice Number bhara ho aur Final Remark chune hue me ho to → FM Intrasit / FM Intrasit.

## Download
Hara header, borders, auto column width, freeze + filter. "⚙ Download options": dusri sheets/pivot rakho, khali cells 0 (formula columns chhodkar). Download se pehle Month/Week/Time/Date columns apne aap bharte hain (tab 6 me ⑤).

## Tab 7 · Report Dashboard (nayi sheet, reports ek-ek karke)
Download hone wali DSR me **Report Dashboard** naam ki nayi sheet judti hai (screen par bhi same dashboard dikhta hai: KPI cards + Month / Week / Date wise table). Dobara download par purani Report Dashboard sheet naye se badal jati hai; baaki sheets/pivot safe. Tab 7 ka checkbox hata do to sheet nahi judegi.
**1 · Active Orders:** DSR ke **All Order Status** column me value **Open** (tab me badal sakte ho, comma se kai values) = Active. Count **Process By** se: Bulk9 / India / China / China-CJ, baaki sab (Bulk, blank, Price Hold…) **Other** (neeche dikhta hai Other me kya aaya). Month / Week / Date **Order Date** se; Week ka tarika tab 6 ke "Week ka tarika" se. Jis active order ki date samajh na aaye wo "(Order Date nahi mili)" row me aati hai.
