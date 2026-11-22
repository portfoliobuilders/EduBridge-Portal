/**
 * VAT Treatment utilities and calculations.
 * Strict parity with PostgreSQL enrollment_ledger and record_payment logic.
 * All financial rounding is performed to 2 decimal places.
 */

export type VatTreatment = 'exclusive' | 'inclusive' | 'none';
export type NoVatReason = 'zero_rated' | 'exempt' | 'out_of_scope';

export interface VatBreakdown {
  netFee: number;
  taxable: number;
  vatTotal: number;
  totalPayable: number;
  treatment: VatTreatment;
  vatRate: number;
}

/**
 * Standard 2-decimal rounding matching SQL round(numeric, 2).
 */
export function roundToTwoDecimals(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Computes taxable amount, VAT total, and total payable from net fee.
 *
 * exclusive:
 *   taxable = net_fee
 *   vat_total = round(net_fee * rate / 100, 2)
 *   total_payable = net_fee + vat_total
 *
 * inclusive:
 *   total_payable = net_fee
 *   vat_total = round(net_fee * rate / (100 + rate), 2)
 *   taxable = net_fee - vat_total
 *
 * none:
 *   taxable = net_fee
 *   vat_total = 0.00
 *   total_payable = net_fee
 */
export function calculateVatBreakdown(
  totalFee: number,
  discount: number = 0,
  treatment: VatTreatment = 'exclusive',
  rate: number = 5.0
): VatBreakdown {
  const safeTotal = Math.max(0, isNaN(totalFee) ? 0 : totalFee);
  const safeDiscount = Math.max(0, isNaN(discount) ? 0 : discount);
  const netFee = roundToTwoDecimals(Math.max(0, safeTotal - safeDiscount));
  const safeRate = Math.max(0, isNaN(rate) ? 5.0 : rate);

  if (treatment === 'exclusive') {
    const vatTotal = roundToTwoDecimals((netFee * safeRate) / 100);
    const totalPayable = roundToTwoDecimals(netFee + vatTotal);
    return {
      netFee,
      taxable: netFee,
      vatTotal,
      totalPayable,
      treatment,
      vatRate: safeRate,
    };
  }

  if (treatment === 'inclusive') {
    const vatTotal = roundToTwoDecimals((netFee * safeRate) / (100 + safeRate));
    const taxable = roundToTwoDecimals(netFee - vatTotal);
    return {
      netFee,
      taxable,
      vatTotal,
      totalPayable: netFee,
      treatment,
      vatRate: safeRate,
    };
  }

  // treatment === 'none'
  return {
    netFee,
    taxable: netFee,
    vatTotal: 0,
    totalPayable: netFee,
    treatment: 'none',
    vatRate: safeRate,
  };
}

/**
 * Computes VAT amount and taxable amount for an individual payment installment.
 * Implements exact rounding reconciliation on final payment bringing balance to 0.
 */
export function calculatePaymentVat({
  amount,
  balanceBefore,
  enrollmentVatTotal,
  priorValidVatSum = 0,
  openingPaid = 0,
  treatment = 'exclusive',
  rate = 5.0,
}: {
  amount: number;
  balanceBefore?: number;
  enrollmentVatTotal?: number;
  priorValidVatSum?: number;
  openingPaid?: number;
  treatment?: VatTreatment;
  rate?: number;
}): { vatAmount: number; taxableAmount: number; isReconciled: boolean } {
  const safeAmount = roundToTwoDecimals(Math.max(0, amount));
  const safeRate = Math.max(0, isNaN(rate) ? 5.0 : rate);

  if (treatment === 'none') {
    return {
      vatAmount: 0,
      taxableAmount: safeAmount,
      isReconciled: false,
    };
  }

  // If balanceBefore and enrollmentVatTotal are provided and this payment brings balance to 0, reconcile
  if (
    balanceBefore !== undefined &&
    enrollmentVatTotal !== undefined &&
    roundToTwoDecimals(balanceBefore - safeAmount) <= 0.0001 &&
    balanceBefore > 0
  ) {
    const openingVat =
      openingPaid > 0
        ? roundToTwoDecimals((openingPaid * safeRate) / (100 + safeRate))
        : 0;

    const reconciledVat = roundToTwoDecimals(
      enrollmentVatTotal - priorValidVatSum - openingVat
    );
    const reconciledTaxable = roundToTwoDecimals(safeAmount - reconciledVat);

    return {
      vatAmount: reconciledVat,
      taxableAmount: reconciledTaxable,
      isReconciled: true,
    };
  }

  // Standard installment VAT portion: round(amount * rate / (100 + rate), 2)
  const vatAmount = roundToTwoDecimals(
    (safeAmount * safeRate) / (100 + safeRate)
  );
  const taxableAmount = roundToTwoDecimals(safeAmount - vatAmount);

  return {
    vatAmount,
    taxableAmount,
    isReconciled: false,
  };
}

export function getVatTreatmentLabel(treatment: VatTreatment): string {
  switch (treatment) {
    case 'exclusive':
      return '+ VAT on top';
    case 'inclusive':
      return 'Includes VAT';
    case 'none':
      return 'No VAT';
    default:
      return '+ VAT on top';
  }
}

export function getNoVatReasonLabel(reason?: NoVatReason | string | null): string {
  switch (reason) {
    case 'zero_rated':
      return 'Zero-rated (0%)';
    case 'exempt':
      return 'Exempt from VAT';
    case 'out_of_scope':
      return 'Out of scope';
    default:
      return 'Zero-rated (0%)';
  }
}
