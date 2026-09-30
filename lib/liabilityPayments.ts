export interface PaymentBreakdown {
  principal: number;
  interest: number;
  total: number;
}

export function calculateEqualPaymentBreakdown(
  principal: number,
  annualRate: number,
  months: number
): PaymentBreakdown {
  const monthlyRate = annualRate / 100 / 12;
  const payment = monthlyRate === 0
    ? principal / months
    : principal * (monthlyRate * Math.pow(1 + monthlyRate, months))
      / (Math.pow(1 + monthlyRate, months) - 1);
  const interest = principal * monthlyRate;
  const roundedPrincipal = Math.round(payment - interest);
  const roundedTotal = Math.round(payment);

  return {
    principal: roundedPrincipal,
    interest: roundedTotal - roundedPrincipal,
    total: roundedTotal,
  };
}

export function calculateCurrentPaymentBreakdown(
  currentBalance: number,
  annualRate: number,
  monthlyPayment: number
): PaymentBreakdown {
  const monthlyRate = annualRate / 100 / 12;
  const principal = monthlyRate === 0
    ? monthlyPayment
    : (monthlyPayment - currentBalance * monthlyRate) / (1 + monthlyRate);
  const roundedPrincipal = Math.round(principal);
  const roundedTotal = Math.round(monthlyPayment);

  return {
    principal: roundedPrincipal,
    interest: roundedTotal - roundedPrincipal,
    total: roundedTotal,
  };
}
