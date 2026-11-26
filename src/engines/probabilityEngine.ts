import {
  AnomalyAlert,
  DigitProbabilityEstimate,
  MarkovAnalysisResult,
  ProbabilityReport,
  TickRecord,
} from '../types/deriv';

const UNIFORM_P = 0.1;
const Z_95 = 1.95996398454;

/**
 * Wilson Score 95% confidence interval for a binomial proportion.
 */
export function wilsonConfidenceInterval(successes: number, total: number): [number, number] {
  if (total <= 0) return [0, 1];
  const p = successes / total;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denom;
  const margin =
    (Z_95 * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

/**
 * Lanczos approximation for ln(Gamma(z)).
 */
function logGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Regularized upper incomplete gamma Q(a, x) for exact Chi-Square p-value.
 * Q(k/2, chi2/2) = survival function P(X >= chi2).
 */
export function chiSquarePValue(chiSquare: number, df = 9): number {
  if (!Number.isFinite(chiSquare) || chiSquare <= 0) return 1;
  const a = df / 2;
  const x = chiSquare / 2;

  if (x < a + 1) {
    // Series representation for P(a, x), then 1 - P
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n <= 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-12) break;
    }
    const pLower = sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    return Math.max(0, Math.min(1, 1 - pLower));
  } else {
    // Continued fraction (Lentz's method) for Q(a, x)
    const fpmin = 1e-30;
    let b = x + 1 - a;
    let c = 1 / fpmin;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 200; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = b + an / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-12) break;
    }
    const qUpper = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    return Math.max(0, Math.min(1, qUpper));
  }
}

export function runProbabilityEngine(
  ticks: TickRecord[],
  windowSize: number,
  markov: MarkovAnalysisResult,
  minimumRecommendedSample = 50
): ProbabilityReport {
  const slice = ticks.slice(-Math.max(1, windowSize));
  const n = slice.length;
  const counts = new Array<number>(10).fill(0);

  for (const t of slice) {
    counts[t.lastDigit]++;
  }

  // Chi-square goodness-of-fit against uniform 10%
  const expected = n * UNIFORM_P;
  let chiSquareStatistic = 0;
  if (expected > 0) {
    for (let d = 0; d < 10; d++) {
      const diff = counts[d] - expected;
      chiSquareStatistic += (diff * diff) / expected;
    }
  }

  const degreesOfFreedom = 9;
  const pValue = n >= 10 ? chiSquarePValue(chiSquareStatistic, degreesOfFreedom) : 1;
  const isSampleSufficient = n >= minimumRecommendedSample;
  // Chi-square assumption requires expected count >= 5 per bin (N >= 50)
  const isStatisticallySignificant = isSampleSufficient && expected >= 5 && pValue < 0.05;

  const condMap = new Map<number, number>();
  for (const row of markov.conditionalFromCurrent) {
    condMap.set(row.toDigit, row.smoothedProbability);
  }

  const se = n > 0 ? Math.sqrt((UNIFORM_P * (1 - UNIFORM_P)) / n) : 0;

  const estimates: DigitProbabilityEstimate[] = Array.from({ length: 10 }, (_, digit) => {
    const emp = n > 0 ? counts[digit] / n : UNIFORM_P;
    const markovProb = condMap.has(digit) ? condMap.get(digit)! : null;
    // Conservative shrinkage toward uniform baseline based on sample size
    const shrinkageWeight = n / (n + 100);
    const empiricalShrunk = shrinkageWeight * emp + (1 - shrinkageWeight) * UNIFORM_P;
    const blendedEstimate =
      markovProb !== null ? 0.7 * empiricalShrunk + 0.3 * markovProb : empiricalShrunk;

    const [ciLow, ciHigh] = wilsonConfidenceInterval(counts[digit], n);
    const zScore = se > 0 ? (emp - UNIFORM_P) / se : 0;

    return {
      digit,
      empiricalProb: emp,
      markovConditionalProb: markovProb,
      blendedEstimate,
      uniformBaseline: UNIFORM_P,
      ciLow,
      ciHigh,
      standardError: n > 0 ? Math.sqrt((emp * (1 - emp)) / n) : 0,
      zScore,
    };
  });

  // Rolling frequency series over sliding sub-window (window = min(25, max(10, floor(n/4))))
  const rollingFrequencySeries: ProbabilityReport['rollingFrequencySeries'] = [];
  if (n >= 20) {
    const rollWin = Math.min(30, Math.max(10, Math.floor(n / 4)));
    const step = Math.max(1, Math.floor((n - rollWin) / 24));
    for (let end = rollWin; end <= n; end += step) {
      const sub = slice.slice(end - rollWin, end);
      const subCounts = new Array<number>(10).fill(0);
      for (const t of sub) subCounts[t.lastDigit]++;
      rollingFrequencySeries.push({
        tickIndex: end,
        epoch: sub[sub.length - 1].epoch,
        frequencies: subCounts.map((c) => (c / rollWin) * 100),
      });
    }
  }

  // Anomaly detection
  const anomalies: AnomalyAlert[] = [];
  if (!isSampleSufficient) {
    anomalies.push({
      id: 'insufficient-sample',
      severity: 'warning',
      title: 'Insufficient Sample Size',
      description: `Observed ${n} ticks. Chi-square and binomial confidence estimates require at least ${minimumRecommendedSample} ticks (expected count >= 5 per digit).`,
    });
  }

  const extremeOutliers = estimates.filter((e) => Math.abs(e.zScore) >= 2.58);
  if (isSampleSufficient && extremeOutliers.length > 0) {
    anomalies.push({
      id: 'z-score-outlier',
      severity: 'alert',
      title: `Extreme Digit Dispersion (|z| >= 2.58)`,
      description: `Digits ${extremeOutliers
        .map((o) => `${o.digit} (z=${o.zScore.toFixed(2)})`)
        .join(', ')} deviate > 99% single-bin threshold from 10.0% baseline.`,
    });
  }

  if (isStatisticallySignificant) {
    anomalies.push({
      id: 'chi-square-reject',
      severity: 'alert',
      title: 'Non-Uniform Distribution Detected',
      description: `Chi-square = ${chiSquareStatistic.toFixed(2)} (df=9, p=${pValue.toFixed(4)}). Short-term sample diverges from uniform expectation.`,
    });
  }

  // Out-of-sample split validation (70% fit, 30% strictly held-out test)
  let trainTopDigit: number | null = null;
  let testTopDigitHitRate: number | null = null;
  let trainSize = 0;
  let testSize = 0;

  if (n >= 40) {
    trainSize = Math.floor(n * 0.7);
    testSize = n - trainSize;
    const trainSlice = slice.slice(0, trainSize);
    const testSlice = slice.slice(trainSize);

    const trainCounts = new Array<number>(10).fill(0);
    for (const t of trainSlice) trainCounts[t.lastDigit]++;
    let bestDigit = 0;
    for (let d = 1; d < 10; d++) {
      if (trainCounts[d] > trainCounts[bestDigit]) bestDigit = d;
    }
    trainTopDigit = bestDigit;

    const testHits = testSlice.filter((t) => t.lastDigit === bestDigit).length;
    testTopDigitHitRate = (testHits / testSize) * 100;
  }

  return {
    sampleSize: n,
    isSampleSufficient,
    minimumRecommendedSample,
    chiSquareStatistic,
    degreesOfFreedom,
    chiSquarePValue: pValue,
    isStatisticallySignificant,
    estimates,
    rollingFrequencySeries,
    anomalies,
    outOfSampleValidation: {
      trainSize,
      testSize,
      trainTopDigit,
      testTopDigitHitRate,
      baselineRate: 10,
    },
  };
}
