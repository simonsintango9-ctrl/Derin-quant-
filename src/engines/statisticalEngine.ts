import {
  DigitMetric,
  MarketSymbol,
  RepeatingPatternReport,
  StatisticalAnalysisResult,
  TickRecord,
  WindowComparison,
} from '../types/deriv';

const UNIFORM_PROB = 0.1;

function computeDigitDistribution(digits: number[]): number[] {
  const counts = new Array<number>(10).fill(0);
  for (const d of digits) {
    if (d >= 0 && d <= 9) counts[d]++;
  }
  const n = digits.length || 1;
  return counts.map((c) => (c / n) * 100);
}

export function compareWindows(
  allDigits: number[],
  shortWindow: number,
  longWindow: number
): WindowComparison | null {
  if (allDigits.length < Math.min(shortWindow, 20)) {
    return null;
  }

  const shortSlice = allDigits.slice(-shortWindow);
  const longSlice = allDigits.slice(-Math.min(longWindow, allDigits.length));

  const shortPcts = computeDigitDistribution(shortSlice);
  const longPcts = computeDigitDistribution(longSlice);

  const digitDeltas = Array.from({ length: 10 }, (_, digit) => ({
    digit,
    shortPct: shortPcts[digit],
    longPct: longPcts[digit],
    deltaPct: shortPcts[digit] - longPcts[digit],
  }));

  // Total Variation Distance: 0.5 * sum(|p_i - q_i|) where p_i, q_i in [0,1]
  const tvd =
    0.5 *
    digitDeltas.reduce((acc, row) => acc + Math.abs(row.shortPct - row.longPct) / 100, 0);

  const stabilityIndex = Math.max(0, Math.min(100, (1 - tvd * 2.5) * 100));

  return {
    shortWindow: shortSlice.length,
    longWindow: longSlice.length,
    digitDeltas,
    totalVariationDistance: tvd,
    stabilityIndex,
  };
}

function analyzePatterns(digits: number[]): RepeatingPatternReport {
  if (digits.length === 0) {
    return {
      currentStreakDigit: null,
      currentStreakLength: 0,
      longestConsecutiveDigit: null,
      longestConsecutiveLength: 0,
      consecutiveRepeatRate: 0,
      topBigrams: [],
      topTrigrams: [],
      shortTermShiftScore: 0,
    };
  }

  // Current streak from the end
  const last = digits[digits.length - 1];
  let currentStreakLength = 1;
  for (let i = digits.length - 2; i >= 0; i--) {
    if (digits[i] === last) currentStreakLength++;
    else break;
  }

  // Longest streak & consecutive repeat rate
  let longestDigit = digits[0];
  let longestLen = 1;
  let runDigit = digits[0];
  let runLen = 1;
  let consecutiveRepeats = 0;

  for (let i = 1; i < digits.length; i++) {
    if (digits[i] === digits[i - 1]) {
      consecutiveRepeats++;
      runLen++;
      if (runLen > longestLen) {
        longestLen = runLen;
        longestDigit = runDigit;
      }
    } else {
      runDigit = digits[i];
      runLen = 1;
    }
  }

  const consecutiveRepeatRate =
    digits.length > 1 ? (consecutiveRepeats / (digits.length - 1)) * 100 : 0;

  // Bigrams & Trigrams
  const bigramCounts = new Map<string, number>();
  const trigramCounts = new Map<string, number>();

  for (let i = 0; i < digits.length - 1; i++) {
    const bg = `${digits[i]}→${digits[i + 1]}`;
    bigramCounts.set(bg, (bigramCounts.get(bg) || 0) + 1);
  }

  for (let i = 0; i < digits.length - 2; i++) {
    const tg = `${digits[i]}→${digits[i + 1]}→${digits[i + 2]}`;
    trigramCounts.set(tg, (trigramCounts.get(tg) || 0) + 1);
  }

  const totalBigrams = Math.max(1, digits.length - 1);
  const totalTrigrams = Math.max(1, digits.length - 2);

  const topBigrams = Array.from(bigramCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sequence, count]) => ({
      sequence,
      count,
      percentage: (count / totalBigrams) * 100,
    }));

  const topTrigrams = Array.from(trigramCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sequence, count]) => ({
      sequence,
      count,
      percentage: (count / totalTrigrams) * 100,
    }));

  // Short-term shift: TVD between last 25 ticks and prior window
  let shortTermShiftScore = 0;
  if (digits.length >= 50) {
    const recent25 = computeDigitDistribution(digits.slice(-25));
    const prior = computeDigitDistribution(digits.slice(0, -25));
    shortTermShiftScore =
      0.5 *
      recent25.reduce((sum, p, idx) => sum + Math.abs(p - prior[idx]) / 100, 0);
  }

  return {
    currentStreakDigit: last,
    currentStreakLength,
    longestConsecutiveDigit: longestDigit,
    longestConsecutiveLength: longestLen,
    consecutiveRepeatRate,
    topBigrams,
    topTrigrams,
    shortTermShiftScore,
  };
}

export function runStatisticalAnalysis(
  symbol: MarketSymbol,
  allTicks: TickRecord[],
  windowSize: number
): StatisticalAnalysisResult {
  const allDigits = allTicks.map((t) => t.lastDigit);
  const effectiveWindow = Math.max(1, Math.min(windowSize, allDigits.length));
  const windowDigits = allDigits.slice(-effectiveWindow);
  const n = windowDigits.length;

  const counts = new Array<number>(10).fill(0);
  for (const d of windowDigits) {
    counts[d]++;
  }

  // Momentum: compare second half (most recent) vs first half (prior) of window
  const splitIdx = Math.floor(n / 2);
  const priorHalf = windowDigits.slice(0, splitIdx);
  const recentHalf = windowDigits.slice(splitIdx);
  const priorPcts = computeDigitDistribution(priorHalf);
  const recentPcts = computeDigitDistribution(recentHalf);

  // Overdue & Max Gap calculated on full available history for accuracy
  const ticksSinceLast = new Array<number>(10).fill(allDigits.length);
  const maxHistoricalGap = new Array<number>(10).fill(0);

  for (let digit = 0; digit <= 9; digit++) {
    let lastSeenIndex = -1;
    let maxGap = 0;

    for (let i = 0; i < allDigits.length; i++) {
      if (allDigits[i] === digit) {
        const gap = lastSeenIndex === -1 ? i : i - lastSeenIndex - 1;
        if (gap > maxGap) maxGap = gap;
        lastSeenIndex = i;
      }
    }

    if (lastSeenIndex === -1) {
      ticksSinceLast[digit] = allDigits.length;
      maxHistoricalGap[digit] = allDigits.length;
    } else {
      const currentAbsence = allDigits.length - 1 - lastSeenIndex;
      ticksSinceLast[digit] = currentAbsence;
      maxHistoricalGap[digit] = Math.max(maxGap, currentAbsence);
    }
  }

  // Standard error under uniform null p = 0.10
  const se = n > 0 ? Math.sqrt((UNIFORM_PROB * (1 - UNIFORM_PROB)) / n) : 0;

  const metrics: DigitMetric[] = Array.from({ length: 10 }, (_, digit) => {
    const count = counts[digit];
    const frequency = n > 0 ? count / n : 0;
    const percentage = frequency * 100;
    const deviationFromUniform = percentage - 10;
    const zScore = se > 0 ? (frequency - UNIFORM_PROB) / se : 0;
    const momentumDelta = n >= 10 ? recentPcts[digit] - priorPcts[digit] : 0;

    return {
      digit,
      count,
      frequency,
      percentage,
      deviationFromUniform,
      ticksSinceLast: ticksSinceLast[digit],
      maxHistoricalGap: maxHistoricalGap[digit],
      momentumDelta,
      isHot: false,
      isCold: false,
      zScore,
    };
  });

  // Sort copy by count/percentage to identify top 2 Hot and bottom 2 Cold (only if n >= 20)
  if (n >= 20) {
    const ranked = [...metrics].sort((a, b) => b.percentage - a.percentage || b.zScore - a.zScore);
    const hotSet = new Set(ranked.slice(0, 2).map((m) => m.digit));
    const coldSet = new Set(ranked.slice(-2).map((m) => m.digit));
    for (const m of metrics) {
      m.isHot = hotSet.has(m.digit);
      m.isCold = coldSet.has(m.digit);
    }
  }

  const hotDigits = [...metrics].sort((a, b) => b.percentage - a.percentage).slice(0, 3);
  const coldDigits = [...metrics].sort((a, b) => a.percentage - b.percentage).slice(0, 3);
  const mostOverdueDigit =
    allDigits.length > 0
      ? [...metrics].sort((a, b) => b.ticksSinceLast - a.ticksSinceLast)[0]
      : null;

  // Shannon Entropy
  let shannonEntropy = 0;
  if (n > 0) {
    for (const m of metrics) {
      if (m.frequency > 0) {
        shannonEntropy -= m.frequency * Math.log2(m.frequency);
      }
    }
  }
  const maxEntropy = Math.log2(10); // ~3.321928 bits

  // Digit frequency standard deviation around 10% uniform baseline (percentage points)
  const frequencyStdDev =
    n > 0
      ? Math.sqrt(
          metrics.reduce((sum, m) => sum + Math.pow(m.percentage - 10, 2), 0) / metrics.length
        )
      : 0;

  // Price standard deviation & tick-to-tick return volatility across the active window
  const windowQuotes = allTicks.slice(-effectiveWindow).map((t) => t.quote);
  let quoteStdDev = 0;
  let tickVolatility = 0;

  if (windowQuotes.length > 1) {
    const quoteMean = windowQuotes.reduce((s, q) => s + q, 0) / windowQuotes.length;
    const quoteVariance =
      windowQuotes.reduce((s, q) => s + Math.pow(q - quoteMean, 2), 0) /
      (windowQuotes.length - 1);
    quoteStdDev = Math.sqrt(Math.max(0, quoteVariance));

    const pctReturns: number[] = [];
    for (let i = 1; i < windowQuotes.length; i++) {
      const prev = windowQuotes[i - 1];
      if (prev > 0) {
        pctReturns.push(((windowQuotes[i] - prev) / prev) * 100);
      }
    }
    if (pctReturns.length > 1) {
      const retMean = pctReturns.reduce((s, r) => s + r, 0) / pctReturns.length;
      const retVar =
        pctReturns.reduce((s, r) => s + Math.pow(r - retMean, 2), 0) / (pctReturns.length - 1);
      tickVolatility = Math.sqrt(Math.max(0, retVar));
    } else if (pctReturns.length === 1) {
      tickVolatility = Math.abs(pctReturns[0]);
    }
  }

  return {
    symbol,
    windowSize: n,
    totalAvailableTicks: allTicks.length,
    digits: metrics,
    hotDigits,
    coldDigits,
    mostOverdueDigit,
    patterns: analyzePatterns(windowDigits),
    comparison50v200: compareWindows(allDigits, 50, 200),
    shannonEntropy,
    normalizedEntropy: maxEntropy > 0 ? shannonEntropy / maxEntropy : 0,
    frequencyStdDev,
    quoteStdDev,
    tickVolatility,
  };
}
