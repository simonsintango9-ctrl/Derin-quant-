import React, { useState } from 'react';
import { MarkovAnalysisResult } from '../types/deriv';

interface MarkovHeatmapProps {
  markov: MarkovAnalysisResult;
  isDark?: boolean;
}

export const MarkovHeatmap: React.FC<MarkovHeatmapProps> = ({ markov, isDark = false }) => {
  const [useSmoothed, setUseSmoothed] = useState(true);
  const [hoveredCell, setHoveredCell] = useState<{ from: number; to: number } | null>(null);

  const matrix = useSmoothed ? markov.smoothedMatrix : markov.rawMatrix;

  const cellStyle = (prob: number, isActiveRow: boolean) => {
    const intensity = Math.max(0, Math.min(1, (prob - 0.03) / 0.22));
    if (prob >= 0.14) {
      return {
        backgroundColor: isDark
          ? `rgba(16, 185, 129, ${0.22 + intensity * 0.45})`
          : `rgba(16, 185, 129, ${0.18 + intensity * 0.35})`,
        color: isDark ? '#ECFDF5' : '#064E3B',
      };
    }
    if (prob <= 0.06) {
      return {
        backgroundColor: isDark ? 'rgba(248, 113, 113, 0.14)' : 'rgba(239, 68, 68, 0.10)',
        color: isDark ? '#FCA5A5' : '#991B1B',
      };
    }
    return {
      backgroundColor: isActiveRow
        ? isDark
          ? `rgba(56, 189, 248, ${0.1 + intensity * 0.2})`
          : `rgba(14, 165, 233, ${0.08 + intensity * 0.15})`
        : isDark
          ? `rgba(148, 163, 184, ${0.04 + intensity * 0.12})`
          : `rgba(15, 23, 42, ${0.02 + intensity * 0.06})`,
      color: isDark ? '#CBD5E1' : '#334155',
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <span>Transitions observed: </span>
          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-200">
            {markov.sampleTransitions}
          </span>
          <span className="mx-2 text-slate-400">·</span>
          <span>Dirichlet α = </span>
          <span className="font-mono tabular-nums text-slate-900 dark:text-slate-200">
            {markov.alphaSmoothing}
          </span>
          {markov.currentLastDigit !== null && (
            <>
              <span className="mx-2 text-slate-400">·</span>
              <span>Active state row: </span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-300">
                Digit {markov.currentLastDigit}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#070B12] p-1 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setUseSmoothed(true)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              useSmoothed
                ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Smoothed P(j|i)
          </button>
          <button
            type="button"
            onClick={() => setUseSmoothed(false)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              !useSmoothed
                ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Raw Empirical
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-center font-mono text-xs tabular-nums">
          <thead>
            <tr>
              <th className="p-1.5 text-left text-[11px] font-medium text-slate-500 border-b border-slate-200 dark:border-slate-800">
                From \ To
              </th>
              {Array.from({ length: 10 }, (_, d) => (
                <th
                  key={d}
                  className="p-1.5 font-semibold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800"
                >
                  {d}
                </th>
              ))}
              <th className="p-1.5 text-right text-[11px] font-medium text-slate-500 border-b border-slate-200 dark:border-slate-800">
                N
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, fromDigit) => {
              const isCurrentRow = markov.currentLastDigit === fromDigit;
              return (
                <tr
                  key={fromDigit}
                  className={isCurrentRow ? 'ring-1 ring-inset ring-emerald-500/50' : ''}
                >
                  <td
                    className={`p-1.5 text-left font-semibold border-r border-slate-200 dark:border-slate-800 ${
                      isCurrentRow
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {fromDigit}
                  </td>
                  {row.map((prob, toDigit) => {
                    const count = markov.countMatrix[fromDigit][toDigit];
                    return (
                      <td
                        key={toDigit}
                        onMouseEnter={() => setHoveredCell({ from: fromDigit, to: toDigit })}
                        onMouseLeave={() => setHoveredCell(null)}
                        style={cellStyle(prob, isCurrentRow)}
                        className="p-1.5 border border-slate-200/70 dark:border-slate-900/70 transition-colors cursor-default"
                      >
                        {(prob * 100).toFixed(1)}%
                        <div className="text-[10px] opacity-65">{count}</div>
                      </td>
                    );
                  })}
                  <td className="p-1.5 text-right text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800">
                    {markov.rowTotals[fromDigit]}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="min-h-[20px] text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
        {hoveredCell ? (
          <span>
            Transition {hoveredCell.from} → {hoveredCell.to}:{' '}
            {(matrix[hoveredCell.from][hoveredCell.to] * 100).toFixed(2)}% (
            {markov.countMatrix[hoveredCell.from][hoveredCell.to]} /{' '}
            {markov.rowTotals[hoveredCell.from]} observations)
          </span>
        ) : (
          <span>Hover any cell to inspect exact transition count and conditional probability.</span>
        )}
      </div>
    </div>
  );
};
