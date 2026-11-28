import React, { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
  PerformanceSummary,
  SignalCategory,
  SignalRecord,
  UserSettings,
} from '../types/deriv';
import { SignalPerformanceChart } from './charts/QuantCharts';

interface SignalLedgerViewProps {
  records: SignalRecord[];
  summary: PerformanceSummary;
  settings: UserSettings;
  onExportSignalsCsv: () => void;
}

export const SignalLedgerView: React.FC<SignalLedgerViewProps> = ({
  records,
  summary,
  settings,
  onExportSignalsCsv,
}) => {
  const isDark = settings.theme === 'dark';
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | SignalCategory>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<'ALL' | 'CORRECT' | 'INCORRECT' | 'PENDING'>(
    'ALL'
  );

  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (categoryFilter !== 'ALL' && r.category !== categoryFilter) return false;
      if (outcomeFilter !== 'ALL' && r.outcome !== outcomeFilter) return false;
      return true;
    });
  }, [records, categoryFilter, outcomeFilter]);

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Logged</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {summary.totalRecorded}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {summary.pendingCount} pending next tick
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Evaluated Out-of-Sample
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {summary.evaluatedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Strictly post-signal ticks</div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Correct Outcomes</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {summary.correctCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Verified hits</div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Incorrect Outcomes</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {summary.incorrectCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Verified misses</div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">Observed Accuracy</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {summary.evaluatedCount > 0 ? `${summary.accuracyPct.toFixed(1)}%` : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
            {summary.avgConfidenceScore !== null
              ? `Avg Confidence: ${summary.avgConfidenceScore}%`
              : 'Across all graded signals'}
          </div>
        </div>
      </section>

      {/* Performance Chart + Breakdowns */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Out-of-Sample Accuracy Trajectory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cumulative accuracy evaluated strictly on ticks arriving after signal generation
            </p>
          </div>
          {settings.chartVisibility.signalPerformance ? (
            <SignalPerformanceChart summary={summary} isDark={isDark} />
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              Signal performance chart hidden in Settings.
            </div>
          )}
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Accuracy Breakdowns
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Performance segmented by category, window, and time period
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400 font-medium mb-1.5">
                By Signal Category
              </div>
              {summary.byCategory.length === 0 ? (
                <div className="text-slate-500">No evaluated signals yet.</div>
              ) : (
                <div className="space-y-1.5">
                  {summary.byCategory.map((row) => (
                    <div
                      key={row.label}
                      className="flex justify-between font-mono tabular-nums text-slate-800 dark:text-slate-300"
                    >
                      <span>{row.label}</span>
                      <span>
                        {row.correct}/{row.total} ({row.accuracyPct.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-slate-500 dark:text-slate-400 font-medium mb-1.5">
                By Time Period
              </div>
              <div className="space-y-1.5">
                {summary.byTimePeriod.map((row) => (
                  <div
                    key={row.label}
                    className="flex justify-between font-mono tabular-nums text-slate-800 dark:text-slate-300"
                  >
                    <span className="font-sans">{row.label}</span>
                    <span>
                      {row.total > 0
                        ? `${row.correct}/${row.total} (${row.accuracyPct.toFixed(1)}%)`
                        : '0/0 (—)'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {summary.byMarket.length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400 font-medium mb-1.5">
                  By Market &amp; Window
                </div>
                <div className="space-y-1.5">
                  {summary.byMarket.slice(0, 4).map((row) => (
                    <div
                      key={row.label}
                      className="flex justify-between font-mono tabular-nums text-slate-800 dark:text-slate-300"
                    >
                      <span>{row.label}</span>
                      <span>
                        {row.correct}/{row.total} ({row.accuracyPct.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                  {summary.byWindow.slice(0, 3).map((row) => (
                    <div
                      key={row.label}
                      className="flex justify-between font-mono tabular-nums text-slate-500 dark:text-slate-400"
                    >
                      <span>Window {row.label}</span>
                      <span>
                        {row.correct}/{row.total} ({row.accuracyPct.toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Signal Ledger Table */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Historical Signal Ledger
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Persisted in IndexedDB with independent next-tick outcome verification
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'ALL' | SignalCategory)}
              className="rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Categories</option>
              <option value="MATCHES">MATCHES</option>
              <option value="DIFFERS">DIFFERS</option>
              <option value="EVEN">EVEN</option>
              <option value="ODD">ODD</option>
            </select>

            <select
              value={outcomeFilter}
              onChange={(e) =>
                setOutcomeFilter(
                  e.target.value as 'ALL' | 'CORRECT' | 'INCORRECT' | 'PENDING'
                )
              }
              className="rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">All Outcomes</option>
              <option value="CORRECT">Correct</option>
              <option value="INCORRECT">Incorrect</option>
              <option value="PENDING">Pending</option>
            </select>

            <button
              type="button"
              onClick={onExportSignalsCsv}
              disabled={records.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No signal records match the current filter. Tap Scan on any Digit Analysis card to log
            and verify live ticks.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-xs font-mono tabular-nums">
              <thead className="sticky top-0 bg-white dark:bg-[#0E1522]">
                <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 text-left font-medium">Time</th>
                  <th className="py-2 text-left font-medium">Market</th>
                  <th className="py-2 text-left font-medium">Category</th>
                  <th className="py-2 text-right font-medium">Target</th>
                  <th className="py-2 text-right font-medium">Est. Prob</th>
                  <th className="py-2 text-right font-medium">Confidence Score</th>
                  <th className="py-2 text-right font-medium">Next Digit</th>
                  <th className="py-2 text-right font-medium">Outcome</th>
                  <th className="py-2 text-left font-medium pl-4">Reliability · Window</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filtered.slice(0, 150).map((rec) => {
                  const hasScore =
                    typeof rec.confidenceScore === 'number' && Number.isFinite(rec.confidenceScore);
                  const score = hasScore ? Math.max(0, Math.min(100, Math.round(rec.confidenceScore!))) : null;
                  const scoreColorClass =
                    score === null
                      ? 'text-slate-400'
                      : score >= 70
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : score >= 45
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400';
                  const barColorClass =
                    score === null
                      ? 'bg-slate-300 dark:bg-slate-700'
                      : score >= 70
                        ? 'bg-emerald-500'
                        : score >= 45
                          ? 'bg-amber-500'
                          : 'bg-rose-500';

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 text-left text-slate-500 dark:text-slate-400">
                        {new Date(rec.generatedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2 text-left text-slate-800 dark:text-slate-200">
                        {rec.symbol}
                      </td>
                      <td className="py-2 text-left font-semibold text-emerald-700 dark:text-emerald-300">
                        {rec.category}
                      </td>
                      <td className="py-2 text-right font-bold text-slate-900 dark:text-slate-100">
                        {rec.category === 'EVEN' || rec.category === 'ODD'
                          ? rec.category
                          : rec.targetDigit}
                      </td>
                      <td className="py-2 text-right text-slate-700 dark:text-slate-300">
                        {(rec.estimatedProbability * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 text-right">
                        {score !== null ? (
                          <div className="inline-flex items-center justify-end gap-2">
                            <div className="hidden sm:block w-14 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barColorClass}`}
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className={`font-semibold ${scoreColorClass}`}>{score}%</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 text-right font-bold text-slate-900 dark:text-slate-100">
                        {rec.actualNextDigit !== null ? rec.actualNextDigit : '—'}
                      </td>
                      <td className="py-2 text-right font-sans font-medium">
                        {rec.outcome === 'CORRECT' ? (
                          <span className="text-emerald-600 dark:text-emerald-400">Correct</span>
                        ) : rec.outcome === 'INCORRECT' ? (
                          <span className="text-rose-600 dark:text-rose-400">Incorrect</span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">Pending</span>
                        )}
                      </td>
                      <td className="py-2 text-left font-sans text-slate-500 dark:text-slate-400 pl-4">
                        {rec.reliabilityTier} · {rec.windowUsed}t
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
