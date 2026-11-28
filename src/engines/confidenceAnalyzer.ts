import {
  DigitConfidenceBreakdown,
  MarkovAnalysisResult,
  ProbabilityReport,
  StatisticalAnalysisResult,
} from '../types/deriv';

/**
 * Evaluates per-digit (0-9) statistical confidence (0-100%) using
 * standard deviation (z-score & distribution dispersion), price volatility
 * stability, sample adequacy, and Markov conditional lift.
 */
export function analyzeDigitConfidences(
  stats: StatisticalAnalysisResult,
  markov: MarkovAnalysisResult,
  probability: ProbabilityReport,
  minSampleSize: number
): DigitConfidenceBreakdown[] {
  const condMap = new Map<number, { prob: number; lift: number }>();
  for (const row of markov.conditionalFromCurrent) {
    condMap.set(row.toDigit, {
      prob: row.smoothedProbability,
      lift: row.liftOverUniform,
    });
  }

  const n = stats.windowSize;
  const sampleFactor = n > 0 ? Math.min(1, n / Math.max(25, minSampleSize)) : 0;
  const stdDevFactor = Math.min(1, Math.max(0, stats.frequencyStdDev) / 6.0);
  const volatilityStability = Math.max(
    0.25,
    1 - Math.min(0.65, stats.tickVolatility * 2.4)
  );
  const chiBonus = probability.isStatisticallySignificant ? 0.12 : 0;

  return stats.digits.map((metric) => {
    const cond = condMap.get(metric.digit) ?? { prob: 0.1, lift: 1.0 };
    const absZ = Math.abs(metric.zScore);
    const zStrength = Math.min(1, absZ / 2.8);
    const markovEdge = Math.min(1, Math.abs(cond.lift - 1) * 3.0);

    const rawScore =
      n === 0
        ? 0
        : sampleFactor *
          (42 * (0.68 * zStrength + 0.32 * stdDevFactor) +
            25 * volatilityStability +
            21 * markovEdge +
            12 * (chiBonus > 0 ? 1 : 0.35));

    return {
      digit: metric.digit,
      confidenceScore: Math.max(0, Math.min(100, Math.round(rawScore))),
      empiricalPct: metric.percentage,
      zScore: metric.zScore,
      markovProbPct: cond.prob * 100,
      markovLift: cond.lift,
      momentumDelta: metric.momentumDelta,
      ticksSinceLast: metric.ticksSinceLast,
    };
  });
}
