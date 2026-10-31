/** Planning arithmetic, never a claim about measured shop performance. USD. */
export interface ProfitInputs {
  revenuePerOrder: number;
  production: number;
  shipping: number;
  feePercent: number;
  fixedFee: number;
  ads: number;
  returns: number;
  labor: number;
  overhead: number;
}
export function profitPlan(input: ProfitInputs, monthlyTarget: number) {
  if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0 || Object.values(input).some((v) => !Number.isFinite(v) || v < 0) || input.feePercent > 100) return null;
  const contribution = Math.round((input.revenuePerOrder * (1 - input.feePercent / 100) - input.production - input.shipping - input.fixedFee - input.ads - input.returns - input.labor) * 100) / 100;
  if (contribution <= 0) return { contribution, orders: null, revenue: null };
  const orders = Math.ceil((monthlyTarget + input.overhead) / contribution);
  return { contribution, orders, revenue: Math.round(orders * input.revenuePerOrder * 100) / 100 };
}
