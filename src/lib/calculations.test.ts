import { describe, expect, it } from "vitest";
import { calculateBill, calculateCurrentStock, calculateDiscount } from "./calculations";
import { defaultSettings } from "./repository";
import type { BillLineInput, Product, StockMovement } from "./types";

const product: Product = {
  id: "p1",
  barcode: "8901",
  sku: "SKU-1",
  name: "Test Product",
  category: "Test",
  hsn: "1001",
  unit: "pcs",
  gstRate: 18,
  mrp: 118,
  sellingPrice: 118,
  reorderLevel: 5,
  active: true,
  createdAt: new Date().toISOString()
};

describe("billing calculations", () => {
  it("caps discounts at the base amount", () => {
    expect(calculateDiscount(100, { type: "amount", value: 250 })).toBe(100);
    expect(calculateDiscount(100, { type: "percent", value: 10 })).toBe(10);
  });

  it("splits GST into CGST and SGST for same-state invoices", () => {
    const line: BillLineInput = { product, quantity: 1, unitPrice: 118, discountType: "amount", discountValue: 0 };
    const bill = calculateBill([line], { type: "amount", value: 0 }, defaultSettings, defaultSettings.state);
    expect(bill.totals.taxableValue).toBe(100);
    expect(bill.totals.cgst).toBe(9);
    expect(bill.totals.sgst).toBe(9);
    expect(bill.totals.igst).toBe(0);
    expect(bill.totals.grandTotal).toBe(118);
  });

  it("uses IGST for out-of-state invoices", () => {
    const line: BillLineInput = { product, quantity: 1, unitPrice: 118, discountType: "amount", discountValue: 0 };
    const bill = calculateBill([line], { type: "amount", value: 0 }, defaultSettings, "Tamil Nadu");
    expect(bill.totals.cgst).toBe(0);
    expect(bill.totals.sgst).toBe(0);
    expect(bill.totals.igst).toBe(18);
  });

  it("calculates current stock from movement ledger", () => {
    const movements: StockMovement[] = [
      { id: "1", productId: "p1", type: "inward", quantity: 10, reference: "", notes: "", createdAt: "", createdBy: "" },
      { id: "2", productId: "p1", type: "sale", quantity: -3, reference: "", notes: "", createdAt: "", createdBy: "" }
    ];
    expect(calculateCurrentStock("p1", movements)).toBe(7);
  });
});
