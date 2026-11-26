import { MARKET_MAP, SUPPORTED_MARKETS } from '../constants/markets';
import { MarketSymbol, ScannerMarketSummary, TickRecord } from '../types/deriv';
import { chiSquarePValue } from './probabilityEngine';
import { runStatisticalAnalysis } from './statisticalEngine';

export function evaluateScannerMarket(
  symbol: MarketSymbol,
  ticks: TickRecord[],
  windowSize = 100,
  status: ScannerMarketSummary['status'] = 'ready',
  errorMessage?: string
): ScannerMarketSummary {
  const def = MARKET_MAP[symbol];
  const latest = ticks.length > 0 ? ticks[ticks.length - 1] : null;

  if (ticks.length < 10) {
    return {
      symbol,
      name: def.name,
      category: def.category,
      latestQuote: latest?.formattedQuote ?? null,
      latestDigit: latest?.lastDigit ?? null,
      lastUpdatedEpoch: latest?.epoch ?? null,
      sampleCount: ticks.length,
      chiSquareStatistic: 0,
      chiSquarePValue: 1,
      maxDeviationPct: 0,
      topHotDigit: null,
      topHotPct: null,
      topColdDigit: null,
      topColdPct: null,
      dispersionScore: 0,
      anomalyDetected: false,
      status: ticks.length === 0 && status === 'ready' ? 'idle' : status,
      errorMessage,
    };
  }

  const stats = runStatisticalAnalysis(symbol, ticks, Math.min(windowSize, ticks.length));
  const n = stats.windowSize;
  const expected = n * 0.1;

  let chiSquare = 0;
  let maxDev = 0;
  for (const d of stats.digits) {
    const diff = d.count - expected;
    chiSquare += (diff * diff) / expected;
    const absDev = Math.abs(d.deviationFromUniform);
    if (absDev > maxDev) maxDev = absDev;
  }

  const pVal = chiSquarePValue(chiSquare, 9);
  const topHot = stats.hotDigits[0] || null;
  const topCold = stats.coldDigits[0] || null;
  const anomalyDetected = n >= 50 && pVal < 0.05;

  // Dispersion index (0-100 scale) strictly measuring historical distribution divergence from uniform
  const dispersionScore = Math.min(100, (chiSquare / 25) * 100);

  return {
    symbol,
    name: def.name,
    category: def.category,
    latestQuote: latest?.formattedQuote ?? null,
    latestDigit: latest?.lastDigit ?? null,
    lastUpdatedEpoch: latest?.epoch ?? null,
    sampleCount: ticks.length,
    chiSquareStatistic: chiSquare,
    chiSquarePValue: pVal,
    maxDeviationPct: maxDev,
    topHotDigit: topHot?.digit ?? null,
    topHotPct: topHot?.percentage ?? null,
    topColdDigit: topCold?.digit ?? null,
    topColdPct: topCold?.percentage ?? null,
    dispersionScore,
    anomalyDetected,
    status,
    errorMessage,
  };
}

export function buildInitialScannerSummaries(): ScannerMarketSummary[] {
  return SUPPORTED_MARKETS.map((m) =>
    evaluateScannerMarket(m.symbol, [], 100, 'idle')
  );
}
