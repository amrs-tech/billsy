export type Role = "admin" | "cashier";

export type DiscountType = "amount" | "percent";

export type Product = {
  id: string;
  barcode: string;
  sku: string;
  name: string;
  category: string;
  hsn: string;
  unit: string;
  gstRate: number;
  mrp: number;
  sellingPrice: number;
  reorderLevel: number;
  active: boolean;
  createdAt: string;
};

export type StockMovementType = "inward" | "sale" | "adjustment" | "cancellation";

export type StockMovement = {
  id: string;
  productId: string;
  type: StockMovementType;
  quantity: number;
  reference: string;
  notes: string;
  createdAt: string;
  createdBy: string;
};

export type Customer = {
  name: string;
  phone: string;
  gstin: string;
  state: string;
};

export type BillLineInput = {
  product: Product;
  quantity: number;
  unitPrice: number;
  discountType: DiscountType;
  discountValue: number;
};

export type CalculatedBillLine = BillLineInput & {
  gross: number;
  discountAmount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export type BillDiscount = {
  type: DiscountType;
  value: number;
};

export type BillTotals = {
  subtotal: number;
  lineDiscountTotal: number;
  billDiscountAmount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
};

export type InvoiceStatus = "saved" | "cancelled";
export type PaymentMode = "cash" | "upi" | "card" | "mixed";

export type Invoice = {
  id: string;
  invoiceNumber: string;
  customer: Customer;
  items: CalculatedBillLine[];
  billDiscount: BillDiscount;
  totals: BillTotals;
  paymentMode: PaymentMode;
  status: InvoiceStatus;
  createdAt: string;
  createdBy: string;
};

export type AppSettings = {
  businessName: string;
  gstin: string;
  address: string;
  state: string;
  invoicePrefix: string;
  receiptSize: "a4" | "thermal-80" | "thermal-58";
};

export type Profile = {
  id: string;
  name: string;
  role: Role;
};

export type ReportSummary = {
  salesToday: number;
  invoicesToday: number;
  lowStockCount: number;
  stockValue: number;
};
