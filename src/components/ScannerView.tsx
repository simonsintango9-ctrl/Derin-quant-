import React from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { MarketSymbol, ScannerMarketSummary, UserSettings } from '../types/deriv';
import { MultiMarketComparisonChart } from './charts/QuantCharts';

interface ScannerViewProps {
  summaries: ScannerMarketSummary[];
  activeMarket: MarketSymbol;
  isConnected: boolean;
  isScanning: boolean;
  lastScanAt: number | null;
  settings: UserSettings;
  onScanNow: () => void;
  onSelectMarket: (symbol: MarketSymbol) => void;
}

export const ScannerView: React.FC<ScannerViewProps> = ({
  summaries,
  activeMarket,
  isConnected,
  isScanning,
  lastScanAt,
  settings,
  onScanNow,
  onSelectMarket,
}) => {
  const isDark = settings.theme === 'dark';
  const ranked = [...summaries].sort(
    (a, b) => b.chiSquareStatistic - a.chiSquareStatistic
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Multi-Market Synthetic Volatility Dispersion
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Independent 10-index statistical screening using staggered snapshot queries
              {lastScanAt ? ` · Last scanned ${new Date(lastScanAt).toLocaleTimeString()}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onScanNow}
            disabled={!isConnected || isScanning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning Markets...' : 'Scan All Markets'}
          </button>
        </div>

        {settings.chartVisibility.multiMarketComparison && (
          <MultiMarketComparisonChart markets={ranked} isDark={isDark} />
        )}

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            Markets are ranked by historical Chi-Square distribution dispersion. A higher
            dispersion rank does not imply superior future predictability or guaranteed outcomes.
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <th className="py-2.5 text-left font-medium">Rank</th>
                <th className="py-2.5 text-left font-medium">Market</th>
                <th className="py-2.5 text-left font-medium">Category</th>
                <th className="py-2.5 text-right font-medium">Last Quote</th>
                <th className="py-2.5 text-right font-medium">Digit</th>
                <th className="py-2.5 text-right font-medium">Sample</th>
                <th className="py-2.5 text-right font-medium">χ² (df=9)</th>
                <th className="py-2.5 text-right font-medium">p-value</th>
                <th className="py-2.5 text-right font-medium">Hot / Cold</th>
                <th className="py-2.5 text-right font-medium">Condition</th>
                <th className="py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {ranked.map((row, idx) => {
                const isSelected = row.symbol === activeMarket;
                return (
                  <tr
                    key={row.symbol}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                    }`}
                  >
                    <td className="py-2.5 text-left font-mono text-slate-500 dark:text-slate-400">
                      #{idx + 1}
                    </td>
                    <td className="py-2.5 text-left">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {row.name}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">{row.symbol}</div>
                    </td>
                    <td className="py-2.5 text-left text-slate-500 dark:text-slate-400">
                      {row.category}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                      {row.latestQuote ?? '—'}
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      {row.latestDigit !== null ? row.latestDigit : '—'}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                      {row.sampleCount}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                      {row.sampleCount >= 10 ? row.chiSquareStatistic.toFixed(2) : '—'}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                      {row.sampleCount >= 10 ? row.chiSquarePValue.toFixed(3) : '—'}
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                      {row.topHotDigit !== null && row.topColdDigit !== null
                        ? `${row.topHotDigit} (${row.topHotPct?.toFixed(0)}%) / ${row.topColdDigit} (${row.topColdPct?.toFixed(0)}%)`
                        : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.status === 'error' ? (
                        <span className="text-rose-600 dark:text-rose-400">Error</span>
                      ) : row.sampleCount < 50 ? (
                        <span className="text-slate-400">Pending</span>
                      ) : row.anomalyDetected ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Divergent
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">Uniform</span>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectMarket(row.symbol)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {isSelected ? 'Active' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
