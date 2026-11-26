import { MarketSymbol, TickRecord } from '../types/deriv';

/**
 * Converts a Deriv pip_size (e.g. 0.01, 0.001, 0.0001, 1e-4, 1) into
 * the exact number of decimal places required to preserve trailing zeros.
 */
export function pipSizeToDecimals(pipSize: number): number {
  if (!Number.isFinite(pipSize) || pipSize <= 0) {
    return 2;
  }
  if (pipSize >= 1) {
    return 0;
  }
  // Convert safely to decimal string without scientific notation
  const fixedStr = pipSize.toFixed(12).replace(/0+$/, '');
  const dotIndex = fixedStr.indexOf('.');
  if (dotIndex === -1) {
    return 0;
  }
  return fixedStr.length - dotIndex - 1;
}

/**
 * Formats a numeric quote to the exact number of decimal places mandated by pip_size,
 * preserving trailing zeros (e.g., 5432.5 with pip_size 0.01 -> "5432.50").
 */
export function formatQuoteWithPrecision(quote: number, decimals: number): string {
  if (!Number.isFinite(quote)) {
    return '0';
  }
  const safeDecimals = Math.max(0, Math.min(10, Math.trunc(decimals)));
  return quote.toFixed(safeDecimals);
}

/**
 * Extracts the final decimal digit (0-9) reliably using integer scaling
 * based on exact pip_size decimals, eliminating float truncation bugs on trailing zeros.
 *
 * Examples with pipSize = 0.01 (decimals = 2):
 *   1234.56 -> 6
 *   9876.21 -> 1
 *   5432.50 -> 0
 *   7654.89 -> 9
 */
export function extractLastDigit(quote: number, pipSize: number): {
  lastDigit: number;
  decimals: number;
  formattedQuote: string;
} {
  if (!Number.isFinite(quote)) {
    throw new Error(`Invalid quote value: ${String(quote)}`);
  }

  const decimals = pipSizeToDecimals(pipSize);
  const formattedQuote = formatQuoteWithPrecision(quote, decimals);

  // Integer scaling using Math.round on normalized decimal string avoids IEEE-754 drift
  const scaleFactor = Math.pow(10, decimals);
  const scaledInteger = Math.round(Math.abs(quote) * scaleFactor);
  const lastDigit = scaledInteger % 10;

  // Cross-verify against formattedQuote last character
  const charDigit = Number(formattedQuote.charAt(formattedQuote.length - 1));
  const verifiedDigit = Number.isInteger(charDigit) && charDigit >= 0 && charDigit <= 9 ? charDigit : lastDigit;

  return {
    lastDigit: verifiedDigit,
    decimals,
    formattedQuote,
  };
}

export interface RawDerivTick {
  symbol?: string;
  quote?: number | string;
  epoch?: number | string;
  pip_size?: number | string;
  id?: string;
}

/**
 * Validates and transforms an incoming Deriv tick message into a normalized TickRecord.
 */
export function normalizeDerivTick(
  raw: RawDerivTick,
  fallbackSymbol: MarketSymbol,
  fallbackPipSize: number
): TickRecord | null {
  if (!raw || raw.quote === undefined || raw.epoch === undefined) {
    return null;
  }

  const symbol = (raw.symbol || fallbackSymbol) as MarketSymbol;
  const quote = typeof raw.quote === 'string' ? Number(raw.quote) : raw.quote;
  const epoch = typeof raw.epoch === 'string' ? Number(raw.epoch) : raw.epoch;
  const pipSizeRaw = raw.pip_size !== undefined ? Number(raw.pip_size) : fallbackPipSize;
  const pipSize = Number.isFinite(pipSizeRaw) && pipSizeRaw > 0 ? pipSizeRaw : fallbackPipSize;

  if (!Number.isFinite(quote) || !Number.isFinite(epoch) || epoch <= 0) {
    return null;
  }

  const { lastDigit, decimals, formattedQuote } = extractLastDigit(quote, pipSize);

  return {
    symbol,
    epoch: Math.trunc(epoch),
    receivedAt: Date.now(),
    quote,
    formattedQuote,
    pipSize,
    decimals,
    lastDigit,
    subscriptionId: raw.id,
  };
}
