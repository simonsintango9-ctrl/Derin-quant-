import { MarketSymbol, TickRecord } from '../types/deriv';

/**
 * Normalizes Deriv's pip representation into both float pipSize (e.g. 0.01)
 * and exact integer decimal places (e.g. 2).
 *
 * Handles both Deriv API conventions:
 * - active_symbols returns `pip` / `pip_size` as a float step (e.g. 0.01, 0.001, 0.0001)
 * - ticks_history & tick streams return `pip_size` as an integer decimal count (e.g. 2, 3, 4)
 */
export function resolvePipPrecision(pipOrDecimals: number): {
  pipSize: number;
  decimals: number;
} {
  if (!Number.isFinite(pipOrDecimals) || pipOrDecimals <= 0) {
    return { pipSize: 0.01, decimals: 2 };
  }

  // Integer >= 1 represents decimal count from Deriv ticks / ticks_history (e.g. 2 -> 0.01)
  if (Number.isInteger(pipOrDecimals) && pipOrDecimals >= 1 && pipOrDecimals <= 10) {
    const decimals = pipOrDecimals;
    return {
      decimals,
      pipSize: Number(Math.pow(10, -decimals).toFixed(decimals)),
    };
  }

  // Float < 1 represents pip step size from active_symbols (e.g. 0.01 -> 2 decimals)
  if (pipOrDecimals < 1) {
    const fixedStr = pipOrDecimals.toFixed(12).replace(/0+$/, '');
    const dotIndex = fixedStr.indexOf('.');
    const decimals = dotIndex === -1 ? 0 : fixedStr.length - dotIndex - 1;
    return {
      decimals,
      pipSize: pipOrDecimals,
    };
  }

  return { pipSize: 1, decimals: 0 };
}

/**
 * Converts a Deriv pip_size (float step like 0.01 OR integer decimal count like 2)
 * into the exact number of decimal places required to preserve trailing zeros.
 */
export function pipSizeToDecimals(pipSize: number): number {
  return resolvePipPrecision(pipSize).decimals;
}

/**
 * Formats a numeric quote to the exact number of decimal places mandated by pip_size,
 * preserving trailing zeros (e.g., 5432.5 with pip_size 0.01 or 2 -> "5432.50").
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
 * Examples with pipSize = 0.01 or 2 (decimals = 2):
 *   1234.56 -> 6
 *   9876.21 -> 1
 *   5432.50 -> 0
 *   7654.89 -> 9
 */
export function extractLastDigit(quote: number, pipSize: number): {
  lastDigit: number;
  decimals: number;
  pipSize: number;
  formattedQuote: string;
} {
  if (!Number.isFinite(quote)) {
    throw new Error(`Invalid quote value: ${String(quote)}`);
  }

  const resolved = resolvePipPrecision(pipSize);
  const formattedQuote = formatQuoteWithPrecision(quote, resolved.decimals);

  const scaleFactor = Math.pow(10, resolved.decimals);
  const scaledInteger = Math.round(Math.abs(quote) * scaleFactor);
  const lastDigit = scaledInteger % 10;

  // Cross-verify against formattedQuote last character
  const charDigit = Number(formattedQuote.charAt(formattedQuote.length - 1));
  const verifiedDigit =
    Number.isInteger(charDigit) && charDigit >= 0 && charDigit <= 9 ? charDigit : lastDigit;

  return {
    lastDigit: verifiedDigit,
    decimals: resolved.decimals,
    pipSize: resolved.pipSize,
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
  const pipRaw = raw.pip_size !== undefined ? Number(raw.pip_size) : fallbackPipSize;
  const resolved = resolvePipPrecision(
    Number.isFinite(pipRaw) && pipRaw > 0 ? pipRaw : fallbackPipSize
  );

  if (!Number.isFinite(quote) || !Number.isFinite(epoch) || epoch <= 0) {
    return null;
  }

  const extracted = extractLastDigit(quote, resolved.pipSize);

  return {
    symbol,
    epoch: Math.trunc(epoch),
    receivedAt: Date.now(),
    quote,
    formattedQuote: extracted.formattedQuote,
    pipSize: extracted.pipSize,
    decimals: extracted.decimals,
    lastDigit: extracted.lastDigit,
    subscriptionId: raw.id,
  };
}
