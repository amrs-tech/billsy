import type {
  AppSettings,
  BillDiscount,
  BillLineInput,
  BillTotals,
  CalculatedBillLine,
  StockMovement
} from "./types";

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);

export const calculateCurrentStock = (productId: string, movements: StockMovement[]) =>
  movements
    .filter((movement) => movement.productId === productId)
    .reduce((total, movement) => total + movement.quantity, 0);

export const calculateDiscount = (base: number, discount: BillDiscount) => {
  if (discount.value <= 0) return 0;
  const raw = discount.type === "percent" ? (base * discount.value) / 100 : discount.value;
  return roundMoney(Math.min(base, Math.max(0, raw)));
};

export const calculateBill = (
  lines: BillLineInput[],
  billDiscount: BillDiscount,
  settings: AppSettings,
  customerState: string
): { items: CalculatedBillLine[]; totals: BillTotals } => {
  const sameState = !customerState || customerState.trim().toLowerCase() === settings.state.trim().toLowerCase();
  const itemBase = lines.map((line) => {
    const gross = roundMoney(line.unitPrice * line.quantity);
    const discountAmount = calculateDiscount(gross, {
      type: line.discountType,
      value: line.discountValue
    });
    const totalBeforeBillDiscount = roundMoney(gross - discountAmount);
    return { ...line, gross, discountAmount, totalBeforeBillDiscount };
  });
  const afterLineDiscount = itemBase.reduce((sum, line) => sum + line.totalBeforeBillDiscount, 0);
  const billDiscountAmount = calculateDiscount(afterLineDiscount, billDiscount);

  const items: CalculatedBillLine[] = itemBase.map((line) => {
    const discountShare = afterLineDiscount > 0 ? (line.totalBeforeBillDiscount / afterLineDiscount) * billDiscountAmount : 0;
    const total = roundMoney(line.totalBeforeBillDiscount - discountShare);
    const taxableValue = roundMoney(total / (1 + line.product.gstRate / 100));
    const tax = roundMoney(total - taxableValue);
    return {
      product: line.product,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountType: line.discountType,
      discountValue: line.discountValue,
      gross: line.gross,
      discountAmount: roundMoney(line.discountAmount + discountShare),
      taxableValue,
      cgst: sameState ? roundMoney(tax / 2) : 0,
      sgst: sameState ? roundMoney(tax / 2) : 0,
      igst: sameState ? 0 : tax,
      total
    };
  });

  const totals = items.reduce<BillTotals>(
    (acc, item) => ({
      subtotal: roundMoney(acc.subtotal + item.gross),
      lineDiscountTotal: roundMoney(acc.lineDiscountTotal + item.discountAmount),
      billDiscountAmount,
      taxableValue: roundMoney(acc.taxableValue + item.taxableValue),
      cgst: roundMoney(acc.cgst + item.cgst),
      sgst: roundMoney(acc.sgst + item.sgst),
      igst: roundMoney(acc.igst + item.igst),
      grandTotal: roundMoney(acc.grandTotal + item.total)
    }),
    {
      subtotal: 0,
      lineDiscountTotal: 0,
      billDiscountAmount,
      taxableValue: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      grandTotal: 0
    }
  );

  return { items, totals };
};
