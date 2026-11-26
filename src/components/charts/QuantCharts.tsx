import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  ChartData,
  ChartOptions,
  registerables,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  DigitMetric,
  PerformanceSummary,
  ProbabilityReport,
  ScannerMarketSummary,
  TickRecord,
} from '../../types/deriv';
import { runStatisticalAnalysis } from '../../engines/statisticalEngine';

// Register all Chart.js controllers, scales, elements, and plugins to prevent mixed-chart controller errors
ChartJS.register(...registerables);

const MONO_FONT = "'JetBrains Mono', monospace";

function useChartTheme(isDark: boolean) {
  return useMemo(
    () => ({
      gridColor: isDark ? 'rgba(148, 163, 184, 0.09)' : 'rgba(15, 23, 42, 0.07)',
      tickColor: isDark ? '#94A3B8' : '#64748B',
      axisLabelColor: isDark ? '#E2E8F0' : '#0F172A',
      legendColor: isDark ? '#94A3B8' : '#475569',
      tooltipBg: isDark ? '#0F172A' : '#FFFFFF',
      tooltipBorder: isDark ? '#334155' : '#CBD5E1',
      tooltipText: isDark ? '#F1F5F9' : '#0F172A',
    }),
    [isDark]
  );
}

export const DigitFrequencyChart: React.FC<{
  digits: DigitMetric[];
  windowSize: number;
  isDark?: boolean;
}> = React.memo(({ digits, windowSize, isDark = false }) => {
  const theme = useChartTheme(isDark);

  const data = useMemo(
    () => ({
      labels: digits.map((d) => String(d.digit)),
      datasets: [
        {
          label: `Observed % (${windowSize} ticks)`,
          data: digits.map((d) => Number(d.percentage.toFixed(2))),
          backgroundColor: digits.map((d) =>
            d.isHot
              ? 'rgba(16, 185, 129, 0.80)'
              : d.isCold
                ? 'rgba(239, 68, 68, 0.68)'
                : isDark
                  ? 'rgba(56, 189, 248, 0.38)'
                  : 'rgba(14, 165, 233, 0.45)'
          ),
          borderColor: digits.map((d) =>
            d.isHot ? '#10B981' : d.isCold ? '#EF4444' : '#0EA5E9'
          ),
          borderWidth: 1,
          borderRadius: 5,
        },
        {
          label: 'Uniform Baseline (10%)',
          data: new Array(10).fill(10),
          type: 'line' as const,
          borderColor: isDark ? 'rgba(148, 163, 184, 0.6)' : 'rgba(71, 85, 105, 0.55)',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    }),
    [digits, windowSize, isDark]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 160 },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: theme.legendColor,
            boxWidth: 10,
            boxHeight: 10,
            font: { family: MONO_FONT, size: 11 },
          },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          titleFont: { family: MONO_FONT, size: 12 },
          bodyFont: { family: MONO_FONT, size: 12 },
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 0) {
                const m = digits[ctx.dataIndex];
                return `Digit ${m.digit}: ${m.percentage.toFixed(2)}% (${m.count} hits · z=${m.zScore.toFixed(2)})`;
              }
              return `Baseline: 10.00%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.axisLabelColor, font: { family: MONO_FONT, size: 12, weight: 600 } },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 20,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { family: MONO_FONT, size: 11 },
            callback: (v) => `${v}%`,
          },
        },
      },
    }),
    [digits, theme]
  );

  return (
    <div className="h-60 w-full">
      <Bar data={data as unknown as ChartData<'bar'>} options={options} />
    </div>
  );
});

export const MultiWindowComparisonChart: React.FC<{
  ticks: TickRecord[];
  isDark?: boolean;
}> = React.memo(({ ticks, isDark = false }) => {
  const theme = useChartTheme(isDark);

  const data = useMemo(() => {
    if (ticks.length === 0) return null;
    const sym = ticks[ticks.length - 1].symbol;
    const s50 = runStatisticalAnalysis(sym, ticks, 50);
    const s100 = runStatisticalAnalysis(sym, ticks, 100);
    const s200 = runStatisticalAnalysis(sym, ticks, 200);

    return {
      labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
      datasets: [
        {
          label: `50 Ticks (n=${s50.windowSize})`,
          data: s50.digits.map((d) => Number(d.percentage.toFixed(2))),
          backgroundColor: 'rgba(16, 185, 129, 0.78)',
          borderRadius: 3,
        },
        {
          label: `100 Ticks (n=${s100.windowSize})`,
          data: s100.digits.map((d) => Number(d.percentage.toFixed(2))),
          backgroundColor: 'rgba(14, 165, 233, 0.55)',
          borderRadius: 3,
        },
        {
          label: `200 Ticks (n=${s200.windowSize})`,
          data: s200.digits.map((d) => Number(d.percentage.toFixed(2))),
          backgroundColor: isDark ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)',
          borderRadius: 3,
        },
      ],
    };
  }, [ticks, isDark]);

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: theme.legendColor, boxWidth: 10, font: { family: MONO_FONT, size: 11 } },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          bodyFont: { family: MONO_FONT, size: 11 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.axisLabelColor, font: { family: MONO_FONT, size: 12 } },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 20,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { family: MONO_FONT, size: 11 },
            callback: (v) => `${v}%`,
          },
        },
      },
    }),
    [theme]
  );

  if (!data) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-slate-500">
        Awaiting tick history for multi-window comparison.
      </div>
    );
  }

  return (
    <div className="h-52 w-full">
      <Bar data={data} options={options} />
    </div>
  );
});

export const RollingFrequencyChart: React.FC<{
  probability: ProbabilityReport;
  focusDigits: number[];
  isDark?: boolean;
}> = React.memo(({ probability, focusDigits, isDark = false }) => {
  const theme = useChartTheme(isDark);
  const colors = ['#10B981', '#0EA5E9', '#F59E0B', '#EF4444'];

  const data = useMemo(() => {
    const series = probability.rollingFrequencySeries;
    return {
      labels: series.map((pt) => `#${pt.tickIndex}`),
      datasets: focusDigits.slice(0, 4).map((digit, idx) => ({
        label: `Digit ${digit}`,
        data: series.map((pt) => Number(pt.frequencies[digit].toFixed(2))),
        borderColor: colors[idx % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.25,
        pointRadius: 2,
      })),
    };
  }, [probability.rollingFrequencySeries, focusDigits]);

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: theme.legendColor, boxWidth: 10, font: { family: MONO_FONT, size: 11 } },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          bodyFont: { family: MONO_FONT, size: 11 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.tickColor, font: { family: MONO_FONT, size: 10 }, maxTicksLimit: 8 },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 25,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { family: MONO_FONT, size: 11 },
            callback: (v) => `${v}%`,
          },
        },
      },
    }),
    [theme]
  );

  if (probability.rollingFrequencySeries.length < 2) {
    return (
      <div className="h-56 flex items-center justify-center text-sm text-slate-500">
        Need at least 20 ticks to plot rolling frequency trajectories.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <Line data={data} options={options} />
    </div>
  );
});

export const ProbabilityComparisonChart: React.FC<{
  probability: ProbabilityReport;
  isDark?: boolean;
}> = React.memo(({ probability, isDark = false }) => {
  const theme = useChartTheme(isDark);

  const data = useMemo(
    () => ({
      labels: probability.estimates.map((e) => String(e.digit)),
      datasets: [
        {
          label: 'Empirical %',
          data: probability.estimates.map((e) => Number((e.empiricalProb * 100).toFixed(2))),
          backgroundColor: 'rgba(14, 165, 233, 0.55)',
          borderRadius: 3,
        },
        {
          label: 'Markov Conditional %',
          data: probability.estimates.map((e) =>
            Number(((e.markovConditionalProb ?? 0.1) * 100).toFixed(2))
          ),
          backgroundColor: 'rgba(16, 185, 129, 0.78)',
          borderRadius: 3,
        },
        {
          label: 'Shrunk Blend %',
          data: probability.estimates.map((e) => Number((e.blendedEstimate * 100).toFixed(2))),
          type: 'line' as const,
          borderColor: '#F59E0B',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
        },
      ],
    }),
    [probability.estimates]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: theme.legendColor, boxWidth: 10, font: { family: MONO_FONT, size: 11 } },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          bodyFont: { family: MONO_FONT, size: 11 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.axisLabelColor, font: { family: MONO_FONT, size: 12 } },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 20,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { family: MONO_FONT, size: 11 },
            callback: (v) => `${v}%`,
          },
        },
      },
    }),
    [theme]
  );

  return (
    <div className="h-56 w-full">
      <Bar data={data as unknown as ChartData<'bar'>} options={options} />
    </div>
  );
});

export const SignalPerformanceChart: React.FC<{
  summary: PerformanceSummary;
  isDark?: boolean;
}> = React.memo(({ summary, isDark = false }) => {
  const theme = useChartTheme(isDark);

  const data = useMemo(
    () => ({
      labels: summary.cumulativeAccuracySeries.map((pt) => `#${pt.index}`),
      datasets: [
        {
          label: 'Cumulative Out-of-Sample Accuracy %',
          data: summary.cumulativeAccuracySeries.map((pt) => Number(pt.accuracyPct.toFixed(2))),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.14)',
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: summary.cumulativeAccuracySeries.length > 40 ? 0 : 3,
        },
      ],
    }),
    [summary.cumulativeAccuracySeries]
  );

  const options: ChartOptions<'line'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: theme.legendColor, boxWidth: 10, font: { family: MONO_FONT, size: 11 } },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.tickColor, font: { family: MONO_FONT, size: 10 }, maxTicksLimit: 10 },
        },
        y: {
          min: 0,
          max: 100,
          grid: { color: theme.gridColor },
          ticks: {
            color: theme.tickColor,
            font: { family: MONO_FONT, size: 11 },
            callback: (v) => `${v}%`,
          },
        },
      },
    }),
    [theme]
  );

  if (summary.cumulativeAccuracySeries.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-slate-500">
        No evaluated out-of-sample signals yet. Scan a digit strategy to log and verify live ticks.
      </div>
    );
  }

  return (
    <div className="h-52 w-full">
      <Line data={data} options={options} />
    </div>
  );
});

export const MultiMarketComparisonChart: React.FC<{
  markets: ScannerMarketSummary[];
  isDark?: boolean;
}> = React.memo(({ markets, isDark = false }) => {
  const theme = useChartTheme(isDark);

  const sorted = useMemo(
    () => [...markets].sort((a, b) => b.chiSquareStatistic - a.chiSquareStatistic),
    [markets]
  );

  const data = useMemo(
    () => ({
      labels: sorted.map((m) => m.symbol),
      datasets: [
        {
          label: 'Chi-Square Statistic (df=9)',
          data: sorted.map((m) => Number(m.chiSquareStatistic.toFixed(2))),
          backgroundColor: sorted.map((m) =>
            m.anomalyDetected ? 'rgba(245, 158, 11, 0.8)' : 'rgba(16, 185, 129, 0.65)'
          ),
          borderRadius: 4,
        },
      ],
    }),
    [sorted]
  );

  const options: ChartOptions<'bar'> = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 150 },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { color: theme.legendColor, boxWidth: 10, font: { family: MONO_FONT, size: 11 } },
        },
        tooltip: {
          backgroundColor: theme.tooltipBg,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          bodyFont: { family: MONO_FONT, size: 11 },
          callbacks: {
            label: (ctx) => {
              const m = sorted[ctx.dataIndex];
              return `χ²=${m.chiSquareStatistic.toFixed(2)} · p=${m.chiSquarePValue.toFixed(3)} · n=${m.sampleCount}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: theme.axisLabelColor, font: { family: MONO_FONT, size: 11 } },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 20,
          grid: { color: theme.gridColor },
          ticks: { color: theme.tickColor, font: { family: MONO_FONT, size: 11 } },
        },
      },
    }),
    [sorted, theme]
  );

  return (
    <div className="h-56 w-full">
      <Bar data={data} options={options} />
    </div>
  );
});
