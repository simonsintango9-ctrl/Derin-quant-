import {
  ClassificationThresholds,
  MarkovAnalysisResult,
  MarketSymbol,
  ProbabilityReport,
  QuantSignal,
  SignalCategory,
  SignalQualityTier,
  StatisticalAnalysisResult,
  TickRecord,
} from '../types/deriv';
import { runStatisticalAnalysis } from './statisticalEngine';
import { wilsonConfidenceInterval } from './probabilityEngine';

function classifySignalQuality(
  sampleSize: number,
  evidenceScore: number,
  thresholds: ClassificationThresholds
): SignalQualityTier {
  if (sampleSize < thresholds.minSampleSize) {
    return 'Insufficient Data';
  }
  if (evidenceScore >= thresholds.veryHighConfidenceMinScore) {
    return 'Very High Confidence';
  }
  if (evidenceScore >= thresholds.highConfidenceMaxScore) {
    return 'High Confidence';
  }
  if (evidenceScore >= thresholds.moderateConfidenceMaxScore) {
    return 'Moderate Confidence';
  }
  if (evidenceScore >= thresholds.lowConfidenceMaxScore) {
    return 'Low Confidence';
  }
  return 'Very Low Confidence';
}

export interface SignalGenerationInput {
  symbol: MarketSymbol;
  allTicks: TickRecord[];
  selectedWindow: number;
  stats: StatisticalAnalysisResult;
  markov: MarkovAnalysisResult;
  probability: ProbabilityReport;
  validitySeconds: number;
  thresholds: ClassificationThresholds;
}

export function generateSignals(input: SignalGenerationInput): {
  matchesSignal: QuantSignal | null;
  differsSignal: QuantSignal | null;
  evenSignal: QuantSignal | null;
  oddSignal: QuantSignal | null;
} {
  const {
    symbol,
    allTicks,
    selectedWindow,
    stats,
    markov,
    probability,
    validitySeconds,
    thresholds,
  } = input;

  if (allTicks.length === 0) {
    return {
      matchesSignal: null,
      differsSignal: null,
      evenSignal: null,
      oddSignal: null,
    };
  }

  const latestTick = allTicks[allTicks.length - 1];
  const now = Date.now();
  const expiresAt = now + validitySeconds * 1000;

  // Multi-window views (50, 100, 200) for agreement checks
  const stats50 = allTicks.length >= 30 ? runStatisticalAnalysis(symbol, allTicks, 50) : null;
  const stats100 = allTicks.length >= 60 ? runStatisticalAnalysis(symbol, allTicks, 100) : null;
  const stats200 = allTicks.length >= 120 ? runStatisticalAnalysis(symbol, allTicks, 200) : null;

  const condMap = new Map<number, number>();
  for (const row of markov.conditionalFromCurrent) {
    condMap.set(row.toDigit, row.smoothedProbability);
  }

  // Evaluate each digit 0-9 for MATCHES
  const matchesCandidates = stats.digits.map((dMetric) => {
    const est = probability.estimates[dMetric.digit];
    const markovProb = condMap.get(dMetric.digit) ?? 0.1;
    const modelsSupporting: string[] = [];

    if (dMetric.percentage > 10) modelsSupporting.push('Empirical Frequency');
    if (markovProb > 0.105) modelsSupporting.push('Markov Transition');
    if (dMetric.momentumDelta > 0.5) modelsSupporting.push('Positive Momentum');
    if (stats50 && stats50.digits[dMetric.digit].percentage > 10) modelsSupporting.push('50-Tick Window');
    if (stats100 && stats100.digits[dMetric.digit].percentage > 10) modelsSupporting.push('100-Tick Window');
    if (stats200 && stats200.digits[dMetric.digit].percentage > 10) modelsSupporting.push('200-Tick Window');

    const possibleModels =
      3 + (stats50 ? 1 : 0) + (stats100 ? 1 : 0) + (stats200 ? 1 : 0);
    const agreement = modelsSupporting.length / possibleModels;

    const compositeScore =
      (est.blendedEstimate - 0.1) * 4 +
      Math.max(0, dMetric.zScore) * 0.15 +
      agreement * 0.35;

    const sampleFactor = Math.min(1, stats.windowSize / 250);
    const zFactor = Math.min(1, Math.max(0, dMetric.zScore) / 3.0);
    const chiFactor = probability.isStatisticallySignificant ? 0.2 : 0;
    const evidenceScore = Math.min(
      1,
      0.35 * sampleFactor + 0.3 * agreement + 0.25 * zFactor + chiFactor
    );

    return {
      digit: dMetric.digit,
      metric: dMetric,
      estimate: est,
      modelsSupporting,
      agreement,
      compositeScore,
      evidenceScore,
    };
  });

  matchesCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const bestMatch = matchesCandidates[0];

  // DIFFERS: evaluate probability that next digit != targetDigit
  const differsCandidates = stats.digits.map((dMetric) => {
    const est = probability.estimates[dMetric.digit];
    const markovProb = condMap.get(dMetric.digit) ?? 0.1;
    const differsProb = 1 - est.blendedEstimate;
    const differsEmpirical = 1 - dMetric.frequency;
    const modelsSupporting: string[] = [];

    if (dMetric.percentage < 10) modelsSupporting.push('Low Empirical Rate');
    if (markovProb < 0.095) modelsSupporting.push('Markov Suppression');
    if (dMetric.momentumDelta < -0.5) modelsSupporting.push('Negative Momentum');
    if (stats50 && stats50.digits[dMetric.digit].percentage < 10) modelsSupporting.push('50-Tick Window');
    if (stats100 && stats100.digits[dMetric.digit].percentage < 10) modelsSupporting.push('100-Tick Window');
    if (stats200 && stats200.digits[dMetric.digit].percentage < 10) modelsSupporting.push('200-Tick Window');

    const possibleModels =
      3 + (stats50 ? 1 : 0) + (stats100 ? 1 : 0) + (stats200 ? 1 : 0);
    const agreement = modelsSupporting.length / possibleModels;

    const compositeScore =
      (differsProb - 0.9) * 4 +
      Math.max(0, -dMetric.zScore) * 0.15 +
      agreement * 0.35;

    const sampleFactor = Math.min(1, stats.windowSize / 250);
    const zFactor = Math.min(1, Math.max(0, -dMetric.zScore) / 3.0);
    const chiFactor = probability.isStatisticallySignificant ? 0.2 : 0;
    const evidenceScore = Math.min(
      1,
      0.35 * sampleFactor + 0.3 * agreement + 0.25 * zFactor + chiFactor
    );

    const [matchLow, matchHigh] = wilsonConfidenceInterval(
      stats.windowSize - dMetric.count,
      stats.windowSize
    );

    return {
      digit: dMetric.digit,
      metric: dMetric,
      differsProb,
      differsEmpirical,
      ci: [matchLow, matchHigh] as [number, number],
      modelsSupporting,
      agreement,
      compositeScore,
      evidenceScore,
    };
  });

  differsCandidates.sort((a, b) => b.compositeScore - a.compositeScore);
  const bestDiffers = differsCandidates[0];

  const buildEvidenceNote = (
    cat: SignalCategory,
    digit: number,
    z: number,
    agree: number,
    n: number
  ): string => {
    if (n < thresholds.minSampleSize) {
      return `Insufficient sample (${n}/${thresholds.minSampleSize} ticks). Estimate defaults toward uniform baseline.`;
    }
    if (cat === 'EVEN' || cat === 'ODD') {
      return `${cat} parity is ${Math.abs(z).toFixed(2)}σ ${z >= 0 ? 'above' : 'below'} 50.0% parity baseline across ${Math.round(agree * 100)}% of checks.`;
    }
    const dir = cat === 'MATCHES' ? 'above' : 'below';
    return `Digit ${digit} is ${Math.abs(z).toFixed(2)}σ ${dir} uniform 10% across ${Math.round(
      agree * 100
    )}% of analytical checks (χ² p=${probability.chiSquarePValue.toFixed(3)}).`;
  };

  // EVEN & ODD Parity Analysis
  const evenCount = stats.digits
    .filter((d) => d.digit % 2 === 0)
    .reduce((sum, d) => sum + d.count, 0);
  const oddCount = stats.windowSize - evenCount;
  const evenEmp = stats.windowSize > 0 ? evenCount / stats.windowSize : 0.5;
  const oddEmp = stats.windowSize > 0 ? oddCount / stats.windowSize : 0.5;

  const evenMarkov = [0, 2, 4, 6, 8].reduce((s, d) => s + (condMap.get(d) ?? 0.1), 0);
  const oddMarkov = 1 - evenMarkov;

  const shrinkage = stats.windowSize / (stats.windowSize + 100);
  const evenShrunk = shrinkage * evenEmp + (1 - shrinkage) * 0.5;
  const oddShrunk = shrinkage * oddEmp + (1 - shrinkage) * 0.5;

  const evenBlended = 0.7 * evenShrunk + 0.3 * evenMarkov;
  const oddBlended = 0.7 * oddShrunk + 0.3 * oddMarkov;

  const paritySe = stats.windowSize > 0 ? Math.sqrt((0.5 * 0.5) / stats.windowSize) : 0;
  const evenZ = paritySe > 0 ? (evenEmp - 0.5) / paritySe : 0;
  const oddZ = -evenZ;

  const evenSum = (s: StatisticalAnalysisResult | null) =>
    s ? s.digits.filter((d) => d.digit % 2 === 0).reduce((a, b) => a + b.percentage, 0) : 50;

  const evenModels: string[] = [];
  if (evenEmp > 0.5) evenModels.push('Empirical Parity');
  if (evenMarkov > 0.505) evenModels.push('Markov Parity');
  if (stats50 && evenSum(stats50) > 50) evenModels.push('50-Tick Window');
  if (stats100 && evenSum(stats100) > 50) evenModels.push('100-Tick Window');
  if (stats200 && evenSum(stats200) > 50) evenModels.push('200-Tick Window');

  const oddModels: string[] = [];
  if (oddEmp > 0.5) oddModels.push('Empirical Parity');
  if (oddMarkov > 0.505) oddModels.push('Markov Parity');
  if (stats50 && evenSum(stats50) < 50) oddModels.push('50-Tick Window');
  if (stats100 && evenSum(stats100) < 50) oddModels.push('100-Tick Window');
  if (stats200 && evenSum(stats200) < 50) oddModels.push('200-Tick Window');

  const parityTotalChecks = 2 + (stats50 ? 1 : 0) + (stats100 ? 1 : 0) + (stats200 ? 1 : 0);
  const evenAgree = evenModels.length / parityTotalChecks;
  const oddAgree = oddModels.length / parityTotalChecks;

  const sampleFactor = Math.min(1, stats.windowSize / 250);
  const evenEvidence = Math.min(
    1,
    0.35 * sampleFactor + 0.35 * evenAgree + 0.3 * Math.min(1, Math.max(0, evenZ) / 2.5)
  );
  const oddEvidence = Math.min(
    1,
    0.35 * sampleFactor + 0.35 * oddAgree + 0.3 * Math.min(1, Math.max(0, oddZ) / 2.5)
  );

  const bestEvenDigit =
    stats.digits
      .filter((d) => d.digit % 2 === 0)
      .sort((a, b) => b.percentage - a.percentage)[0]?.digit ?? 0;
  const bestOddDigit =
    stats.digits
      .filter((d) => d.digit % 2 === 1)
      .sort((a, b) => b.percentage - a.percentage)[0]?.digit ?? 1;

  const matchesSignal: QuantSignal = {
    id: `SIG-M-${symbol}-${latestTick.epoch}-${bestMatch.digit}`,
    symbol,
    category: 'MATCHES',
    targetDigit: bestMatch.digit,
    targetLabel: `MATCH DIGIT ${bestMatch.digit}`,
    estimatedProbability: bestMatch.estimate.blendedEstimate,
    confidenceInterval: [bestMatch.estimate.ciLow, bestMatch.estimate.ciHigh],
    historicalFrequency: bestMatch.metric.frequency,
    baselineProbability: 0.1,
    sampleSize: stats.windowSize,
    windowUsed: selectedWindow,
    modelAgreementScore: bestMatch.agreement,
    modelsSupporting: bestMatch.modelsSupporting,
    statisticalReliability: classifySignalQuality(
      stats.windowSize,
      bestMatch.evidenceScore,
      thresholds
    ),
    evidenceSummary: buildEvidenceNote(
      'MATCHES',
      bestMatch.digit,
      bestMatch.metric.zScore,
      bestMatch.agreement,
      stats.windowSize
    ),
    generatedAt: now,
    anchorTickEpoch: latestTick.epoch,
    validitySeconds,
    expiresAt,
    modelName: 'Multi-Window + Smoothed Markov Blend',
  };

  const differsSignal: QuantSignal = {
    id: `SIG-D-${symbol}-${latestTick.epoch}-${bestDiffers.digit}`,
    symbol,
    category: 'DIFFERS',
    targetDigit: bestDiffers.digit,
    targetLabel: `DIFFERS DIGIT ${bestDiffers.digit}`,
    estimatedProbability: bestDiffers.differsProb,
    confidenceInterval: bestDiffers.ci,
    historicalFrequency: bestDiffers.differsEmpirical,
    baselineProbability: 0.9,
    sampleSize: stats.windowSize,
    windowUsed: selectedWindow,
    modelAgreementScore: bestDiffers.agreement,
    modelsSupporting: bestDiffers.modelsSupporting,
    statisticalReliability: classifySignalQuality(
      stats.windowSize,
      bestDiffers.evidenceScore,
      thresholds
    ),
    evidenceSummary: buildEvidenceNote(
      'DIFFERS',
      bestDiffers.digit,
      bestDiffers.metric.zScore,
      bestDiffers.agreement,
      stats.windowSize
    ),
    generatedAt: now,
    anchorTickEpoch: latestTick.epoch,
    validitySeconds,
    expiresAt,
    modelName: 'Multi-Window + Smoothed Markov Blend',
  };

  const evenSignal: QuantSignal = {
    id: `SIG-E-${symbol}-${latestTick.epoch}`,
    symbol,
    category: 'EVEN',
    targetDigit: bestEvenDigit,
    targetLabel: 'EVEN DIGITS',
    estimatedProbability: evenBlended,
    confidenceInterval: wilsonConfidenceInterval(evenCount, stats.windowSize),
    historicalFrequency: evenEmp,
    baselineProbability: 0.5,
    sampleSize: stats.windowSize,
    windowUsed: selectedWindow,
    modelAgreementScore: evenAgree,
    modelsSupporting: evenModels,
    statisticalReliability: classifySignalQuality(stats.windowSize, evenEvidence, thresholds),
    evidenceSummary: buildEvidenceNote('EVEN', bestEvenDigit, evenZ, evenAgree, stats.windowSize),
    generatedAt: now,
    anchorTickEpoch: latestTick.epoch,
    validitySeconds,
    expiresAt,
    modelName: 'Parity Binomial + Markov Blend',
  };

  const oddSignal: QuantSignal = {
    id: `SIG-O-${symbol}-${latestTick.epoch}`,
    symbol,
    category: 'ODD',
    targetDigit: bestOddDigit,
    targetLabel: 'ODD DIGITS',
    estimatedProbability: oddBlended,
    confidenceInterval: wilsonConfidenceInterval(oddCount, stats.windowSize),
    historicalFrequency: oddEmp,
    baselineProbability: 0.5,
    sampleSize: stats.windowSize,
    windowUsed: selectedWindow,
    modelAgreementScore: oddAgree,
    modelsSupporting: oddModels,
    statisticalReliability: classifySignalQuality(stats.windowSize, oddEvidence, thresholds),
    evidenceSummary: buildEvidenceNote('ODD', bestOddDigit, oddZ, oddAgree, stats.windowSize),
    generatedAt: now,
    anchorTickEpoch: latestTick.epoch,
    validitySeconds,
    expiresAt,
    modelName: 'Parity Binomial + Markov Blend',
  };

  return { matchesSignal, differsSignal, evenSignal, oddSignal };
}
