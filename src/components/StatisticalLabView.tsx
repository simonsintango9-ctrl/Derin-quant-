import React, { useMemo } from 'react';
import { CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import {
  MarkovAnalysisResult,
  ProbabilityReport,
  StatisticalAnalysisResult,
  UserSettings,
} from '../types/deriv';
import { ProbabilityComparisonChart, RollingFrequencyChart } from './charts/QuantCharts';
import { MarkovHeatmap } from './MarkovHeatmap';

interface StatisticalLabViewProps {
  stats: StatisticalAnalysisResult;
  markov: MarkovAnalysisResult;
  probability: ProbabilityReport;
  settings: UserSettings;
}

export const StatisticalLabView: React.FC<StatisticalLabViewProps> = ({
  stats,
  markov,
  probability,
  settings,
}) => {
  const isDark = settings.theme === 'dark';

  const focusDigits = useMemo(() => {
    const hot = stats.hotDigits.slice(0, 2).map((d) => d.digit);
    const cold = stats.coldDigits.slice(0, 1).map((d) => d.digit);
    return Array.from(new Set([...hot, ...cold]));
  }, [stats.hotDigits, stats.coldDigits]);

  return (
    <div className="space-y-6">
      {/* Statistical Validation Summary */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Chi-Square Goodness-of-Fit (df = 9)
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            χ² = {probability.chiSquareStatistic.toFixed(3)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            p-value = {probability.chiSquarePValue.toFixed(4)} ·{' '}
            {probability.isStatisticallySignificant ? (
              <span className="text-amber-600 dark:text-amber-400 font-sans">
                Rejects uniform null (p &lt; 0.05)
              </span>
            ) : (
              <span className="text-emerald-600 dark:text-emerald-400 font-sans">
                Consistent with uniform
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Out-of-Sample Split Validation (70 / 30)
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {probability.outOfSampleValidation.testTopDigitHitRate !== null
              ? `${probability.outOfSampleValidation.testTopDigitHitRate.toFixed(1)}%`
              : '—'}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {probability.outOfSampleValidation.trainTopDigit !== null
              ? `Train top digit ${probability.outOfSampleValidation.trainTopDigit} (n=${probability.outOfSampleValidation.trainSize}) tested on held-out ${probability.outOfSampleValidation.testSize} ticks vs 10.0% baseline`
              : 'Requires at least 40 ticks for 70/30 out-of-sample split'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Sample Adequacy &amp; Entropy
          </div>
          <div className="mt-2 flex items-center gap-2 font-mono text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {probability.isSampleSufficient ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
            )}
            <span>
              n = {probability.sampleSize} / {probability.minimumRecommendedSample}
            </span>
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Shannon Entropy: {stats.shannonEntropy.toFixed(3)} / 3.322 bits
          </div>
        </div>
      </section>

      {/* Charts Row: Rolling Frequency & Probability Comparison */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Rolling Moving Frequency Trajectory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sliding-window percentage paths for current hot and cold digits
            </p>
          </div>
          {settings.chartVisibility.rollingFrequency ? (
            <RollingFrequencyChart
              probability={probability}
              focusDigits={focusDigits}
              isDark={isDark}
            />
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Rolling frequency chart hidden in Settings.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Empirical vs Markov Conditional vs Blended Estimate
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Observed frequency compared to conditional Markov transition from latest digit
            </p>
          </div>
          {settings.chartVisibility.probabilityComparison ? (
            <ProbabilityComparisonChart probability={probability} isDark={isDark} />
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Probability comparison chart hidden in Settings.
            </div>
          )}
        </div>
      </section>

      {/* Markov Transition Heatmap & Top Transitions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              First-Order Markov Transition Matrix (0–9)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Conditional probability P(Digit_t = column | Digit_&#123;t-1&#125; = row) with
              Dirichlet smoothing
            </p>
          </div>
          {settings.chartVisibility.markovHeatmap ? (
            <MarkovHeatmap markov={markov} isDark={isDark} />
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Markov heatmap hidden in Settings.
            </div>
          )}
        </div>

        <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Most Frequent Transitions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Highest smoothed conditional transitions observed in sample
            </p>
          </div>

          <div className="space-y-2">
            {markov.topTransitions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                Collect ticks to populate transition paths.
              </div>
            ) : (
              markov.topTransitions.map((t) => (
                <div
                  key={`${t.fromDigit}-${t.toDigit}`}
                  className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-mono tabular-nums"
                >
                  <span className="font-semibold text-slate-900 dark:text-slate-200">
                    {t.fromDigit} → {t.toDigit}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">{t.count} hits</span>
                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                    {(t.smoothedProbability * 100).toFixed(1)}%
                  </span>
                </div>
              ))
            )}
          </div>

          {markov.conditionalFromCurrent.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Top Transitions from Current Digit ({markov.currentLastDigit})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {markov.conditionalFromCurrent.slice(0, 4).map((c) => (
                  <div
                    key={c.toDigit}
                    className="rounded-lg bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-mono tabular-nums flex justify-between"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      {c.fromDigit}→{c.toDigit}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-300">
                      {(c.smoothedProbability * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Full Probability Estimates & Wilson CI Table */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Empirical Probability &amp; 95% Wilson Confidence Intervals
          </h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Info className="h-3.5 w-3.5" />
            Observed empirical frequency is historical, not a guaranteed future outcome
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono tabular-nums">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="py-2 text-left font-medium">Digit</th>
                <th className="py-2 text-right font-medium">Empirical</th>
                <th className="py-2 text-right font-medium">Markov Cond.</th>
                <th className="py-2 text-right font-medium">Blended Est.</th>
                <th className="py-2 text-right font-medium">95% Wilson CI</th>
                <th className="py-2 text-right font-medium">Std Error</th>
                <th className="py-2 text-right font-medium">Z-Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {probability.estimates.map((e) => (
                <tr key={e.digit} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="py-2 text-left font-bold text-slate-900 dark:text-slate-100">
                    {e.digit}
                  </td>
                  <td className="py-2 text-right text-slate-700 dark:text-slate-200">
                    {(e.empiricalProb * 100).toFixed(2)}%
                  </td>
                  <td className="py-2 text-right text-slate-600 dark:text-slate-300">
                    {e.markovConditionalProb !== null
                      ? `${(e.markovConditionalProb * 100).toFixed(2)}%`
                      : '—'}
                  </td>
                  <td className="py-2 text-right text-emerald-700 dark:text-emerald-300 font-semibold">
                    {(e.blendedEstimate * 100).toFixed(2)}%
                  </td>
                  <td className="py-2 text-right text-slate-600 dark:text-slate-300">
                    [{(e.ciLow * 100).toFixed(1)}%, {(e.ciHigh * 100).toFixed(1)}%]
                  </td>
                  <td className="py-2 text-right text-slate-500 dark:text-slate-400">
                    ±{(e.standardError * 100).toFixed(2)}%
                  </td>
                  <td
                    className={`py-2 text-right ${
                      Math.abs(e.zScore) >= 1.96
                        ? 'text-amber-600 dark:text-amber-400 font-semibold'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {e.zScore >= 0 ? '+' : ''}
                    {e.zScore.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
