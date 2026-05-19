# Billsy

Billsy is a mobile-compatible inventory and GST billing web app for small retail counters and stock-managed businesses. It includes product master data, stock ledger, strict stock-controlled billing, barcode scanning, GST invoice calculation, print-ready invoices, and admin reports.

The app is built with React, TypeScript, Vite, and Supabase. It also has a local demo mode, so you can run and demonstrate Billsy immediately without creating a Supabase project.

## Features

- Admin and cashier access modes.
- Product master with barcode, SKU, HSN, unit, GST rate, MRP, selling price, reorder level, and active status.
- Stock inward, stock adjustments, cancellation movements, and stock-on-hand calculations from a ledger.
- Fast billing screen with manual barcode entry, hardware scanner support, and camera scanner support.
- Barcode scanner uses native `BarcodeDetector` where available and `@zxing/browser` as a fallback.
- Automatic product autofill during billing.
- Line-level discount and bill-level discount.
- GST-inclusive invoice calculation with CGST/SGST for same-state sales and IGST for out-of-state sales.
- Strict oversell prevention before invoice save.
- Draft recovery for unsaved bills in local browser storage.
- Save bill and print preview.
- A4, 80mm thermal, and 58mm thermal print styling.
- Reports for sales, GST, stock on hand, low stock, stock movement history, and cashier-wise sales.
- Supabase migration with tables, row-level security policies, stock view, and transactional invoice-save RPC.

## Tech Stack

- React 18
- TypeScript
- Vite
- Supabase JS
- ZXing browser barcode scanning
- Lucide React icons
- Vitest

## Project Structure

```text
.
├── src
│   ├── App.tsx                         # Main app shell, pages, billing flow, reports
│   ├── components
│   │   └── BarcodeScanner.tsx          # Camera barcode scanner modal
│   ├── lib
│   │   ├── calculations.ts             # GST, discount, totals, stock helpers
│   │   ├── calculations.test.ts        # Unit tests
│   │   ├── repository.ts               # Supabase/demo data abstraction
│   │   ├── scanner.ts                  # Scanner factory and native detector helpers
│   │   ├── supabase.ts                 # Supabase client setup
│   │   └── types.ts                    # App domain types
│   ├── main.tsx
│   └── styles.css
├── supabase
│   └── migrations
│       ├── 001_initial_schema.sql      # Supabase schema, RLS, invoice RPC
│       ├── 002_rbac_hardening.sql      # Stricter invoice/profile policies
│       └── 003_inactive_product_stock_guard.sql # Blocks stock entries for inactive products
├── .env.example
├── package.json
└── vite.config.ts
```

## Requirements

- Node.js 20 or newer. This workspace was verified with Node.js 22.
- npm.
- A modern browser.
- For camera barcode scanning on a phone, use HTTPS or localhost. Browser camera APIs are restricted on insecure origins.

## Quick Start: Local Demo Mode

Demo mode works automatically when Supabase environment variables are not configured.

1. Open PowerShell.
2. Go to the project folder:

   ```powershell
   cd E:\works\billsy
   ```

3. Install dependencies if they are not already installed:

   ```powershell
   npm install
   ```

4. Start the app:

   ```powershell
   npm run dev -- --port 5173
   ```

5. Open the app:

   ```text
   http://localhost:5173
   ```

6. Sign in with any email and password.
7. Choose either `Admin` or `Cashier` on the login screen.

## Demo Data

Local demo mode starts with seeded product and opening stock data.

| Product | Barcode | Price | Opening stock |
| --- | --- | ---: | ---: |
| Premium Rice 5 kg | `8901000000012` | ₹399 | 24 |
| Sunflower Oil 1 L | `8901000000029` | ₹165 | 36 |
| A4 Notebook 200 pages | `8901000000036` | ₹88 | 60 |

You can scan these barcodes with a hardware scanner or type them manually into the billing barcode field and press Enter.

## Suggested Local Demo Script

Use this flow when presenting Billsy locally.

1. Open `http://localhost:5173`.
2. On the login screen, choose `Admin`, enter any email/password, and sign in.
3. Show the dashboard:
   - Sales today.
   - Bills today.
   - Low stock count.
   - Current stock value.
4. Open `Products`:
   - Point out barcode, SKU, HSN, GST rate, MRP, selling price, reorder level, and active status.
   - Add a product with `Unit of measure` such as `pcs`, `kg`, or `box`.
   - Set `Opening stock quantity` to the starting available stock. This creates the first stock inward entry automatically.
   - Edit a product if needed. After creation, use the `Stock` page for all quantity changes.
5. Open `Stock`:
   - Add an inward movement for any product.
   - Show the stock-on-hand table and low stock status.
6. Open `Billing`:
   - Type `8901000000012` in the barcode box and press Enter.
   - Confirm the product, price, GST, stock, and total autofill.
   - Add another barcode such as `8901000000029`.
   - Change quantity, line discount, or bill discount.
   - Add customer name, phone, GSTIN, and state if desired.
   - Save the bill.
7. In the print preview:
   - Show invoice number.
   - Show GST split.
   - Use the `Print` button to demonstrate browser printing.
8. Open `Bills`:
   - Show saved invoices.
   - Reopen and print a previous invoice.
9. Open `Reports`:
   - Show GST summary.
   - Show cashier-wise sales.
   - Show stock movement history.
10. Open `Settings`:
   - Show business name, GSTIN, address, state, invoice prefix, and print size options.

## Hardware Barcode Scanner Demo

Most USB and Bluetooth barcode scanners behave like keyboards.

1. Click the billing barcode field.
2. Scan a product barcode.
3. The scanner should type the code into the field.
4. If the scanner sends Enter after scanning, Billsy adds the product immediately.

For demo mode, scan or type:

```text
8901000000012
8901000000029
8901000000036
```

## Camera Barcode Scanner Demo

1. Open the Billing page.
2. Click the camera button beside the barcode field.
3. Allow camera permission in the browser.
4. Keep the barcode inside the frame.
5. Billsy will add the product when a barcode is detected.

Notes:

- Camera access works on `localhost`.
- On a phone using a tunnel such as ngrok, use the HTTPS ngrok URL.
- Plain local-network HTTP URLs such as `http://192.168.x.x:5173` are not secure browser origins, so mobile browsers block camera access there.
- Camera support depends on browser permissions and device camera quality.
- The app lazy-loads the scanner code only when the camera scanner is opened, improving first-load performance.

## Running On A Phone On The Same Network

If your computer and phone are on the same Wi-Fi network:

1. Start the dev server:

   ```powershell
   cd E:\works\billsy
   npm run dev -- --port 5173
   ```

2. Find your computer's local IP address:

   ```powershell
   ipconfig
   ```

3. Look for your active Wi-Fi adapter IPv4 address, for example:

   ```text
   192.168.1.25
   ```

4. Open this on the phone:

   ```text
   http://192.168.1.25:5173
   ```

Manual barcode entry and hardware scanners should work from the local IP URL. Camera scanning will usually not work from `http://192.168.x.x:5173` because mobile browsers block camera access on insecure network origins. Use an HTTPS ngrok URL for phone camera demos.

## Optional: ngrok Tunnel

If ngrok is installed, expose the local app with HTTPS:

```powershell
& "C:\Users\Ahamed Musthafa R S\Downloads\ngrok\ngrok.exe" http 5173
```

Then open the HTTPS forwarding URL shown by ngrok on your phone or another device.

Important:

- Keep the Vite dev server running while ngrok is running.
- Use the `https://...ngrok-free.app` URL for camera scanning.
- If ngrok asks for authentication, run `ngrok config add-authtoken YOUR_TOKEN` once.

## Supabase Setup For Real Cloud Mode

Demo mode uses browser local storage. For real cloud data, configure Supabase.

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run the migrations in order:

   ```text
   supabase/migrations/001_initial_schema.sql
   supabase/migrations/002_rbac_hardening.sql
   supabase/migrations/003_inactive_product_stock_guard.sql
   ```

4. Create users in Supabase Auth.
5. Add matching rows in `profiles`.

Example profile insert:

```sql
insert into public.profiles (id, name, role)
values
  ('AUTH_USER_UUID_HERE', 'Admin User', 'admin');
```

6. Copy `.env.example` to `.env`:

   ```powershell
   Copy-Item .env.example .env
   ```

7. Fill in your Supabase values:

   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-public-anon-key
   ```

8. Restart the dev server:

   ```powershell
   npm run dev -- --port 5173
   ```

When both Supabase environment variables are present, Billsy switches from demo mode to Supabase cloud mode.

## Print Setup

Billsy uses browser print CSS for invoice output.

1. Save a bill.
2. In the invoice preview, click `Print`.
3. Choose printer destination.
4. For A4 invoices, use normal A4 settings.
5. For thermal receipts, select 80mm or 58mm in `Settings`, then print with a matching thermal printer page size.

If browser headers/footers are not desired, disable them in the browser print dialog.

## Scripts

```powershell
npm run dev       # Start development server
npm run build     # Type-check and build production assets
npm run preview   # Preview production build
npm run test      # Run unit tests
```

## Verification

The current implementation has been verified with:

```powershell
npm run test
npm run build
npm audit
```

Expected results:

- Unit tests pass.
- Production build succeeds.
- npm audit reports zero vulnerabilities.

## Troubleshooting

### The app opens in demo mode

That is expected when `.env` is missing or Supabase variables are empty.

### Supabase login fails

Check:

- `VITE_SUPABASE_URL` is correct.
- `VITE_SUPABASE_ANON_KEY` is correct.
- The dev server was restarted after editing `.env`.
- The user exists in Supabase Auth.
- The user has a matching row in `public.profiles`.

### Camera scanner does not open

Check:

- Browser camera permission is allowed.
- You are using `localhost` or an HTTPS URL.
- No other app is currently using the camera.
- Try Chrome or Edge for the most reliable barcode scanning support.

### Product does not add after scanning

Check:

- The barcode exists in product master.
- The product is active.
- The barcode field has focus for hardware scanners.
- In demo mode, use one of the seeded demo barcodes.

### New product stock is zero

`Unit of measure` is not stock quantity. It should contain values like `pcs`, `kg`, `box`, or `bottle`.

When creating a product, enter the starting quantity in `Opening stock quantity`. After product creation, update quantity from the `Stock` page using `Inward`, `Adjustment`, or `Cancellation`.

### Bill cannot be saved

Billsy prevents overselling. Check the stock shown beside each bill line. Add stock inward from the Stock page if needed.

### Port 5173 is already in use

Start the app on another port:

```powershell
npm run dev -- --port 5174
```

Then open:

```text
http://localhost:5174
```

## Current Scope

Included in v1:

- Single business/store.
- Admin and cashier roles.
- Product master.
- Stock ledger.
- GST billing.
- Barcode billing.
- Invoice print preview.
- Reports.
- Supabase cloud schema.

Not included in v1:

- Multi-branch inventory.
- Supplier accounting.
- Purchase bill due tracking.
- Full offline invoice syncing.
- Payment gateway integration.
