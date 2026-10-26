# DSR Updater (up to 300,000 rows × 75 columns) — GitHub + Vercel

Static site: `index.html`, `core.js`, `fflate.min.js` (all three in the same folder). No build step. Everything runs in the browser; no data is uploaded anywhere.
Deploy: commit the three files to a GitHub repo → Import in Vercel → Framework Preset "Other" → Deploy.
Browser: desktop Chrome/Edge, 8 GB RAM. Only .xlsx/.xlsm/.csv. Work is not saved before Download (page refresh = data lost).

## Look & feel
New design: stepper tabs (✓ badge once a step is done), glass header, Light/Dark mode (🌙 button, remembered), a progress line running at the top while loading, collapsible sections, and "ℹ️ Help" to show/hide long explanatory lines.

## Flow
Tabs: **1 Master → 2 Order Data → 3 Invoice → 4 FM Mile → 5 Last Mile → 6 View & Download → 7 Report Dashboard**. This is only a sequence, not a requirement: after Master (and the 5 important columns), you can run any step at any time, in any order.
If the wrong file was uploaded, just choose another file without refreshing: the old result/mapping is cleared, lookup columns stay (if the names are the same), and the check in Step 2 runs again automatically. You can choose a file with the same name again. If a wrong file has already updated the DSR, use ↩ Undo (last 5 steps), or upload the Master again (everything resets).
Header **🔄 Update Order Data** = the whole of Step 2 in one click. The header's "ℹ️ Help text" shows/hides long lines.

## Step 2 · Order Data (AOrder_Data_Final_Remark_and_Remark_Rules.docx)
Lookup + column mapping (14 pairs, automatic) → add missing orders → **Phase 1** (new rows) → status update (④) → **Phase 2** (new + old rows matched with the order data) → Courier (AWB if tracking exists, otherwise 0) → Special rule → Month/Week/Time/Date from Order Date.
Targets by Process By × Payment Status × Courier:
| Process By | PD | PR | PU |
|---|---|---|---|
| Bulk, India | Dispatch Pending At India WH / WH Working | Order Cancelled / WH Working | Dispatch Pending At India WH / Reseller Payment Not Done |
| Bulk9 | Bulk9 Order Dispatch Pending AT India WH / WH Working | Order Cancelled / WH Working | Bulk9 Order Dispatch Pending AT India WH / Reseller Payment Not Done |
| China, China-CJ, Courier AWB | Invoice Not Prepared / Processed By China | Order Cancelled / Processed By China | Invoice Not Prepared / Reseller Payment Not Done |
| China, China-CJ, Courier blank/0 | Not Processed By China / Not Processed By China | Order Cancelled / Cancelled By China | Not Processed By China / Reseller Payment Not Done |
| Blank/0 | WH Not Assigned / WH Not Assigned | Order Cancelled / WH Not Assigned | WH Not Assigned / Reseller Payment Not Done |
- **Phase 1:** only where Final Remark and Remark are both blank/0.
- **Phase 2:** Final Remark is blank/0 or one of: Bulk9 Order Dispatch Pending AT India WH, Dispatch Pending At India WH, Invoice Not Prepared, Not Processed By China, WH Not Assigned. (For a blank Process By, both must be blank.) The old "Bulk9 Order Pending" is also treated as part of this list; matching is not case-sensitive.
- **Special rule:** Username = onestopbulk and Final Remark is one of (blank, Bulk9 Order Dispatch Pending AT India WH, FM Intrasit, Dispatch Pending At India WH, Invoice Not Prepared, Not Processed By China, WH Not Assigned, Reached AT India WH) → Order Cancelled / DF Order Cancelled. There is no payment status condition (it is not in the document); you can choose "PR only" from the Payment dropdown. It is applied after Phase 1/2. Everything is editable.
- For any other Process By value (such as "Price Hold") there is no rule; the row stays as it is.

## Step 4 (tab 4) · FM Mile
The FM file columns are fixed (auto mapping; you can add more with "+ Column add"): pickup date → Pick up from SFC · Recd at SZN WH Dt. → Date of receiving in FW HUB / MCI · HAWB No. → Transporter AWB · date → Flight Connect date · Actual arrival → Date arrival at Indian Customs · customs cleared dt. → Date of Customs clerance · delivery at GGN WH → Arrival in Indian Warehouse.
After the fill: if the DSR "Arrival in Indian Warehouse" has a date and Final Remark is in the list (Bulk9 Order Dispatch Pending AT India WH, Dispatch Pending At India WH, FM Intrasit, Invoice Not Prepared, Not Processed By China, WH Not Assigned) → Reached AT India WH / WH Working. Untick = remove from the list; use "+ Add" to add a new remark. The new Final Remark/Remark are editable. Default: only rows matched with the FM file (choose Whole DSR from the dropdown).

## Step 5 (tab 5) · Last Mile (ALogistics_Logic.docx)
First choose the **courier / logistics company** at the top (15 couriers + 10 aggregators). That courier's columns (lookup, A/B/C) are remembered after an update and applied automatically when you upload the file next time. Lookup runs in order (if the first does not match, the next column is tried). A match fills the DSR date only if it is empty. If a date is filled (new or old) and Final Remark is in the list:
- **A Pickup:** → Last Mile Intrasit / Last Mile Intrasit. List: blank, Bulk9…, FM Intrasit, Dispatch Pending…, Invoice Not Prepared, Not Processed By China, WH Not Assigned, Reached AT India WH.
- **B Delivery:** → Delivered to end buyer / Shipment Delivered. List: the one from A + **Last Mile Intrasit**.
- **C RTO:** → Order Cancelled / RTO Received. List: the one from B + Delivered to end buyer + Order Cancelled.
If the date is empty, nothing changes. Below the result a "Check" is shown (how many rows have a real value in the logistics column). N/A/NA/null/- are treated as empty.

## Step 3 (tab 3) · Invoice (AInvoice_Final_And_Remarks.docx)
Auto mapping: Shopperr Invoice Number ← invoice number, Invoice Received Date ← Received (or Received date), SFC Qty ← QTY, SFC Value ← TOTAL PRICE(RMB), Shopperr Invoice Date ← Date (or Invoice Date), Invoice SKU ← SKU. If one order has several invoice rows, **SFC Qty / SFC Value are added up (sum)**, and the different SKUs go into **Invoice SKU** separated by commas. Matched orders only. All Final Remarks in the DSR are shown as checkboxes (default: blank, Bulk9…, Dispatch Pending…, Invoice Not Prepared, Not Processed By China, WH Not Assigned). If the Invoice Number is filled and the Final Remark is in the selected list → FM Intrasit / FM Intrasit.

## Download
Green header, borders, auto column width, freeze + filter. "⚙ Download options": keep other sheets/pivot, fill empty cells with 0 (except formula columns). Before download, the Month/Week/Time/Date columns are filled automatically (⑤ in tab 6).

## Tab 7 · Report Dashboard (new sheet "Report Dashboard" added on download)
All reports in one sheet, one below the other; on screen too there are cards + a table (click a card/button to switch reports). On a repeat download, the old Report Dashboard sheet is replaced by the new one; other sheets/pivots are safe. Untick the tab 7 checkbox and the sheet will not be added. All columns are selected automatically by name (you can change them). Counting is by Process By: Bulk9 / Bulk / India / China / China-CJ, everything else Other (what went into Other is shown below). The week method comes from "Week method" in tab 6.
1. **Active Orders:** Final Remark is in the list (Bulk9 Order Dispatch Pending AT India WH, Dispatch Pending At India WH, FM Intrasit, Invoice Not Prepared, Reached AT India WH; "Not Processed By China" is not counted as Active). Month/Week/Date = Order Date.
2. **Shipments Dispatched:** "Dispatch from Indian warehouse" has a date. 3. **Shipments Delivered:** a date in "Delivery to End Customer". 4. **Shipments RTO:** a date in "RTO Received date". For these three, Month/Week/Date default to that same date column (you can choose Order Date from the dropdown).
5. **China Not Process:** Process By China / China-CJ and Final Remark = Not Processed By China / WH Not Assigned; warehouse-wise count.
6. **FM Mile Report:** Shopperr Invoice Number filled + a date in Arrival in Indian Warehouse = FM Delivered; empty date = FM Intrasit. Month/Week/Date = Pick up from SFC. Rows with an empty invoice number are not counted.
**Manual add/remove:** there are checkboxes (untick = remove) and a "+ Add" box in the Active Orders Final Remark list, the China Not Process Final Remark list and the Warehouse list. The default rules are fixed in the code; any change you make goes back to default on refresh.
A row whose date is empty or not understood goes into the "(date not found)" row.

## v7 changes (Changes.docx)
Tab 6 = Report Dashboard, tab 7 = View & Download. Language selector in header (English default, Hindi, Chinese for main labels). Dashboard shows Month wise by default (View dropdown for Week / Date). "Export details" button downloads the full DSR rows of the selected report. Delivered/Dispatched/RTO count only rows with a valid date in their own column (no "date not found" row). China Not Process is now by Order Date (month/week/date, warehouse columns). FM Mile Report = Shopperr Invoice Number count by Pick up from SFC date. New report 7: OneStopBulk (China/China-CJ + Username onestopbulk): FM Delivered, FM Intrasit, Not Processed By China, Days Taken (avg of Order Date − Arrival in Indian Warehouse).

## v8
Excel Report Dashboard sheet: month wise only, colourful KPI cards, report banners, data bars on totals, peak-month line. On-screen tool shows Month + Week + Date as before. OneStopBulk report: Days Taken removed from the table; it is added order-wise as a column in "Export details".
