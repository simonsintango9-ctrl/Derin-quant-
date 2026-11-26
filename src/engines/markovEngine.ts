import { MarkovAnalysisResult, MarkovTransition, TickRecord } from '../types/deriv';

/**
 * First-order discrete Markov Chain over last digits {0..9}.
 * Uses Laplace/Dirichlet smoothing (alpha) so zero-count cells remain calibrated.
 */
export function runMarkovAnalysis(
  ticks: TickRecord[],
  windowSize: number,
  alphaSmoothing = 0.5
): MarkovAnalysisResult {
  const slice = ticks.slice(-Math.max(1, windowSize));
  const countMatrix: number[][] = Array.from({ length: 10 }, () => new Array<number>(10).fill(0));
  const rowTotals = new Array<number>(10).fill(0);

  let sampleTransitions = 0;
  for (let i = 1; i < slice.length; i++) {
    const from = slice[i - 1].lastDigit;
    const to = slice[i].lastDigit;
    if (from >= 0 && from <= 9 && to >= 0 && to <= 9) {
      countMatrix[from][to]++;
      rowTotals[from]++;
      sampleTransitions++;
    }
  }

  const alpha = Math.max(0, alphaSmoothing);
  const rawMatrix: number[][] = Array.from({ length: 10 }, () => new Array<number>(10).fill(0.1));
  const smoothedMatrix: number[][] = Array.from({ length: 10 }, () => new Array<number>(10).fill(0.1));

  const allTransitions: MarkovTransition[] = [];

  for (let from = 0; from <= 9; from++) {
    const rowSum = rowTotals[from];
    for (let to = 0; to <= 9; to++) {
      const count = countMatrix[from][to];
      const rawProb = rowSum > 0 ? count / rowSum : 0.1;
      const smoothedProb = (count + alpha) / (rowSum + 10 * alpha);

      rawMatrix[from][to] = rawProb;
      smoothedMatrix[from][to] = smoothedProb;

      allTransitions.push({
        fromDigit: from,
        toDigit: to,
        count,
        rawProbability: rawProb,
        smoothedProbability: smoothedProb,
        liftOverUniform: smoothedProb / 0.1,
      });
    }
  }

  const topTransitions = [...allTransitions]
    .filter((t) => t.count > 0)
    .sort((a, b) => b.smoothedProbability - a.smoothedProbability || b.count - a.count)
    .slice(0, 8);

  const currentLastDigit = slice.length > 0 ? slice[slice.length - 1].lastDigit : null;
  const conditionalFromCurrent =
    currentLastDigit !== null
      ? allTransitions
          .filter((t) => t.fromDigit === currentLastDigit)
          .sort((a, b) => b.smoothedProbability - a.smoothedProbability)
      : [];

  return {
    sampleTransitions,
    alphaSmoothing: alpha,
    countMatrix,
    rawMatrix,
    smoothedMatrix,
    rowTotals,
    topTransitions,
    currentLastDigit,
    conditionalFromCurrent,
  };
}
