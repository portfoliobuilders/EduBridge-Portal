import { describe, it, expect } from 'vitest';
import {
  calculateVatBreakdown,
  calculatePaymentVat,
  roundToTwoDecimals,
  getVatTreatmentLabel,
  getNoVatReasonLabel,
} from './vat';

describe('VAT Treatment & Financial Calculations', () => {
  // Case 1: Exclusive 10,000 -> payable 10,500, VAT 500, taxable 10,000
  it('Case 1: Exclusive 10,000 produces taxable 10,000, VAT 500, payable 10,500', () => {
    const res = calculateVatBreakdown(10000, 0, 'exclusive', 5.0);
    expect(res.taxable).toBe(10000.0);
    expect(res.vatTotal).toBe(500.0);
    expect(res.totalPayable).toBe(10500.0);
  });

  // Case 2: Inclusive 10,000 -> VAT 476.19, taxable 9,523.81, payable 10,000
  it('Case 2: Inclusive 10,000 produces VAT 476.19, taxable 9523.81, payable 10000', () => {
    const res = calculateVatBreakdown(10000, 0, 'inclusive', 5.0);
    expect(res.vatTotal).toBe(476.19);
    expect(res.taxable).toBe(9523.81);
    expect(res.totalPayable).toBe(10000.0);
  });

  // Case 3: None 10,000 -> VAT 0, taxable 10,000, payable 10,000
  it('Case 3: No VAT 10,000 produces VAT 0, taxable 10,000, payable 10,000', () => {
    const res = calculateVatBreakdown(10000, 0, 'none', 5.0);
    expect(res.vatTotal).toBe(0.0);
    expect(res.taxable).toBe(10000.0);
    expect(res.totalPayable).toBe(10000.0);
  });

  // Case 4: Discount 1,000 on exclusive 10,000 -> payable 9,450, VAT 450
  it('Case 4: Discount 1,000 on exclusive 10,000 produces net 9,000, VAT 450, payable 9450', () => {
    const res = calculateVatBreakdown(10000, 1000, 'exclusive', 5.0);
    expect(res.netFee).toBe(9000.0);
    expect(res.taxable).toBe(9000.0);
    expect(res.vatTotal).toBe(450.0);
    expect(res.totalPayable).toBe(9450.0);
  });

  // Case 5: Discount 1,000 on inclusive 10,000 -> net 9,000, payable 9,000, VAT 428.57, taxable 8,571.43
  it('Case 5: Discount 1,000 on inclusive 10,000 produces net 9,000, payable 9,000, VAT 428.57, taxable 8571.43', () => {
    const res = calculateVatBreakdown(10000, 1000, 'inclusive', 5.0);
    expect(res.netFee).toBe(9000.0);
    expect(res.totalPayable).toBe(9000.0);
    expect(res.vatTotal).toBe(428.57);
    expect(res.taxable).toBe(8571.43);
  });

  // Case 6: Three payments on exclusive (3,000 + 3,000 + 4,500) -> per-receipt VAT sums exactly to 500.00
  it('Case 6: Three payments on exclusive 10,000 (3000 + 3000 + 4500) sum exactly to 500.00', () => {
    const breakdown = calculateVatBreakdown(10000, 0, 'exclusive', 5.0);
    expect(breakdown.vatTotal).toBe(500.0);

    const p1 = calculatePaymentVat({
      amount: 3000,
      balanceBefore: 10500,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: 0,
      treatment: 'exclusive',
      rate: 5.0,
    });
    expect(p1.vatAmount).toBe(142.86);
    expect(p1.isReconciled).toBe(false);

    const p2 = calculatePaymentVat({
      amount: 3000,
      balanceBefore: 7500,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: p1.vatAmount,
      treatment: 'exclusive',
      rate: 5.0,
    });
    expect(p2.vatAmount).toBe(142.86);
    expect(p2.isReconciled).toBe(false);

    const p3 = calculatePaymentVat({
      amount: 4500,
      balanceBefore: 4500,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: p1.vatAmount + p2.vatAmount,
      treatment: 'exclusive',
      rate: 5.0,
    });
    expect(p3.vatAmount).toBe(214.28); // Reconciled from 214.29 to 214.28
    expect(p3.isReconciled).toBe(true);

    const totalVatCollected = roundToTwoDecimals(p1.vatAmount + p2.vatAmount + p3.vatAmount);
    expect(totalVatCollected).toBe(500.0);
  });

  // Case 7: Opening paid case sums exactly
  it('Case 7: Opening paid 2,500 + two payments of 4,000 on exclusive 10,000 sum exactly to 500.00', () => {
    const breakdown = calculateVatBreakdown(10000, 0, 'exclusive', 5.0); // totalPayable: 10500, vatTotal: 500
    const openingPaid = 2500;
    const openingVat = roundToTwoDecimals((openingPaid * 5) / 105); // 119.05
    const balance0 = 10500 - openingPaid; // 8000

    const p1 = calculatePaymentVat({
      amount: 4000,
      balanceBefore: balance0,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: 0,
      openingPaid,
      treatment: 'exclusive',
      rate: 5.0,
    });
    expect(p1.vatAmount).toBe(190.48);

    const p2 = calculatePaymentVat({
      amount: 4000,
      balanceBefore: 4000,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: p1.vatAmount,
      openingPaid,
      treatment: 'exclusive',
      rate: 5.0,
    });
    expect(p2.vatAmount).toBe(190.47); // 500 - 119.05 - 190.48 = 190.47
    expect(p2.isReconciled).toBe(true);

    const sumAll = roundToTwoDecimals(openingVat + p1.vatAmount + p2.vatAmount);
    expect(sumAll).toBe(500.0);
  });

  // Case 8: Odd cents test 1 - Exclusive 3,333.33 at 5%
  it('Case 8: Odd cents exclusive 3,333.33 at 5%', () => {
    const res = calculateVatBreakdown(3333.33, 0, 'exclusive', 5.0);
    expect(res.netFee).toBe(3333.33);
    expect(res.vatTotal).toBe(166.67);
    expect(res.totalPayable).toBe(3500.0);
  });

  // Case 9: Odd cents test 2 - Inclusive 3,333.33 at 5%
  it('Case 9: Odd cents inclusive 3,333.33 at 5%', () => {
    const res = calculateVatBreakdown(3333.33, 0, 'inclusive', 5.0);
    expect(res.vatTotal).toBe(158.73);
    expect(res.taxable).toBe(3174.6);
    expect(res.totalPayable).toBe(3333.33);
  });

  // Case 10: Odd cents test 3 - Exclusive 1,234.56 at 5%
  it('Case 10: Odd cents exclusive 1,234.56 at 5%', () => {
    const res = calculateVatBreakdown(1234.56, 0, 'exclusive', 5.0);
    expect(res.vatTotal).toBe(61.73);
    expect(res.totalPayable).toBe(1296.29);
  });

  // Case 11: Odd cents test 4 - Inclusive 1,234.56 at 5%
  it('Case 11: Odd cents inclusive 1,234.56 at 5%', () => {
    const res = calculateVatBreakdown(1234.56, 0, 'inclusive', 5.0);
    expect(res.vatTotal).toBe(58.79);
    expect(res.taxable).toBe(1175.77);
    expect(res.totalPayable).toBe(1234.56);
  });

  // Case 12: Zero fee handles safely
  it('Case 12: Zero fee produces all zeros', () => {
    const res = calculateVatBreakdown(0, 0, 'exclusive', 5.0);
    expect(res.netFee).toBe(0);
    expect(res.vatTotal).toBe(0);
    expect(res.totalPayable).toBe(0);
  });

  // Case 13: 100% discount produces zero net fee and zero vat
  it('Case 13: 100% discount produces zero payable and zero vat', () => {
    const res = calculateVatBreakdown(5000, 5000, 'exclusive', 5.0);
    expect(res.netFee).toBe(0);
    expect(res.vatTotal).toBe(0);
    expect(res.totalPayable).toBe(0);
  });

  // Case 14: No VAT treatment with odd cents
  it('Case 14: Treatment none with 7,500.25 keeps exact amount and 0 VAT', () => {
    const res = calculateVatBreakdown(7500.25, 0, 'none', 5.0);
    expect(res.vatTotal).toBe(0);
    expect(res.taxable).toBe(7500.25);
    expect(res.totalPayable).toBe(7500.25);
  });

  // Case 15: Two equal payments on inclusive 1,000 (vat 47.62)
  it('Case 15: Two payments on inclusive 1,000 reconcile exactly to 47.62', () => {
    const breakdown = calculateVatBreakdown(1000, 0, 'inclusive', 5.0);
    expect(breakdown.vatTotal).toBe(47.62);

    const p1 = calculatePaymentVat({
      amount: 500,
      balanceBefore: 1000,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: 0,
      treatment: 'inclusive',
    });
    expect(p1.vatAmount).toBe(23.81);

    const p2 = calculatePaymentVat({
      amount: 500,
      balanceBefore: 500,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: p1.vatAmount,
      treatment: 'inclusive',
    });
    expect(p2.vatAmount).toBe(23.81);
    expect(roundToTwoDecimals(p1.vatAmount + p2.vatAmount)).toBe(47.62);
  });

  // Case 16: Three fractional payments on inclusive 1,000 (333.33 + 333.33 + 333.34)
  it('Case 16: Three fractional payments on inclusive 1,000 reconcile exactly to 47.62', () => {
    const breakdown = calculateVatBreakdown(1000, 0, 'inclusive', 5.0);
    const p1 = calculatePaymentVat({
      amount: 333.33,
      balanceBefore: 1000,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: 0,
      treatment: 'inclusive',
    });
    expect(p1.vatAmount).toBe(15.87);

    const p2 = calculatePaymentVat({
      amount: 333.33,
      balanceBefore: 666.67,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: p1.vatAmount,
      treatment: 'inclusive',
    });
    expect(p2.vatAmount).toBe(15.87);

    const p3 = calculatePaymentVat({
      amount: 333.34,
      balanceBefore: 333.34,
      enrollmentVatTotal: breakdown.vatTotal,
      priorValidVatSum: p1.vatAmount + p2.vatAmount,
      treatment: 'inclusive',
    });
    expect(p3.vatAmount).toBe(15.88); // 47.62 - 15.87 - 15.87 = 15.88
    expect(roundToTwoDecimals(p1.vatAmount + p2.vatAmount + p3.vatAmount)).toBe(47.62);
  });

  // Case 17: Single lump sum payment on exclusive 15,000
  it('Case 17: Single lump sum on exclusive 15,000', () => {
    const breakdown = calculateVatBreakdown(15000, 0, 'exclusive', 5.0);
    expect(breakdown.totalPayable).toBe(15750.0);
    expect(breakdown.vatTotal).toBe(750.0);

    const payment = calculatePaymentVat({
      amount: 15750,
      balanceBefore: 15750,
      enrollmentVatTotal: breakdown.vatTotal,
      treatment: 'exclusive',
    });
    expect(payment.vatAmount).toBe(750.0);
    expect(payment.taxableAmount).toBe(15000.0);
  });

  // Case 18: Single lump sum payment on inclusive 15,000
  it('Case 18: Single lump sum on inclusive 15,000', () => {
    const breakdown = calculateVatBreakdown(15000, 0, 'inclusive', 5.0);
    expect(breakdown.totalPayable).toBe(15000.0);
    expect(breakdown.vatTotal).toBe(714.29);

    const payment = calculatePaymentVat({
      amount: 15000,
      balanceBefore: 15000,
      enrollmentVatTotal: breakdown.vatTotal,
      treatment: 'inclusive',
    });
    expect(payment.vatAmount).toBe(714.29);
    expect(payment.taxableAmount).toBe(14285.71);
  });

  // Case 19: Payment on treatment none produces 0 VAT and 100% taxable
  it('Case 19: Payment on treatment none produces 0 VAT and 100% taxable', () => {
    const payment = calculatePaymentVat({
      amount: 5000,
      balanceBefore: 5000,
      enrollmentVatTotal: 0,
      treatment: 'none',
    });
    expect(payment.vatAmount).toBe(0.0);
    expect(payment.taxableAmount).toBe(5000.0);
  });

  // Case 20: 7 installment payments on exclusive 7,777.77 (payable 8,166.66, vat 388.89)
  it('Case 20: Seven odd installment payments reconcile exactly to 388.89', () => {
    const breakdown = calculateVatBreakdown(7777.77, 0, 'exclusive', 5.0);
    expect(breakdown.vatTotal).toBe(388.89);
    expect(breakdown.totalPayable).toBe(8166.66);

    const amounts = [1000, 1000, 1500, 1500, 1000, 1000, 1166.66];
    let balance = 8166.66;
    let priorVat = 0;
    const vatAmounts: number[] = [];

    for (const amt of amounts) {
      const p = calculatePaymentVat({
        amount: amt,
        balanceBefore: balance,
        enrollmentVatTotal: breakdown.vatTotal,
        priorValidVatSum: priorVat,
        treatment: 'exclusive',
      });
      vatAmounts.push(p.vatAmount);
      priorVat = roundToTwoDecimals(priorVat + p.vatAmount);
      balance = roundToTwoDecimals(balance - amt);
    }

    expect(balance).toBe(0.0);
    expect(priorVat).toBe(388.89);
  });

  it('Helper labels return correct strings', () => {
    expect(getVatTreatmentLabel('exclusive')).toBe('+ VAT on top');
    expect(getVatTreatmentLabel('inclusive')).toBe('Includes VAT');
    expect(getVatTreatmentLabel('none')).toBe('No VAT');
    expect(getNoVatReasonLabel('zero_rated')).toBe('Zero-rated (0%)');
    expect(getNoVatReasonLabel('exempt')).toBe('Exempt from VAT');
    expect(getNoVatReasonLabel('out_of_scope')).toBe('Out of scope');
  });
});
