import { DEFAULT_USER_SETTINGS } from '../constants/markets';
import { EngineDiagnosticResult, TickRecord } from '../types/deriv';
import { extractLastDigit, pipSizeToDecimals } from './digitExtractionEngine';
import { runMarkovAnalysis } from './markovEngine';
import { evaluatePendingSignalsWithTick, createPendingSignalRecord } from './performanceEngine';
import { chiSquarePValue, runProbabilityEngine, wilsonConfidenceInterval } from './probabilityEngine';
import { generateSignals } from './signalEngine';
import { runStatisticalAnalysis } from './statisticalEngine';
import { TickDataEngine } from './tickDataEngine';

/**
 * Pure algorithmic self-test suite verifying precision digit extraction,
 * deduplication, statistical distribution, Markov normalization, and signal validation.
 */
export function runEngineDiagnostics(): EngineDiagnosticResult[] {
  const results: EngineDiagnosticResult[] = [];

  // 1. Digit Precision & Trailing Zeros
  try {
    const c1 = extractLastDigit(1234.56, 0.01);
    const c2 = extractLastDigit(9876.21, 0.01);
    const c3 = extractLastDigit(5432.5, 0.01); // Trailing zero -> 5432.50 -> 0
    const c4 = extractLastDigit(7654.89, 0.01);
    const c5 = extractLastDigit(125.4, 0.001); // Trailing zeros -> 125.400 -> 0
    const c6 = extractLastDigit(99.1234, 0.0001); // 4 decimals -> 4
    const c7 = extractLastDigit(5432.5, 2); // Deriv integer pip_size=2 -> 5432.50 -> 0
    const c8 = extractLastDigit(98.765, 3); // Deriv integer pip_size=3 -> 5

    const ok =
      c1.lastDigit === 6 &&
      c2.lastDigit === 1 &&
      c3.lastDigit === 0 &&
      c3.formattedQuote === '5432.50' &&
      c4.lastDigit === 9 &&
      c5.lastDigit === 0 &&
      c5.formattedQuote === '125.400' &&
      c6.lastDigit === 4 &&
      c7.lastDigit === 0 &&
      c7.formattedQuote === '5432.50' &&
      c8.lastDigit === 5 &&
      pipSizeToDecimals(0.0001) === 4 &&
      pipSizeToDecimals(4) === 4;

    results.push({
      name: 'Digit Precision & Trailing Zero Extraction',
      passed: ok,
      details: ok
        ? 'Verified 0.01, 0.001, and 0.0001 pip_size scaling (5432.50 → 0, 125.400 → 0, 99.1234 → 4).'
        : 'Digit extraction mismatch detected.',
    });
  } catch (e) {
    results.push({
      name: 'Digit Precision & Trailing Zero Extraction',
      passed: false,
      details: e instanceof Error ? e.message : 'Unexpected exception',
    });
  }

  // 2. Duplicate Tick Protection
  try {
    const engine = new TickDataEngine(500);
    const sampleTick: TickRecord = {
      symbol: '1HZ100V',
      epoch: 1700000001,
      receivedAt: Date.now(),
      quote: 100.5,
      formattedQuote: '100.50',
      pipSize: 0.01,
      decimals: 2,
      lastDigit: 0,
    };
    const first = engine.appendLiveTick(sampleTick);
    const duplicate = engine.appendLiveTick({ ...sampleTick });
    const stale = engine.appendLiveTick({ ...sampleTick, epoch: 1700000000 });
    const ok = first === true && duplicate === false && stale === false && engine.getTickCount('1HZ100V') === 1;

    results.push({
      name: 'Tick Deduplication & Chronological Guard',
      passed: ok,
      details: ok
        ? 'Accepted initial tick, rejected duplicate epoch and out-of-order stale epoch.'
        : 'TickDataEngine deduplication assertion failed.',
    });
  } catch (e) {
    results.push({
      name: 'Tick Deduplication & Chronological Guard',
      passed: false,
      details: e instanceof Error ? e.message : 'Unexpected exception',
    });
  }

  // 3. Statistical Frequency & Markov Row Normalization
  try {
    const syntheticSequence = Array.from({ length: 120 }, (_, idx): TickRecord => {
      const digit = (idx * 7 + 3) % 10;
      const quote = 1000 + digit * 0.01;
      return {
        symbol: '1HZ100V',
        epoch: 1700000100 + idx,
        receivedAt: Date.now(),
        quote,
        formattedQuote: quote.toFixed(2),
        pipSize: 0.01,
        decimals: 2,
        lastDigit: digit,
      };
    });

    const stats = runStatisticalAnalysis('1HZ100V', syntheticSequence, 100);
    const totalPct = stats.digits.reduce((s, d) => s + d.percentage, 0);
    const markov = runMarkovAnalysis(syntheticSequence, 100, 0.5);
    const rowsNormalized = markov.smoothedMatrix.every((row) => {
      const sum = row.reduce((a, b) => a + b, 0);
      return Math.abs(sum - 1) < 1e-9;
    });

    const ok = Math.abs(totalPct - 100) < 1e-6 && rowsNormalized && stats.windowSize === 100;
    results.push({
      name: 'Statistical Percentages & Markov Matrix Normalization',
      passed: ok,
      details: ok
        ? `Sum of digit percentages = ${totalPct.toFixed(2)}%; all 10 Markov rows sum to 1.0000.`
        : 'Percentage sum or Markov normalization failed.',
    });
  } catch (e) {
    results.push({
      name: 'Statistical Percentages & Markov Matrix Normalization',
      passed: false,
      details: e instanceof Error ? e.message : 'Unexpected exception',
    });
  }

  // 4. Chi-Square & Wilson CI Calibration
  try {
    const pUniform = chiSquarePValue(0, 9);
    const pExtreme = chiSquarePValue(45, 9);
    const [ciL, ciH] = wilsonConfidenceInterval(10, 100);
    const ok =
      Math.abs(pUniform - 1) < 1e-6 &&
      pExtreme < 0.0001 &&
      ciL > 0.05 &&
      ciL < 0.1 &&
      ciH > 0.1 &&
      ciH < 0.2;

    results.push({
      name: 'Chi-Square Survival Function & Wilson Confidence Interval',
      passed: ok,
      details: ok
        ? `χ²(0)=p:${pUniform.toFixed(3)}, χ²(45)=p:${pExtreme.toExponential(2)}, Wilson 10/100=[${(ciL * 100).toFixed(1)}%, ${(ciH * 100).toFixed(1)}%].`
        : 'Probability calibration bounds failed.',
    });
  } catch (e) {
    results.push({
      name: 'Chi-Square Survival Function & Wilson Confidence Interval',
      passed: false,
      details: e instanceof Error ? e.message : 'Unexpected exception',
    });
  }

  // 5. Signal Generation & Strict Out-of-Sample Evaluation
  try {
    const seq = Array.from({ length: 80 }, (_, idx): TickRecord => {
      const digit = idx % 5 === 0 ? 7 : (idx % 9);
      const quote = 500 + digit * 0.01;
      return {
        symbol: 'R_100',
        epoch: 1700001000 + idx,
        receivedAt: Date.now(),
        quote,
        formattedQuote: quote.toFixed(2),
        pipSize: 0.01,
        decimals: 2,
        lastDigit: digit,
      };
    });
    const stats = runStatisticalAnalysis('R_100', seq, 80);
    const markov = runMarkovAnalysis(seq, 80, 0.5);
    const prob = runProbabilityEngine(seq, 80, markov, 50);
    const { matchesSignal, differsSignal } = generateSignals({
      symbol: 'R_100',
      allTicks: seq,
      selectedWindow: 80,
      stats,
      markov,
      probability: prob,
      validitySeconds: 12,
      thresholds: DEFAULT_USER_SETTINGS.thresholds,
    });

    const pending = matchesSignal ? [createPendingSignalRecord(matchesSignal)] : [];
    const nextTick: TickRecord = {
      symbol: 'R_100',
      epoch: 1700001080,
      receivedAt: Date.now(),
      quote: 500 + (matchesSignal?.targetDigit ?? 0) * 0.01,
      formattedQuote: (500 + (matchesSignal?.targetDigit ?? 0) * 0.01).toFixed(2),
      pipSize: 0.01,
      decimals: 2,
      lastDigit: matchesSignal?.targetDigit ?? 0,
    };
    const evalRes = evaluatePendingSignalsWithTick(pending, nextTick);

    const ok =
      matchesSignal !== null &&
      differsSignal !== null &&
      evalRes.newlyEvaluated.length === 1 &&
      evalRes.newlyEvaluated[0].outcome === 'CORRECT';

    results.push({
      name: 'Matches/Differs Signal Engine & Out-of-Sample Outcome Recording',
      passed: ok,
      details: ok
        ? `Generated Matches(${matchesSignal?.targetDigit}) & Differs(${differsSignal?.targetDigit}); verified next-tick out-of-sample grading.`
        : 'Signal generation or evaluation test failed.',
    });
  } catch (e) {
    results.push({
      name: 'Matches/Differs Signal Engine & Out-of-Sample Outcome Recording',
      passed: false,
      details: e instanceof Error ? e.message : 'Unexpected exception',
    });
  }

  return results;
}
