import { calculateBill } from "./calculations";
import { isSupabaseConfigured, supabase } from "./supabase";
import type {
  AppSettings,
  BillDiscount,
  CalculatedBillLine,
  Customer,
  Invoice,
  PaymentMode,
  Product,
  Profile,
  StockMovement
} from "./types";

type AppData = {
  products: Product[];
  movements: StockMovement[];
  invoices: Invoice[];
  settings: AppSettings;
};

export type InvoiceDraftPayload = {
  customer: Customer;
  items: CalculatedBillLine[];
  billDiscount: BillDiscount;
  paymentMode: PaymentMode;
  settings: AppSettings;
};

export type Repository = {
  mode: "supabase" | "demo";
  signIn(email: string, password: string, demoRole?: Profile["role"]): Promise<Profile>;
  signOut(): Promise<void>;
  getInitialProfile(): Promise<Profile | null>;
  loadData(): Promise<AppData>;
  saveProduct(product: Product): Promise<Product>;
  addStockMovement(movement: StockMovement): Promise<StockMovement>;
  saveInvoice(payload: InvoiceDraftPayload, profile: Profile): Promise<Invoice>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
};

const nowIso = () => new Date().toISOString();
export const newId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

export const defaultSettings: AppSettings = {
  businessName: "Billsy Store",
  gstin: "32ABCDE1234F1Z5",
  address: "Market Road, Kochi, Kerala",
  state: "Kerala",
  invoicePrefix: "BIL",
  receiptSize: "a4"
};

const seedProducts: Product[] = [
  {
    id: "prod-rice",
    barcode: "8901000000012",
    sku: "GROC-RICE-5KG",
    name: "Premium Rice 5 kg",
    category: "Grocery",
    hsn: "1006",
    unit: "bag",
    gstRate: 5,
    mrp: 420,
    sellingPrice: 399,
    reorderLevel: 8,
    active: true,
    createdAt: nowIso()
  },
  {
    id: "prod-oil",
    barcode: "8901000000029",
    sku: "GROC-OIL-1L",
    name: "Sunflower Oil 1 L",
    category: "Grocery",
    hsn: "1512",
    unit: "bottle",
    gstRate: 5,
    mrp: 180,
    sellingPrice: 165,
    reorderLevel: 12,
    active: true,
    createdAt: nowIso()
  },
  {
    id: "prod-notebook",
    barcode: "8901000000036",
    sku: "STAT-NOTE-A4",
    name: "A4 Notebook 200 pages",
    category: "Stationery",
    hsn: "4820",
    unit: "pcs",
    gstRate: 12,
    mrp: 95,
    sellingPrice: 88,
    reorderLevel: 15,
    active: true,
    createdAt: nowIso()
  }
];

const seedMovements: StockMovement[] = seedProducts.map((product, index) => ({
  id: `seed-${product.id}`,
  productId: product.id,
  type: "inward",
  quantity: [24, 36, 60][index],
  reference: "OPENING",
  notes: "Opening stock",
  createdAt: nowIso(),
  createdBy: "demo-admin"
}));

const localKey = "billsy-demo-data";

const readLocalData = (): AppData => {
  const stored = localStorage.getItem(localKey);
  if (stored) return JSON.parse(stored) as AppData;
  const data: AppData = {
    products: seedProducts,
    movements: seedMovements,
    invoices: [],
    settings: defaultSettings
  };
  localStorage.setItem(localKey, JSON.stringify(data));
  return data;
};

const writeLocalData = (data: AppData) => localStorage.setItem(localKey, JSON.stringify(data));

const toSnakeProduct = (product: Product) => ({
  id: product.id,
  barcode: product.barcode,
  sku: product.sku,
  name: product.name,
  category: product.category,
  hsn: product.hsn,
  unit: product.unit,
  gst_rate: product.gstRate,
  mrp: product.mrp,
  selling_price: product.sellingPrice,
  reorder_level: product.reorderLevel,
  active: product.active,
  created_at: product.createdAt
});

const fromSnakeProduct = (row: Record<string, any>): Product => ({
  id: row.id,
  barcode: row.barcode,
  sku: row.sku,
  name: row.name,
  category: row.category,
  hsn: row.hsn,
  unit: row.unit,
  gstRate: Number(row.gst_rate),
  mrp: Number(row.mrp),
  sellingPrice: Number(row.selling_price),
  reorderLevel: Number(row.reorder_level),
  active: Boolean(row.active),
  createdAt: row.created_at
});

const toSnakeMovement = (movement: StockMovement) => ({
  id: movement.id,
  product_id: movement.productId,
  type: movement.type,
  quantity: movement.quantity,
  reference: movement.reference,
  notes: movement.notes,
  created_at: movement.createdAt,
  created_by: movement.createdBy
});

const fromSnakeMovement = (row: Record<string, any>): StockMovement => ({
  id: row.id,
  productId: row.product_id,
  type: row.type,
  quantity: Number(row.quantity),
  reference: row.reference ?? "",
  notes: row.notes ?? "",
  createdAt: row.created_at,
  createdBy: row.created_by ?? ""
});

const fromSnakeSettings = (row: Record<string, any>): AppSettings => ({
  businessName: row.business_name,
  gstin: row.gstin,
  address: row.address,
  state: row.state,
  invoicePrefix: row.invoice_prefix,
  receiptSize: row.receipt_size
});

const toSnakeSettings = (settings: AppSettings) => ({
  id: true,
  business_name: settings.businessName,
  gstin: settings.gstin,
  address: settings.address,
  state: settings.state,
  invoice_prefix: settings.invoicePrefix,
  receipt_size: settings.receiptSize
});

const fromSnakeInvoice = (row: Record<string, any>): Invoice => ({
  id: row.id,
  invoiceNumber: row.invoice_number,
  customer: row.customer,
  billDiscount: row.bill_discount,
  items: (row.invoice_items ?? []).map((item: Record<string, any>) => ({
    product: item.product_snapshot,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    discountType: "amount",
    discountValue: 0,
    gross: Number(item.unit_price) * Number(item.quantity),
    discountAmount: Number(item.discount_amount),
    taxableValue: Number(item.taxable_value),
    cgst: Number(item.cgst),
    sgst: Number(item.sgst),
    igst: Number(item.igst),
    total: Number(item.total)
  })),
  totals: {
    subtotal: Number(row.subtotal),
    lineDiscountTotal: Number(row.line_discount_total),
    billDiscountAmount: Number(row.bill_discount_amount),
    taxableValue: Number(row.taxable_value),
    cgst: Number(row.cgst),
    sgst: Number(row.sgst),
    igst: Number(row.igst),
    grandTotal: Number(row.grand_total)
  },
  paymentMode: row.payment_mode,
  status: row.status,
  createdAt: row.created_at,
  createdBy: row.created_by ?? ""
});

const createDemoRepository = (): Repository => ({
  mode: "demo",
  async signIn(_email, _password, demoRole = "admin") {
    const profile = { id: demoRole === "admin" ? "demo-admin" : "demo-cashier", name: demoRole === "admin" ? "Demo Admin" : "Demo Cashier", role: demoRole };
    localStorage.setItem("billsy-profile", JSON.stringify(profile));
    return profile;
  },
  async signOut() {
    localStorage.removeItem("billsy-profile");
  },
  async getInitialProfile() {
    const profile = localStorage.getItem("billsy-profile");
    return profile ? (JSON.parse(profile) as Profile) : null;
  },
  async loadData() {
    return readLocalData();
  },
  async saveProduct(product) {
    const data = readLocalData();
    const exists = data.products.some((item) => item.id === product.id);
    data.products = exists ? data.products.map((item) => (item.id === product.id ? product : item)) : [product, ...data.products];
    writeLocalData(data);
    return product;
  },
  async addStockMovement(movement) {
    const data = readLocalData();
    data.movements = [movement, ...data.movements];
    writeLocalData(data);
    return movement;
  },
  async saveInvoice(payload, profile) {
    const data = readLocalData();
    const invoice: Invoice = {
      id: newId(),
      invoiceNumber: `${payload.settings.invoicePrefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(data.invoices.length + 1).padStart(4, "0")}`,
      customer: payload.customer,
      items: payload.items,
      billDiscount: payload.billDiscount,
      totals: payload.items.reduce(
        () => calculateBill(payload.items, payload.billDiscount, payload.settings, payload.customer.state).totals,
        calculateBill(payload.items, payload.billDiscount, payload.settings, payload.customer.state).totals
      ),
      paymentMode: payload.paymentMode,
      status: "saved",
      createdAt: nowIso(),
      createdBy: profile.id
    };
    const saleMovements = invoice.items.map<StockMovement>((item) => ({
      id: newId(),
      productId: item.product.id,
      type: "sale",
      quantity: -item.quantity,
      reference: invoice.invoiceNumber,
      notes: "Invoice sale",
      createdAt: nowIso(),
      createdBy: profile.id
    }));
    data.invoices = [invoice, ...data.invoices];
    data.movements = [...saleMovements, ...data.movements];
    localStorage.removeItem("billsy-draft");
    writeLocalData(data);
    return invoice;
  },
  async saveSettings(settings) {
    const data = readLocalData();
    data.settings = settings;
    writeLocalData(data);
    return settings;
  }
});

const createSupabaseRepository = (): Repository => ({
  mode: "supabase",
  async signIn(email, password) {
    const client = supabase!;
    const { data: authData, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profile, error: profileError } = await client.from("profiles").select("*").eq("id", authData.user.id).single();
    if (profileError) throw profileError;
    if (!profile) throw new Error("Signed in, but no profile row exists for this user.");
    return { id: profile.id, name: profile.name, role: profile.role };
  },
  async signOut() {
    await supabase!.auth.signOut();
  },
  async getInitialProfile() {
    const client = supabase!;
    const { data } = await client.auth.getUser();
    if (!data.user) return null;
    const { data: profile, error } = await client.from("profiles").select("*").eq("id", data.user.id).single();
    if (error) throw error;
    return profile ? { id: profile.id, name: profile.name, role: profile.role } : null;
  },
  async loadData() {
    const client = supabase!;
    const [productsRes, movementsRes, invoicesRes, settingsRes] = await Promise.all([
      client.from("products").select("*").order("created_at", { ascending: false }),
      client.from("stock_movements").select("*").order("created_at", { ascending: false }),
      client.from("invoices").select("*, invoice_items(*)").order("created_at", { ascending: false }),
      client.from("app_settings").select("*").single()
    ]);
    if (productsRes.error) throw productsRes.error;
    if (movementsRes.error) throw movementsRes.error;
    if (invoicesRes.error) throw invoicesRes.error;
    if (settingsRes.error) throw settingsRes.error;
    return {
      products: productsRes.data.map(fromSnakeProduct),
      movements: movementsRes.data.map(fromSnakeMovement),
      invoices: invoicesRes.data.map(fromSnakeInvoice),
      settings: fromSnakeSettings(settingsRes.data)
    };
  },
  async saveProduct(product) {
    const { data, error } = await supabase!.from("products").upsert(toSnakeProduct(product)).select("*").single();
    if (error) throw error;
    return fromSnakeProduct(data);
  },
  async addStockMovement(movement) {
    const { data, error } = await supabase!.from("stock_movements").insert(toSnakeMovement(movement)).select("*").single();
    if (error) throw error;
    return fromSnakeMovement(data);
  },
  async saveInvoice(payload, profile) {
    const { data: invoiceId, error } = await supabase!.rpc("save_invoice", {
      payload: {
        customer: payload.customer,
        items: payload.items,
        billDiscount: payload.billDiscount,
        totals: calculateBill(payload.items, payload.billDiscount, payload.settings, payload.customer.state).totals,
        paymentMode: payload.paymentMode,
        invoicePrefix: payload.settings.invoicePrefix
      }
    });
    if (error) throw error;
    const { data, error: fetchError } = await supabase!.from("invoices").select("*, invoice_items(*)").eq("id", invoiceId).single();
    if (fetchError) throw fetchError;
    localStorage.removeItem("billsy-draft");
    return { ...fromSnakeInvoice(data), createdBy: profile.id };
  },
  async saveSettings(settings) {
    const { data, error } = await supabase!
      .from("app_settings")
      .update({
        business_name: settings.businessName,
        gstin: settings.gstin,
        address: settings.address,
        state: settings.state,
        invoice_prefix: settings.invoicePrefix,
        receipt_size: settings.receiptSize
      })
      .eq("id", true)
      .select("*")
      .single();
    if (error) throw error;
    return fromSnakeSettings(data);
  }
});

export const repository = isSupabaseConfigured ? createSupabaseRepository() : createDemoRepository();
