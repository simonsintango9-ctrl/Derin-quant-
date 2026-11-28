import React, { useMemo } from 'react';
import { AlertCircle, Brain, Gauge, Loader2, Sparkles } from 'lucide-react';
import { analyzeDigitConfidences } from '../engines/confidenceAnalyzer';
import {
  AIDigitPrediction,
  MarkovAnalysisResult,
  ProbabilityReport,
  QuantSignal,
  StatisticalAnalysisResult,
} from '../types/deriv';

interface AIConfidencePanelProps {
  marketName: string;
  stats: StatisticalAnalysisResult;
  markov: MarkovAnalysisResult;
  probability: ProbabilityReport;
  minSampleSize: number;
  liveSignals: {
    MATCHES: QuantSignal | null;
    DIFFERS: QuantSignal | null;
    EVEN: QuantSignal | null;
    ODD: QuantSignal | null;
  };
  aiPrediction: AIDigitPrediction | null;
  isPredicting: boolean;
  aiError: string | null;
  onRunAIPrediction: () => void;
}

export const AIConfidencePanel: React.FC<AIConfidencePanelProps> = ({
  marketName,
  stats,
  markov,
  probability,
  minSampleSize,
  liveSignals,
  aiPrediction,
  isPredicting,
  aiError,
  onRunAIPrediction,
}) => {
  const digitConfidences = useMemo(
    () => analyzeDigitConfidences(stats, markov, probability, minSampleSize),
    [stats, markov, probability, minSampleSize]
  );

  const rankedDigits = useMemo(
    () => [...digitConfidences].sort((a, b) => b.confidenceScore - a.confidenceScore),
    [digitConfidences]
  );

  const topDigit = rankedDigits[0] ?? null;

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Confidence Analyser for Digits (0-9) */}
      <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Digit Confidence Analyser (0–9)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Calibrated from statistical standard deviation, z-score dispersion &amp; tick volatility
              </p>
            </div>
          </div>

          {topDigit && stats.windowSize > 0 && (
            <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
              Peak: Digit {topDigit.digit} ({topDigit.confidenceScore}%)
            </span>
          )}
        </div>

        {/* Volatility & Standard Deviation Telemetry Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-slate-500 dark:text-slate-400">Freq Std Dev (σ)</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.frequencyStdDev.toFixed(2)}%
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-slate-500 dark:text-slate-400">Tick Volatility</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.tickVolatility.toFixed(4)}%
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-slate-500 dark:text-slate-400">Quote Std Dev</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {stats.quoteStdDev.toFixed(3)}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-slate-500 dark:text-slate-400">Normalized Entropy</div>
            <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {(stats.normalizedEntropy * 100).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* 0-9 Digit Confidence Meter Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {digitConfidences.map((item) => {
            const isPeak = topDigit && topDigit.digit === item.digit && stats.windowSize > 0;
            const barColor =
              item.confidenceScore >= 70
                ? 'bg-emerald-500'
                : item.confidenceScore >= 45
                  ? 'bg-amber-500'
                  : 'bg-slate-400 dark:bg-slate-600';

            return (
              <div
                key={item.digit}
                className={`rounded-xl border p-2.5 space-y-1.5 transition-colors ${
                  isPeak
                    ? 'border-emerald-500/60 bg-emerald-50/60 dark:bg-emerald-950/25'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#090E17]'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-xs tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    D{item.digit}
                  </span>
                  <span
                    className={`font-semibold ${
                      item.confidenceScore >= 70
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : item.confidenceScore >= 45
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {item.confidenceScore}%
                  </span>
                </div>

                <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${item.confidenceScore}%` }}
                  />
                </div>

                <div className="flex items-center justify-between font-mono text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{item.empiricalPct.toFixed(1)}%</span>
                  <span>
                    {item.zScore >= 0 ? '+' : ''}
                    {item.zScore.toFixed(1)}σ
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Category Confidence Scores Summary */}
        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs font-mono tabular-nums">
          {(['MATCHES', 'DIFFERS', 'EVEN', 'ODD'] as const).map((cat) => {
            const sig = liveSignals[cat];
            return (
              <div key={cat} className="text-center">
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{cat}</div>
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {sig ? `${sig.confidenceScore}%` : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Digit Prediction Panel (Server-side Gemini 4 Hydrogen) */}
      <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 flex flex-col justify-between gap-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  AI Digit Prediction
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Statistical synthesis on {marketName}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onRunAIPrediction}
              disabled={isPredicting || stats.windowSize === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPredicting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{aiPrediction ? 'Refresh AI Prediction' : 'Run AI Prediction'}</span>
                </>
              )}
            </button>
          </div>

          {aiError && (
            <div className="rounded-xl border border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/25 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{aiError}</span>
            </div>
          )}

          {aiPrediction ? (
            <div className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/25 p-3 text-center">
                  <div className="text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
                    Focus Digit
                  </div>
                  <div className="mt-0.5 font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                    {aiPrediction.predictedDigit}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    Alt: {aiPrediction.runnerUpDigit}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E17] p-3 text-center">
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    AI Confidence
                  </div>
                  <div className="mt-0.5 font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                    {aiPrediction.aiConfidenceScore}%
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    {aiPrediction.confidenceTier}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#090E17] p-3 text-center">
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    Suggested Setup
                  </div>
                  <div className="mt-1 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {aiPrediction.recommendedCategory}
                  </div>
                  <div className="mt-0.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                    Differs: {aiPrediction.differsAvoidDigit}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
                <span>Parity Bias: {aiPrediction.parityBias}</span>
                <span>Volatility: {aiPrediction.volatilityRegime}</span>
              </div>

              <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {aiPrediction.rationale}
              </p>

              {aiPrediction.riskFactors.length > 0 && (
                <ul className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400 list-disc list-inside">
                  {aiPrediction.riskFactors.map((factor, idx) => (
                    <li key={idx}>{factor}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {stats.windowSize > 0
                  ? 'Ready for live AI digit & volatility synthesis'
                  : 'Connect to a live feed to stream ticks before running AI prediction'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Evaluates z-scores, Markov lift, entropy, and tick volatility from your active window.
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Probabilistic research only — no guaranteed outcomes</span>
          {aiPrediction && (
            <span className="font-mono tabular-nums">
              {new Date(aiPrediction.generatedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
