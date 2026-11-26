import {
  PerformanceBreakdownItem,
  PerformanceSummary,
  QuantSignal,
  SignalRecord,
  TickRecord,
} from '../types/deriv';

export function createPendingSignalRecord(signal: QuantSignal): SignalRecord {
  return {
    id: signal.id,
    symbol: signal.symbol,
    category: signal.category,
    targetDigit: signal.targetDigit,
    estimatedProbability: signal.estimatedProbability,
    historicalFrequency: signal.historicalFrequency,
    sampleSize: signal.sampleSize,
    windowUsed: signal.windowUsed,
    reliabilityTier: signal.statisticalReliability,
    modelUsed: signal.modelName,
    generatedAt: signal.generatedAt,
    anchorTickEpoch: signal.anchorTickEpoch,
    evaluatedAt: null,
    observedTickEpoch: null,
    actualNextDigit: null,
    outcome: 'PENDING',
  };
}

/**
 * Evaluates pending signals strictly out-of-sample using the first live tick
 * observed strictly AFTER the signal's anchorTickEpoch.
 */
export function evaluatePendingSignalsWithTick(
  records: SignalRecord[],
  incomingTick: TickRecord
): { updatedRecords: SignalRecord[]; newlyEvaluated: SignalRecord[] } {
  const newlyEvaluated: SignalRecord[] = [];
  let changed = false;

  const updatedRecords = records.map((rec) => {
    if (
      rec.outcome === 'PENDING' &&
      rec.symbol === incomingTick.symbol &&
      incomingTick.epoch > rec.anchorTickEpoch
    ) {
      changed = true;
      let isCorrect = false;
      if (rec.category === 'MATCHES') {
        isCorrect = incomingTick.lastDigit === rec.targetDigit;
      } else if (rec.category === 'DIFFERS') {
        isCorrect = incomingTick.lastDigit !== rec.targetDigit;
      } else if (rec.category === 'EVEN') {
        isCorrect = incomingTick.lastDigit % 2 === 0;
      } else if (rec.category === 'ODD') {
        isCorrect = incomingTick.lastDigit % 2 === 1;
      }

      const updated: SignalRecord = {
        ...rec,
        evaluatedAt: Date.now(),
        observedTickEpoch: incomingTick.epoch,
        actualNextDigit: incomingTick.lastDigit,
        outcome: isCorrect ? 'CORRECT' : 'INCORRECT',
      };
      newlyEvaluated.push(updated);
      return updated;
    }
    return rec;
  });

  return {
    updatedRecords: changed ? updatedRecords : records,
    newlyEvaluated,
  };
}

function groupBreakdown(
  evaluated: SignalRecord[],
  keyFn: (r: SignalRecord) => string
): PerformanceBreakdownItem[] {
  const map = new Map<string, { total: number; correct: number; incorrect: number }>();

  for (const r of evaluated) {
    const k = keyFn(r);
    const cur = map.get(k) || { total: 0, correct: 0, incorrect: 0 };
    cur.total++;
    if (r.outcome === 'CORRECT') cur.correct++;
    else if (r.outcome === 'INCORRECT') cur.incorrect++;
    map.set(k, cur);
  }

  return Array.from(map.entries())
    .map(([label, stats]) => ({
      label,
      total: stats.total,
      correct: stats.correct,
      incorrect: stats.incorrect,
      accuracyPct: stats.total > 0 ? (stats.correct / stats.total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

export function computePerformanceSummary(records: SignalRecord[]): PerformanceSummary {
  const evaluated = records.filter((r) => r.outcome === 'CORRECT' || r.outcome === 'INCORRECT');
  const pending = records.filter((r) => r.outcome === 'PENDING');
  const correctCount = evaluated.filter((r) => r.outcome === 'CORRECT').length;
  const incorrectCount = evaluated.length - correctCount;
  const accuracyPct = evaluated.length > 0 ? (correctCount / evaluated.length) * 100 : 0;

  const byCategory = groupBreakdown(evaluated, (r) => r.category);
  const byMarket = groupBreakdown(evaluated, (r) => r.symbol);
  const byWindow = groupBreakdown(evaluated, (r) => `${r.windowUsed} ticks`);

  const now = Date.now();
  const periods: Array<{ label: string; cutoff: number }> = [
    { label: 'Last 15 min', cutoff: now - 15 * 60 * 1000 },
    { label: 'Last 1 hour', cutoff: now - 60 * 60 * 1000 },
    { label: 'Last 24 hours', cutoff: now - 24 * 60 * 60 * 1000 },
    { label: 'All Time', cutoff: 0 },
  ];

  const byTimePeriod: PerformanceBreakdownItem[] = periods.map(({ label, cutoff }) => {
    const subset = evaluated.filter((r) => r.generatedAt >= cutoff);
    const c = subset.filter((r) => r.outcome === 'CORRECT').length;
    const inc = subset.length - c;
    return {
      label,
      total: subset.length,
      correct: c,
      incorrect: inc,
      accuracyPct: subset.length > 0 ? (c / subset.length) * 100 : 0,
    };
  });

  // Chronological cumulative accuracy series
  const chronological = [...evaluated].sort((a, b) => a.generatedAt - b.generatedAt);
  let runningCorrect = 0;
  const cumulativeAccuracySeries = chronological.map((r, idx) => {
    if (r.outcome === 'CORRECT') runningCorrect++;
    return {
      index: idx + 1,
      timestamp: r.generatedAt,
      accuracyPct: (runningCorrect / (idx + 1)) * 100,
      outcome: r.outcome,
    };
  });

  return {
    totalRecorded: records.length,
    evaluatedCount: evaluated.length,
    pendingCount: pending.length,
    correctCount,
    incorrectCount,
    accuracyPct,
    byCategory,
    byMarket,
    byWindow,
    byTimePeriod,
    cumulativeAccuracySeries,
  };
}
