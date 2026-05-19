import { describe, expect, it } from "vitest";
import { billingDraftVersion, restoreBillingDraft, serializeBillingDraft } from "./billingDraft";
import type { Product } from "./types";

const product: Product = {
  id: "p1",
  barcode: "8901",
  sku: "SKU-1",
  name: "Sample Product",
  category: "General",
  hsn: "3004",
  unit: "pcs",
  gstRate: 5,
  mrp: 100,
  sellingPrice: 90,
  reorderLevel: 5,
  active: true,
  createdAt: new Date().toISOString()
};

describe("billing draft restore", () => {
  it("ignores stale unversioned drafts from older builds", () => {
    const oldDraft = JSON.stringify({
      customer: { name: "", phone: "", gstin: "", state: "" },
      lines: [{ product, quantity: 1, unitPrice: 90, discountType: "amount", discountValue: 0 }],
      billDiscount: { type: "amount", value: 0 },
      paymentMode: "cash"
    });

    expect(restoreBillingDraft(oldDraft, [product])).toBeNull();
  });

  it("ignores deleted or empty carts", () => {
    const emptyDraft = JSON.stringify({
      version: billingDraftVersion,
      customer: { name: "", phone: "", gstin: "", state: "" },
      lines: [],
      billDiscount: { type: "amount", value: 0 },
      paymentMode: "cash",
      updatedAt: new Date().toISOString()
    });

    expect(restoreBillingDraft(emptyDraft, [product])).toBeNull();
  });

  it("restores valid current drafts with current product data", () => {
    const raw = serializeBillingDraft({
      customer: { name: "Asha", phone: "", gstin: "", state: "Kerala" },
      lines: [{ product: { ...product, name: "Old Name" }, quantity: 2, unitPrice: 90, discountType: "amount", discountValue: 0 }],
      billDiscount: { type: "amount", value: 0 },
      paymentMode: "cash"
    });

    const restored = restoreBillingDraft(raw, [product]);
    expect(restored?.lines[0].product.name).toBe("Sample Product");
    expect(restored?.lines[0].quantity).toBe(2);
  });
});
