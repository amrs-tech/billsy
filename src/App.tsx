import { FormEvent, Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Ban,
  Boxes,
  Camera,
  ClipboardList,
  FileText,
  LogOut,
  PackagePlus,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Trash2
} from "lucide-react";
import { billingDraftKey, restoreBillingDraft, serializeBillingDraft } from "./lib/billingDraft";
import { calculateBill, calculateCurrentStock, formatCurrency } from "./lib/calculations";
import { defaultSettings, newId, repository } from "./lib/repository";
import type {
  AppSettings,
  BillDiscount,
  BillLineInput,
  Customer,
  Invoice,
  PaymentMode,
  Product,
  Profile,
  StockMovement,
  StockMovementType
} from "./lib/types";

const BarcodeScanner = lazy(() => import("./components/BarcodeScanner").then((module) => ({ default: module.BarcodeScanner })));

type Page = "dashboard" | "billing" | "products" | "stock" | "invoices" | "reports" | "settings";

type AppData = {
  products: Product[];
  movements: StockMovement[];
  invoices: Invoice[];
  settings: AppSettings;
};

type Notice = {
  id: number;
  message: string;
  tone: "success" | "error";
};


const emptyData: AppData = {
  products: [],
  movements: [],
  invoices: [],
  settings: defaultSettings
};

const emptyCustomer: Customer = { name: "", phone: "", gstin: "", state: "" };
const emptyDiscount: BillDiscount = { type: "amount", value: 0 };

const navItems: Array<{ page: Page; label: string; icon: typeof ShoppingCart; adminOnly?: boolean }> = [
  { page: "dashboard", label: "Dashboard", icon: BarChart3 },
  { page: "billing", label: "Billing", icon: ShoppingCart },
  { page: "products", label: "Products", icon: Boxes, adminOnly: true },
  { page: "stock", label: "Stock", icon: PackagePlus, adminOnly: true },
  { page: "invoices", label: "Bills", icon: ReceiptText },
  { page: "reports", label: "Reports", icon: ClipboardList, adminOnly: true },
  { page: "settings", label: "Settings", icon: Settings, adminOnly: true }
];

const stockByProduct = (products: Product[], movements: StockMovement[]) =>
  Object.fromEntries(products.map((product) => [product.id, calculateCurrentStock(product.id, movements)]));

const inputNumber = (value: FormDataEntryValue | null) => Number(value || 0);

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [page, setPage] = useState<Page>("dashboard");
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const showNotice = (message: string, tone: Notice["tone"]) => {
    setNotice({ id: Date.now(), message, tone });
  };

  const refresh = async () => {
    const next = await repository.loadData();
    setData(next);
  };

  useEffect(() => {
    repository
      .getInitialProfile()
      .then(async (initialProfile) => {
        if (initialProfile) {
          setProfile(initialProfile);
          await refresh();
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await repository.signOut();
    setProfile(null);
    setPage("dashboard");
  };

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  if (loading) return <div className="boot-screen">Loading Billsy...</div>;
  if (!profile) {
    return (
      <Login
        onLogin={async (nextProfile) => {
          setProfile(nextProfile);
          await refresh();
        }}
      />
    );
  }

  const visibleNav = navItems.filter((item) => !item.adminOnly || profile.role === "admin");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>Billsy</strong>
            <span>Inventory + Billing</span>
          </div>
        </div>
        <nav>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)}>
                <Icon size={18} /> {item.label}
              </button>
            );
          })}
        </nav>
        <div className="profile-chip">
          <ShieldCheck size={18} />
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.role}</span>
          </div>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">{repository.mode === "demo" ? "Demo data mode" : "Supabase cloud"}</p>
            <h1>{navItems.find((item) => item.page === page)?.label}</h1>
          </div>
          <button className="ghost-button" onClick={signOut}>
            <LogOut size={18} /> Sign out
          </button>
        </header>

        {notice ? (
          <div className={`toast ${notice.tone}`} role="alert" aria-live="assertive">
            <span>{notice.message}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss notification">x</button>
          </div>
        ) : null}

        {page === "dashboard" && <Dashboard data={data} />}
        {page === "billing" && <Billing data={data} profile={profile} refresh={refresh} showNotice={showNotice} />}
        {page === "products" && (
          <Products
            profile={profile}
            products={data.products}
            showNotice={showNotice}
            saveProduct={async (product) => { await repository.saveProduct(product); await refresh(); }}
            addStockMovement={async (movement) => { await repository.addStockMovement(movement); await refresh(); }}
          />
        )}
        {page === "stock" && <Stock data={data} profile={profile} refresh={refresh} showNotice={showNotice} />}
        {page === "invoices" && <Invoices invoices={data.invoices} settings={data.settings} />}
        {page === "reports" && <Reports data={data} />}
        {page === "settings" && <SettingsPage settings={data.settings} saveSettings={async (settings) => { await repository.saveSettings(settings); await refresh(); showNotice("Business settings saved.", "success"); }} />}
      </main>

      <nav className="mobile-nav">
        {visibleNav.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.page} className={page === item.page ? "active" : ""} onClick={() => setPage(item.page)} aria-label={item.label}>
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (profile: Profile) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoRole, setDemoRole] = useState<Profile["role"]>("admin");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const profile = await repository.signIn(String(form.get("email") || ""), String(form.get("password") || ""), demoRole);
      onLogin(profile);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div className="brand large">
          <div className="brand-mark">B</div>
          <div>
            <strong>Billsy</strong>
            <span>Professional inventory and GST billing</span>
          </div>
        </div>
        <label>
          Email
          <input name="email" type="email" placeholder={repository.mode === "demo" ? "demo@billsy.local" : "admin@company.com"} />
        </label>
        <label>
          Password
          <input name="password" type="password" placeholder={repository.mode === "demo" ? "any password" : "Password"} />
        </label>
        {repository.mode === "demo" ? (
          <div className="segmented">
            <button type="button" className={demoRole === "admin" ? "active" : ""} onClick={() => setDemoRole("admin")}>Admin</button>
            <button type="button" className={demoRole === "cashier" ? "active" : ""} onClick={() => setDemoRole("cashier")}>Cashier</button>
          </div>
        ) : null}
        {error ? <p className="inline-error">{error}</p> : null}
        <button className="primary-button" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
      </form>
    </div>
  );
}

function Dashboard({ data }: { data: AppData }) {
  const stock = stockByProduct(data.products, data.movements);
  const activeProducts = data.products.filter((product) => product.active);
  const today = new Date().toDateString();
  const todaysInvoices = data.invoices.filter((invoice) => new Date(invoice.createdAt).toDateString() === today);
  const lowStock = activeProducts.filter((product) => (stock[product.id] ?? 0) <= product.reorderLevel);
  const stockValue = activeProducts.reduce((sum, product) => sum + (stock[product.id] ?? 0) * product.sellingPrice, 0);

  return (
    <section className="page-grid">
      <Metric label="Sales today" value={formatCurrency(todaysInvoices.reduce((sum, invoice) => sum + invoice.totals.grandTotal, 0))} />
      <Metric label="Bills today" value={String(todaysInvoices.length)} />
      <Metric label="Low stock" value={String(lowStock.length)} />
      <Metric label="Stock value" value={formatCurrency(stockValue)} />
      <div className="panel wide">
        <div className="panel-header">
          <h2>Low stock watch</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Product</th><th>Stock</th><th>Reorder</th></tr>
            </thead>
            <tbody>
              {lowStock.map((product) => (
                <tr key={product.id}><td>{product.name}</td><td>{stock[product.id] ?? 0}</td><td>{product.reorderLevel}</td></tr>
              ))}
              {!lowStock.length ? <tr><td colSpan={3}>All products are above reorder level.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Products({
  profile,
  products,
  saveProduct,
  addStockMovement,
  showNotice
}: {
  profile: Profile;
  products: Product[];
  saveProduct: (product: Product) => Promise<void>;
  addStockMovement: (movement: StockMovement) => Promise<void>;
  showNotice: (message: string, tone: Notice["tone"]) => void;
}) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [barcodeValue, setBarcodeValue] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const filtered = products.filter((product) => `${product.name} ${product.barcode} ${product.sku} ${product.active ? "active" : "inactive"}`.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    setBarcodeValue(editing?.barcode ?? "");
  }, [editing]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const barcode = barcodeValue.trim();
    const sku = String(form.get("sku") || "").trim();
    const active = form.get("active") === "on";
    const openingStock = inputNumber(form.get("openingStock"));
    const duplicateBarcode = products.find((product) => product.barcode === barcode && product.id !== editing?.id);
    const duplicateSku = products.find((product) => product.sku === sku && product.id !== editing?.id);
    if (duplicateBarcode) return showNotice(`Barcode already exists for ${duplicateBarcode.name}.`, "error");
    if (duplicateSku) return showNotice(`SKU already exists for ${duplicateSku.name}.`, "error");
    if (!editing && openingStock < 0) return showNotice("Opening stock cannot be negative.", "error");
    if (!editing && openingStock > 0 && !active) return showNotice("Opening stock can be added only for an active product.", "error");

    const productId = editing?.id ?? newId();
    const product: Product = {
      id: productId,
      barcode,
      sku,
      name: String(form.get("name") || "").trim(),
      category: String(form.get("category") || "General").trim(),
      hsn: String(form.get("hsn") || "").trim(),
      unit: String(form.get("unit") || "pcs").trim(),
      gstRate: inputNumber(form.get("gstRate")),
      mrp: inputNumber(form.get("mrp")),
      sellingPrice: inputNumber(form.get("sellingPrice")),
      reorderLevel: inputNumber(form.get("reorderLevel")),
      active,
      createdAt: editing?.createdAt ?? new Date().toISOString()
    };

    await saveProduct(product);
    if (!editing && openingStock > 0) {
      await addStockMovement({
        id: newId(),
        productId,
        type: "inward",
        quantity: openingStock,
        reference: "OPENING",
        notes: "Opening stock from product creation",
        createdAt: new Date().toISOString(),
        createdBy: profile.id
      });
    }
    showNotice(openingStock > 0 && !editing ? "Product master and opening stock saved." : "Product master saved.", "success");
    setEditing(null);
    setBarcodeValue("");
    event.currentTarget.reset();
  };

  const toggleProductActive = async (product: Product) => {
    const nextProduct = { ...product, active: !product.active };
    await saveProduct(nextProduct);
    if (editing?.id === product.id) setEditing(nextProduct);
    showNotice(
      nextProduct.active
        ? `${product.name} reactivated for billing and stock entry.`
        : `${product.name} marked inactive. Stock and invoice history remain linked.`,
      "success"
    );
  };

  return (
    <section className="split-grid">
      <form className="panel form-grid" onSubmit={submit} key={editing?.id ?? "new-product"}>
        <div className="panel-header"><h2>{editing ? "Edit product" : "Add product"}</h2></div>
        <div className="form-scan-row">
          <label className="field"><span>Barcode</span><input name="barcode" required value={barcodeValue} onChange={(event) => setBarcodeValue(event.target.value)} /></label>
          <button className="icon-button" type="button" onClick={() => setScannerOpen(true)} aria-label="Scan product barcode"><Camera size={20} /></button>
        </div>
        <label className="field"><span>SKU</span><input name="sku" required defaultValue={editing?.sku} /></label>
        <label className="field"><span>Product name</span><input name="name" required defaultValue={editing?.name} /></label>
        <label className="field"><span>Category</span><input name="category" defaultValue={editing?.category ?? "General"} /></label>
        <label className="field"><span>HSN code</span><input name="hsn" defaultValue={editing?.hsn} /></label>
        <label className="field"><span>Unit of measure</span><input name="unit" defaultValue={editing?.unit ?? "pcs"} placeholder="pcs, kg, box" /></label>
        {!editing ? (
          <label className="field">
            <span>Opening stock quantity</span>
            <input name="openingStock" type="number" step="0.001" min="0" defaultValue={0} />
          </label>
        ) : (
          <p className="field-hint">Use the Stock page for inward, cancellation, or counted-stock adjustments after product creation.</p>
        )}
        <label className="field"><span>GST rate (%)</span><input name="gstRate" type="number" step="0.01" defaultValue={editing?.gstRate ?? 5} /></label>
        <label className="field"><span>MRP</span><input name="mrp" type="number" step="0.01" defaultValue={editing?.mrp ?? 0} /></label>
        <label className="field"><span>Selling price</span><input name="sellingPrice" type="number" step="0.01" defaultValue={editing?.sellingPrice ?? 0} /></label>
        <label className="field"><span>Reorder level</span><input name="reorderLevel" type="number" step="0.01" defaultValue={editing?.reorderLevel ?? 0} /></label>
        <label className="check-row"><input name="active" type="checkbox" defaultChecked={editing?.active ?? true} /> Active product</label>
        <button className="primary-button"><Save size={18} /> Save product</button>
      </form>
      {scannerOpen ? (
        <Suspense fallback={<div className="modal-backdrop"><div className="scanner-panel">Starting scanner...</div></div>}>
          <BarcodeScanner onDetected={(code) => { setBarcodeValue(code); setScannerOpen(false); showNotice("Barcode captured for product.", "success"); }} onClose={() => setScannerOpen(false)} />
        </Suspense>
      ) : null}
      <div className="panel">
        <div className="panel-header">
          <h2>Product master</h2>
          <label className="field compact-search"><span>Search products</span><span className="search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} /></span></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Barcode</th><th>GST</th><th>Price</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td><strong>{product.name}</strong><span className="muted block">{product.sku}</span></td>
                  <td>{product.barcode}</td>
                  <td>{product.gstRate}%</td>
                  <td>{formatCurrency(product.sellingPrice)}</td>
                  <td><span className={product.active ? "status ok" : "status off"}>{product.active ? "Active" : "Inactive"}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="small-button" onClick={() => setEditing(product)}>Edit</button>
                      <button className={product.active ? "small-button danger-button" : "small-button"} onClick={() => toggleProductActive(product)}>
                        {product.active ? <Ban size={15} /> : <RotateCcw size={15} />}
                        {product.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filtered.length ? <tr><td colSpan={6}>No products match the current search.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Stock({ data, profile, refresh, showNotice }: { data: AppData; profile: Profile; refresh: () => Promise<void>; showNotice: (message: string, tone: Notice["tone"]) => void }) {
  const stock = stockByProduct(data.products, data.movements);
  const activeProducts = data.products.filter((product) => product.active);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockBarcode, setStockBarcode] = useState("");
  const [movementType, setMovementType] = useState<StockMovementType>("inward");
  const [scannerOpen, setScannerOpen] = useState(false);
  const selectedProduct = data.products.find((product) => product.id === selectedProductId);
  const selectedCurrentStock = selectedProduct ? stock[selectedProduct.id] ?? 0 : 0;
  const quantityLabel =
    movementType === "adjustment"
      ? "Counted physical stock"
      : movementType === "cancellation"
        ? "Quantity to reduce"
        : "Quantity received";

  const applyBarcodeToStock = (code: string) => {
    const normalized = code.trim();
    if (!normalized) {
      showNotice("Scan or type a product barcode first.", "error");
      return;
    }
    setStockBarcode(normalized);
    const product = data.products.find((item) => item.barcode === normalized && item.active);
    if (!product) {
      showNotice(`No active product found for barcode ${normalized}.`, "error");
      return;
    }
    setSelectedProductId(product.id);
    showNotice(`${product.name} selected for stock entry.`, "success");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const quantity = inputNumber(form.get("quantity"));
    if (!selectedProductId) return showNotice("Select a product or scan its barcode before saving stock.", "error");
    if (!selectedProduct) return showNotice("Selected product was not found. Refresh and try again.", "error");
    if (!selectedProduct.active) return showNotice("This product is inactive. Reactivate it before adding stock movements.", "error");
    if (quantity < 0) return showNotice("Quantity cannot be negative.", "error");

    let movementQuantity = quantity;
    if (movementType === "adjustment") {
      movementQuantity = quantity - selectedCurrentStock;
      if (movementQuantity === 0) return showNotice("Counted stock already matches current stock. No adjustment needed.", "error");
    } else {
      if (quantity <= 0) return showNotice("Quantity must be greater than zero.", "error");
      movementQuantity = movementType === "cancellation" || movementType === "sale" ? -Math.abs(quantity) : quantity;
    }

    const movement: StockMovement = {
      id: newId(),
      productId: selectedProductId,
      type: movementType,
      quantity: movementQuantity,
      reference: String(form.get("reference") || ""),
      notes: String(form.get("notes") || (movementType === "adjustment" ? `Adjusted counted stock to ${quantity}` : "")),
      createdAt: new Date().toISOString(),
      createdBy: profile.id
    };
    await repository.addStockMovement(movement);
    await refresh();
    showNotice("Stock movement saved.", "success");
    setSelectedProductId("");
    setStockBarcode("");
    setMovementType("inward");
    event.currentTarget.reset();
  };

  return (
    <section className="split-grid">
      <form className="panel form-grid" onSubmit={submit}>
        <div className="panel-header"><h2>Stock inward / adjustment</h2></div>
        <div className="form-scan-row">
          <label className="field"><span>Scan or type product barcode</span><input value={stockBarcode} onChange={(event) => setStockBarcode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); applyBarcodeToStock(stockBarcode); } }} /></label>
          <button className="icon-button" type="button" onClick={() => setScannerOpen(true)} aria-label="Scan stock product barcode"><Camera size={20} /></button>
        </div>
        <label className="field"><span>Product</span><select name="productId" required value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
          <option value="">Select product</option>
          {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select></label>
        {!activeProducts.length ? <p className="inline-error">No active products are available for stock entry.</p> : null}
        {selectedProduct ? <p className="selected-product">Current stock: <strong>{selectedCurrentStock}</strong> | Barcode: {selectedProduct.barcode}</p> : null}
        <label className="field"><span>Movement type</span><select name="type" value={movementType} onChange={(event) => setMovementType(event.target.value as StockMovementType)}>
          <option value="inward">Inward</option>
          <option value="adjustment">Adjustment</option>
          <option value="cancellation">Cancellation</option>
        </select></label>
        <p className="field-hint">
          {movementType === "inward"
            ? "Inward adds newly received stock."
            : movementType === "adjustment"
              ? "Adjustment sets stock to the counted physical quantity and records only the difference."
              : "Cancellation reduces stock for damage, loss, expiry, or correction."}
        </p>
        <label className="field"><span>{quantityLabel}</span><input name="quantity" type="number" step="0.001" min="0" required /></label>
        <label className="field"><span>Reference</span><input name="reference" /></label>
        <label className="field"><span>Notes</span><textarea name="notes" rows={3} /></label>
        <button className="primary-button"><Save size={18} /> Save movement</button>
      </form>
      {scannerOpen ? (
        <Suspense fallback={<div className="modal-backdrop"><div className="scanner-panel">Starting scanner...</div></div>}>
          <BarcodeScanner onDetected={(code) => { applyBarcodeToStock(code); setScannerOpen(false); }} onClose={() => setScannerOpen(false)} />
        </Suspense>
      ) : null}
      <div className="panel">
        <div className="panel-header"><h2>Stock on hand</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Current</th><th>Reorder</th><th>Status</th></tr></thead>
            <tbody>
              {data.products.map((product) => {
                const currentStock = stock[product.id] ?? 0;
                return (
                  <tr key={product.id}>
                    <td><strong>{product.name}</strong>{!product.active ? <span className="muted block">Inactive product</span> : null}</td>
                    <td>{currentStock}</td>
                    <td>{product.reorderLevel}</td>
                    <td>
                      <span className={!product.active ? "status off" : currentStock <= product.reorderLevel ? "status warn" : "status ok"}>
                        {!product.active ? "Inactive" : currentStock <= product.reorderLevel ? "Low" : "OK"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Billing({ data, profile, refresh, showNotice }: { data: AppData; profile: Profile; refresh: () => Promise<void>; showNotice: (message: string, tone: Notice["tone"]) => void }) {
  const [barcode, setBarcode] = useState("");
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [lines, setLines] = useState<BillLineInput[]>([]);
  const [billDiscount, setBillDiscount] = useState<BillDiscount>(emptyDiscount);
  const [billDiscountInput, setBillDiscountInput] = useState("0");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);
  const stock = useMemo(() => stockByProduct(data.products, data.movements), [data.products, data.movements]);
  const calculated = useMemo(() => calculateBill(lines, billDiscount, data.settings, customer.state || data.settings.state), [lines, billDiscount, data.settings, customer.state]);

  useEffect(() => {
    const draft = localStorage.getItem(billingDraftKey);
    if (!draft) return;
    const parsed = restoreBillingDraft(draft, data.products);
    if (!parsed) {
      localStorage.removeItem(billingDraftKey);
      return;
    }
    setCustomer(parsed.customer);
    setLines(parsed.lines);
    setBillDiscount(parsed.billDiscount);
    setBillDiscountInput(String(parsed.billDiscount.value ?? 0));
    setPaymentMode(parsed.paymentMode);
  }, [data.products]);

  useEffect(() => {
    if (lines.length) {
      localStorage.setItem(
        billingDraftKey,
        serializeBillingDraft({ customer, lines, billDiscount, paymentMode })
      );
    } else {
      localStorage.removeItem(billingDraftKey);
    }
  }, [customer, lines, billDiscount, paymentMode]);

  const addByBarcode = (code: string) => {
    const product = data.products.find((item) => item.barcode === code.trim() && item.active);
    if (!product) {
      showNotice(`No active product found for barcode ${code}.`, "error");
      return;
    }
    setLines((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        return current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...current, { product, quantity: 1, unitPrice: product.sellingPrice, discountType: "amount", discountValue: 0 }];
    });
    setBarcode("");
  };

  const save = async () => {
    if (!lines.length) return showNotice("Add at least one product before saving.", "error");
    const insufficient = lines.find((line) => line.quantity > (stock[line.product.id] ?? 0));
    if (insufficient) return showNotice(`Insufficient stock for ${insufficient.product.name}.`, "error");
    const invoice = await repository.saveInvoice(
      { customer: { ...customer, state: customer.state || data.settings.state }, items: calculated.items, billDiscount, paymentMode, settings: data.settings },
      profile
    );
    setLastInvoice(invoice);
    setLines([]);
    setCustomer(emptyCustomer);
    setBillDiscount(emptyDiscount);
    setBillDiscountInput("0");
    await refresh();
    showNotice(`Invoice ${invoice.invoiceNumber} saved.`, "success");
  };

  return (
    <section className="billing-layout">
      <div className="panel billing-main">
        <div className="scan-row">
          <label className="field scan-field">
            <span>Barcode</span>
            <span className="barcode-input">
              <Search size={18} />
              <input
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addByBarcode(barcode);
                }}
                autoFocus
                aria-label="Barcode"
              />
            </span>
          </label>
          <button className="icon-text-button" onClick={() => addByBarcode(barcode)}>Add</button>
          <button className="icon-button" onClick={() => setScannerOpen(true)} aria-label="Open camera scanner"><Camera size={20} /></button>
        </div>
        <div className="customer-grid">
          <label className="field"><span>Customer name</span><input value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label>
          <label className="field"><span>Phone</span><input value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label>
          <label className="field"><span>Customer GSTIN</span><input value={customer.gstin} onChange={(event) => setCustomer({ ...customer, gstin: event.target.value })} /></label>
          <label className="field"><span>Customer state</span><input value={customer.state} onChange={(event) => setCustomer({ ...customer, state: event.target.value })} placeholder={data.settings.state} /></label>
        </div>
        <div className="table-wrap bill-table">
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Disc</th><th>Stock</th><th>Total</th><th></th></tr></thead>
            <tbody>
              {calculated.items.map((line, index) => (
                <tr key={line.product.id}>
                  <td className="bill-item-cell"><strong title={line.product.name}>{line.product.name}</strong><span className="muted block">GST {line.product.gstRate}% | {line.product.barcode}</span></td>
                  <td><input className="mini-input" type="number" min="0.001" step="0.001" value={lines[index].quantity} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /></td>
                  <td><input className="mini-input" type="number" step="0.01" value={lines[index].unitPrice} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, unitPrice: Number(event.target.value) } : item))} /></td>
                  <td><input className="mini-input" type="number" step="0.01" value={lines[index].discountValue} onChange={(event) => setLines(lines.map((item, itemIndex) => itemIndex === index ? { ...item, discountValue: Number(event.target.value) } : item))} /></td>
                  <td><span className={line.quantity > (stock[line.product.id] ?? 0) ? "status warn" : "status ok"}>{stock[line.product.id] ?? 0}</span></td>
                  <td>{formatCurrency(line.total)}</td>
                  <td><button className="icon-button danger" onClick={() => setLines(lines.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove line"><Trash2 size={18} /></button></td>
                </tr>
              ))}
              {!lines.length ? <tr><td colSpan={7}>Scan a barcode or type one above to start billing.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="panel totals-panel">
        <h2>Bill total</h2>
        <label className="field">Discount type<select value={billDiscount.type} onChange={(event) => setBillDiscount({ ...billDiscount, type: event.target.value as BillDiscount["type"] })}><option value="amount">Amount</option><option value="percent">Percent</option></select></label>
        <label className="field">Bill discount<input type="number" step="0.01" value={billDiscountInput} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { setBillDiscountInput(event.target.value); setBillDiscount({ ...billDiscount, value: Number(event.target.value || 0) }); }} /></label>
        <label className="field">Payment<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="mixed">Mixed</option></select></label>
        <TotalRow label="Subtotal" value={calculated.totals.subtotal} />
        <TotalRow label="Discount" value={calculated.totals.lineDiscountTotal} />
        <TotalRow label="Taxable" value={calculated.totals.taxableValue} />
        <TotalRow label="CGST" value={calculated.totals.cgst} />
        <TotalRow label="SGST" value={calculated.totals.sgst} />
        <TotalRow label="IGST" value={calculated.totals.igst} />
        <div className="grand-total"><span>Grand total</span><strong>{formatCurrency(calculated.totals.grandTotal)}</strong></div>
        <button className="primary-button" onClick={save}><FileText size={18} /> Save bill</button>
      </aside>
      {scannerOpen ? (
        <Suspense fallback={<div className="modal-backdrop"><div className="scanner-panel">Starting scanner...</div></div>}>
          <BarcodeScanner onDetected={(code) => { addByBarcode(code); setScannerOpen(false); }} onClose={() => setScannerOpen(false)} />
        </Suspense>
      ) : null}
      {lastInvoice ? <InvoiceModal invoice={lastInvoice} settings={data.settings} onClose={() => setLastInvoice(null)} /> : null}
    </section>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return <div className="total-row"><span>{label}</span><strong>{formatCurrency(value)}</strong></div>;
}

function Invoices({ invoices, settings }: { invoices: Invoice[]; settings: AppSettings }) {
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<"all" | PaymentMode>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const fromTime = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toTime = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    const min = minTotal === "" ? null : Number(minTotal);
    const max = maxTotal === "" ? null : Number(maxTotal);

    return invoices.filter((invoice) => {
      const created = new Date(invoice.createdAt).getTime();
      if (paymentFilter !== "all" && invoice.paymentMode !== paymentFilter) return false;
      if (fromTime !== null && created < fromTime) return false;
      if (toTime !== null && created > toTime) return false;
      if (min !== null && invoice.totals.grandTotal < min) return false;
      if (max !== null && invoice.totals.grandTotal > max) return false;

      if (!normalizedQuery) return true;
      const searchable = [
        invoice.invoiceNumber,
        invoice.customer.name,
        invoice.customer.phone,
        invoice.customer.gstin,
        invoice.customer.state,
        invoice.paymentMode,
        invoice.status,
        String(invoice.totals.grandTotal),
        new Date(invoice.createdAt).toLocaleDateString(),
        ...invoice.items.flatMap((item) => [
          item.product.name,
          item.product.barcode,
          item.product.sku,
          item.product.category,
          item.product.hsn
        ])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchable.includes(normalizedQuery);
    });
  }, [fromDate, invoices, maxTotal, minTotal, paymentFilter, query, toDate]);

  const resetFilters = () => {
    setQuery("");
    setPaymentFilter("all");
    setFromDate("");
    setToDate("");
    setMinTotal("");
    setMaxTotal("");
  };

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Saved bills</h2>
          <p className="muted">{filteredInvoices.length} of {invoices.length} bills shown</p>
        </div>
        <button className="ghost-button" onClick={resetFilters}>Reset filters</button>
      </div>
      <div className="filter-grid">
        <label className="field"><span>Search invoice, customer, phone, GSTIN, product, barcode</span><input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="field"><span>Payment mode</span><select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as "all" | PaymentMode)}>
          <option value="all">All payments</option>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="card">Card</option>
          <option value="mixed">Mixed</option>
        </select></label>
        <label className="field"><span>From date</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="field"><span>To date</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <label className="field"><span>Minimum total</span><input type="number" step="0.01" value={minTotal} onChange={(event) => setMinTotal(event.target.value)} /></label>
        <label className="field"><span>Maximum total</span><input type="number" step="0.01" value={maxTotal} onChange={(event) => setMaxTotal(event.target.value)} /></label>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Invoice</th><th>Customer</th><th>Items</th><th>Date</th><th>Total</th><th>Payment</th><th></th></tr></thead>
          <tbody>
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id}>
                <td>{invoice.invoiceNumber}</td>
                <td><strong>{invoice.customer.name || "Walk-in"}</strong><span className="muted block">{[invoice.customer.phone, invoice.customer.gstin].filter(Boolean).join(" | ")}</span></td>
                <td>{invoice.items.length} item{invoice.items.length === 1 ? "" : "s"}<span className="muted block">{invoice.items.map((item) => item.product.name).join(", ")}</span></td>
                <td>{new Date(invoice.createdAt).toLocaleString()}</td>
                <td>{formatCurrency(invoice.totals.grandTotal)}</td>
                <td>{invoice.paymentMode.toUpperCase()}</td>
                <td><button className="small-button" onClick={() => setSelected(invoice)}><Printer size={16} /> Print</button></td>
              </tr>
            ))}
            {!filteredInvoices.length ? <tr><td colSpan={7}>{invoices.length ? "No bills match the current filters." : "No bills saved yet."}</td></tr> : null}
          </tbody>
        </table>
      </div>
      {selected ? <InvoiceModal invoice={selected} settings={settings} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function InvoiceModal({ invoice, settings, onClose }: { invoice: Invoice; settings: AppSettings; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className={`invoice-preview ${settings.receiptSize}`}>
        <div className="modal-header no-print">
          <h2>{invoice.invoiceNumber}</h2>
          <div className="button-row">
            <button className="primary-button" onClick={() => window.print()}><Printer size={18} /> Print</button>
            <button className="ghost-button" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="print-area">
          <h2>{settings.businessName}</h2>
          <p>{settings.address}</p>
          <p>GSTIN: {settings.gstin}</p>
          <hr />
          <div className="print-meta">
            <span>Invoice: {invoice.invoiceNumber}</span>
            <span>{new Date(invoice.createdAt).toLocaleString()}</span>
          </div>
          <p>Customer: {invoice.customer.name || "Walk-in"} {invoice.customer.phone ? `| ${invoice.customer.phone}` : ""}</p>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
            <tbody>
              {invoice.items.map((item) => <tr key={item.product.id}><td>{item.product.name}</td><td>{item.quantity}</td><td>{formatCurrency(item.total)}</td></tr>)}
            </tbody>
          </table>
          <div className="print-totals">
            <TotalRow label="Taxable" value={invoice.totals.taxableValue} />
            <TotalRow label="CGST" value={invoice.totals.cgst} />
            <TotalRow label="SGST" value={invoice.totals.sgst} />
            <TotalRow label="IGST" value={invoice.totals.igst} />
            <TotalRow label="Total" value={invoice.totals.grandTotal} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Reports({ data }: { data: AppData }) {
  const stock = stockByProduct(data.products, data.movements);
  const gstTotals = data.invoices.reduce((acc, invoice) => ({
    taxable: acc.taxable + invoice.totals.taxableValue,
    cgst: acc.cgst + invoice.totals.cgst,
    sgst: acc.sgst + invoice.totals.sgst,
    igst: acc.igst + invoice.totals.igst,
    total: acc.total + invoice.totals.grandTotal
  }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
  const cashierSales = data.invoices.reduce<Record<string, number>>((acc, invoice) => {
    acc[invoice.createdBy || "unknown"] = (acc[invoice.createdBy || "unknown"] ?? 0) + invoice.totals.grandTotal;
    return acc;
  }, {});

  return (
    <section className="page-grid">
      <Metric label="Taxable sales" value={formatCurrency(gstTotals.taxable)} />
      <Metric label="GST collected" value={formatCurrency(gstTotals.cgst + gstTotals.sgst + gstTotals.igst)} />
      <Metric label="Invoice count" value={String(data.invoices.length)} />
      <Metric label="Revenue" value={formatCurrency(gstTotals.total)} />
      <div className="panel">
        <div className="panel-header"><h2>GST summary</h2></div>
        <TotalRow label="CGST" value={gstTotals.cgst} />
        <TotalRow label="SGST" value={gstTotals.sgst} />
        <TotalRow label="IGST" value={gstTotals.igst} />
      </div>
      <div className="panel">
        <div className="panel-header"><h2>Cashier-wise sales</h2></div>
        {Object.entries(cashierSales).map(([cashier, total]) => <TotalRow key={cashier} label={cashier} value={total} />)}
        {!Object.keys(cashierSales).length ? <p className="muted">No sales yet.</p> : null}
      </div>
      <div className="panel wide">
        <div className="panel-header"><h2>Stock movement history</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>Type</th><th>Qty</th><th>Reference</th><th>Date</th></tr></thead>
            <tbody>
              {data.movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{data.products.find((product) => product.id === movement.productId)?.name ?? movement.productId}</td>
                  <td>{movement.type}</td>
                  <td>{movement.quantity}</td>
                  <td>{movement.reference}</td>
                  <td>{new Date(movement.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SettingsPage({ settings, saveSettings }: { settings: AppSettings; saveSettings: (settings: AppSettings) => Promise<void> }) {
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);
  return (
    <form className="panel form-grid settings-form" onSubmit={async (event) => { event.preventDefault(); await saveSettings(form); }}>
      <div className="panel-header"><h2>Business settings</h2></div>
      <label className="field"><span>Business name</span><input value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
      <label className="field"><span>GSTIN</span><input value={form.gstin} onChange={(event) => setForm({ ...form, gstin: event.target.value })} /></label>
      <label className="field"><span>Address</span><textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} rows={3} /></label>
      <label className="field"><span>Business state</span><input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></label>
      <label className="field"><span>Invoice prefix</span><input value={form.invoicePrefix} onChange={(event) => setForm({ ...form, invoicePrefix: event.target.value })} /></label>
      <label className="field"><span>Default print format</span><select value={form.receiptSize} onChange={(event) => setForm({ ...form, receiptSize: event.target.value as AppSettings["receiptSize"] })}>
        <option value="a4">A4 invoice</option>
        <option value="thermal-80">80mm receipt</option>
        <option value="thermal-58">58mm receipt</option>
      </select></label>
      <button className="primary-button"><Save size={18} /> Save settings</button>
    </form>
  );
}

export default App;
