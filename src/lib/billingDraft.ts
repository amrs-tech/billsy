import type { BillDiscount, BillLineInput, Customer, PaymentMode, Product } from "./types";

export const billingDraftKey = "billsy-draft";
export const billingDraftVersion = 2;

export type BillingDraft = {
  version: typeof billingDraftVersion;
  customer: Customer;
  lines: BillLineInput[];
  billDiscount: BillDiscount;
  paymentMode: PaymentMode;
  updatedAt: string;
};

export const serializeBillingDraft = (draft: Omit<BillingDraft, "version" | "updatedAt">) =>
  JSON.stringify({
    version: billingDraftVersion,
    ...draft,
    updatedAt: new Date().toISOString()
  } satisfies BillingDraft);

export const restoreBillingDraft = (rawDraft: string | null, products: Product[]) => {
  if (!rawDraft) return null;

  try {
    const parsed = JSON.parse(rawDraft) as Partial<BillingDraft>;
    if (parsed.version !== billingDraftVersion || !Array.isArray(parsed.lines) || !parsed.lines.length) return null;

    const lines = parsed.lines
      .map((line) => {
        const currentProduct = products.find((product) => product.id === line.product?.id && product.active);
        if (!currentProduct) return null;
        return { ...line, product: currentProduct };
      })
      .filter((line): line is BillLineInput => Boolean(line));

    if (!lines.length || !parsed.customer || !parsed.billDiscount || !parsed.paymentMode) return null;
    return { ...parsed, lines } as BillingDraft;
  } catch {
    return null;
  }
};
