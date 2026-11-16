const CURRENCY_OF_SYMBOL = { $: "USD", "€": "EUR", "£": "GBP", "¥": "CNY" };
const MONEY_PATTERN = /^\s*(-?)\s*([$€£¥]?)\s*(-?[\d,]+(?:\.\d+)?)\s*([A-Z]{3})?\s*$/;

export function parseMoney(text) {
  const match = MONEY_PATTERN.exec(String(text ?? ""));
  if (!match) return null;
  const [, sign, symbol, digits, code] = match;
  const currency = code ?? CURRENCY_OF_SYMBOL[symbol];
  if (!currency) return null;
  const amount = Number(digits.replace(/,/g, ""));
  return { amount: sign ? -amount : amount, currency };
}
