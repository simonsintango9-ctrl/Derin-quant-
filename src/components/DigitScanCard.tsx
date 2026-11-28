import React from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Hash, RotateCw, Zap } from 'lucide-react';
import {
  MarketSymbol,
  QuantSignal,
  SignalCategory,
  SignalQualityTier,
} from '../types/deriv';
import { MARKET_MAP } from '../constants/markets';

interface DigitScanCardProps {
  category: SignalCategory;
  market: MarketSymbol;
  signal: QuantSignal | null;
  scannedSignal: QuantSignal | null;
  secondsRemaining: number;
  isConnected: boolean;
  index: number;
  totalCount: number;
  isDragging?: boolean;
  isDragOver?: boolean;
  onScan: (category: SignalCategory) => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onDragStart?: (category: SignalCategory, e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver?: (category: SignalCategory, e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (targetCategory: SignalCategory, e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}

interface HeatmapStyle {
  containerClass: string;
  subtextClass: string;
  stepIndex: number; // 0..4 for scale indicator, -1 for insufficient data
  shortLabel: string;
}

function getReliabilityHeatmapStyle(tier: SignalQualityTier): HeatmapStyle {
  switch (tier) {
    case 'Very High Confidence':
      return {
        containerClass:
          'bg-emerald-700 border-emerald-800 text-white dark:bg-emerald-700 dark:border-emerald-500 dark:text-white',
        subtextClass: 'text-emerald-100',
        stepIndex: 4,
        shortLabel: 'Very High',
      };
    case 'High Confidence':
      return {
        containerClass:
          'bg-emerald-500/25 border-emerald-500/60 text-emerald-950 dark:bg-emerald-600/35 dark:border-emerald-500/60 dark:text-emerald-50',
        subtextClass: 'text-emerald-900/80 dark:text-emerald-200',
        stepIndex: 3,
        shortLabel: 'High',
      };
    case 'Moderate Confidence':
      return {
        containerClass:
          'bg-lime-300/45 border-lime-500/50 text-lime-950 dark:bg-teal-500/25 dark:border-teal-400/50 dark:text-teal-50',
        subtextClass: 'text-lime-900/80 dark:text-teal-200',
        stepIndex: 2,
        shortLabel: 'Moderate',
      };
    case 'Low Confidence':
      return {
        containerClass:
          'bg-yellow-200/85 border-yellow-400/70 text-yellow-950 dark:bg-yellow-500/25 dark:border-yellow-500/55 dark:text-yellow-50',
        subtextClass: 'text-yellow-900/80 dark:text-yellow-200',
        stepIndex: 1,
        shortLabel: 'Low',
      };
    case 'Very Low Confidence':
      return {
        containerClass:
          'bg-amber-200/80 border-amber-400/70 text-amber-950 dark:bg-amber-500/25 dark:border-amber-500/55 dark:text-amber-50',
        subtextClass: 'text-amber-900/80 dark:text-amber-200',
        stepIndex: 0,
        shortLabel: 'Very Low',
      };
    case 'Insufficient Data':
    default:
      return {
        containerClass:
          'bg-slate-100 border-slate-200 text-slate-700 dark:bg-slate-800/70 dark:border-slate-700 dark:text-slate-300',
        subtextClass: 'text-slate-500 dark:text-slate-400',
        stepIndex: -1,
        shortLabel: 'Insufficient',
      };
  }
}

const HEATMAP_SCALE_COLORS = [
  { label: 'Very Low', bg: 'bg-amber-300 dark:bg-amber-500/70' },
  { label: 'Low', bg: 'bg-yellow-300 dark:bg-yellow-400/80' },
  { label: 'Moderate', bg: 'bg-lime-400 dark:bg-teal-400/80' },
  { label: 'High', bg: 'bg-emerald-500 dark:bg-emerald-500' },
  { label: 'Very High', bg: 'bg-emerald-700 dark:bg-emerald-700' },
];

export const DigitScanCard: React.FC<DigitScanCardProps> = ({
  category,
  market,
  signal,
  scannedSignal,
  secondsRemaining,
  isConnected,
  index,
  totalCount,
  isDragging = false,
  isDragOver = false,
  onScan,
  onMoveLeft,
  onMoveRight,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}) => {
  const marketName = (MARKET_MAP[market] ?? MARKET_MAP['1HZ100V']).name;
  const hasScanned = scannedSignal !== null;
  const isExpired = hasScanned && secondsRemaining <= 0;
  const isActive = hasScanned && secondsRemaining > 0;
  const isMatchesOrDiffers = category === 'MATCHES' || category === 'DIFFERS';

  const activeSignalForHeatmap = scannedSignal ?? signal;
  const reliabilityTier: SignalQualityTier =
    activeSignalForHeatmap?.statisticalReliability ?? 'Insufficient Data';
  const heatmap = getReliabilityHeatmapStyle(reliabilityTier);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart?.(category, e)}
      onDragOver={(e) => onDragOver?.(category, e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop?.(category, e)}
      onDragEnd={onDragEnd}
      aria-label={`${category} signal card, position ${index + 1} of ${totalCount}`}
      className={`rounded-2xl border p-3.5 sm:p-4 flex flex-col justify-between gap-3.5 transition-all select-none ${
        isDragOver
          ? 'border-emerald-500 ring-2 ring-emerald-500/60 bg-emerald-50/40 dark:bg-emerald-950/25'
          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522]'
      } ${isDragging ? 'opacity-50 scale-[0.98]' : ''}`}
    >
      {/* Card Header */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span
            title="Drag card to reorder"
            className="hidden sm:inline-flex items-center justify-center text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing shrink-0"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <span className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 shrink-0">
            <Hash className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
          <span className="font-display text-xs sm:text-sm font-bold tracking-wide text-slate-800 dark:text-slate-100 truncate">
            {category}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center">
            <button
              type="button"
              onClick={onMoveLeft}
              disabled={index <= 0}
              aria-label={`Move ${category} earlier`}
              title="Move earlier"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveRight}
              disabled={index >= totalCount - 1}
              aria-label={`Move ${category} later`}
              title="Move later"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <span
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
              isConnected
                ? isActive
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-emerald-500'
                : 'bg-slate-300 dark:bg-slate-700'
            }`}
            title={isConnected ? 'Live stream active' : 'Disconnected'}
          />
        </div>
      </div>

      {/* Result Display or Market Prompt */}
      {hasScanned ? (
        <div
          className={`rounded-xl border p-3.5 text-center transition-colors ${
            isMatchesOrDiffers
              ? heatmap.containerClass
              : isExpired
                ? 'border-slate-200 dark:border-slate-700/80 bg-slate-100/80 dark:bg-[#090E17] text-slate-500 dark:text-slate-400'
                : 'border-emerald-200 dark:border-emerald-500/35 bg-emerald-50/70 dark:bg-emerald-950/20 text-slate-900 dark:text-slate-100'
          } ${isExpired && isMatchesOrDiffers ? 'opacity-80' : ''}`}
        >
          <div
            className={`text-[11px] font-mono font-semibold tracking-wider tabular-nums ${
              isMatchesOrDiffers ? heatmap.subtextClass : ''
            }`}
          >
            {isExpired ? 'RESULT EXPIRED' : `RESULT ACTIVE · ${secondsRemaining}s`}
          </div>

          <div className="mt-1.5 font-mono text-3xl font-bold tabular-nums">
            {category === 'EVEN' || category === 'ODD'
              ? `${(scannedSignal.estimatedProbability * 100).toFixed(1)}%`
              : scannedSignal.targetDigit}
          </div>

          <div className="mt-1 text-xs font-semibold tracking-wide">
            {scannedSignal.targetLabel || `${category} DIGIT ${scannedSignal.targetDigit}`}
          </div>

          <div
            className={`mt-1.5 text-[11px] font-mono tabular-nums ${
              isMatchesOrDiffers
                ? heatmap.subtextClass
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {category === 'EVEN' || category === 'ODD'
              ? `Hist ${(scannedSignal.historicalFrequency * 100).toFixed(1)}% · n=${scannedSignal.sampleSize}`
              : `Est. ${(scannedSignal.estimatedProbability * 100).toFixed(1)}% · n=${scannedSignal.sampleSize}`}
          </div>
          <div
            className={`mt-0.5 text-[11px] font-medium ${
              isMatchesOrDiffers
                ? heatmap.subtextClass
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {scannedSignal.statisticalReliability}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="space-y-0.5">
            <div className="text-xs text-slate-500 dark:text-slate-400">Market:</div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">
              {marketName}
            </div>
          </div>

          {signal ? (
            <div
              className={`rounded-xl border px-3 py-2.5 transition-colors ${
                isMatchesOrDiffers
                  ? heatmap.containerClass
                  : 'border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-[#090E17] text-slate-900 dark:text-slate-100'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`text-[11px] font-medium ${
                    isMatchesOrDiffers
                      ? heatmap.subtextClass
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {isMatchesOrDiffers
                    ? `Est. Probability (Digit ${signal.targetDigit})`
                    : `Est. ${category} Parity`}
                </span>
                <span className="font-mono text-base font-bold tabular-nums">
                  {(signal.estimatedProbability * 100).toFixed(1)}%
                </span>
              </div>
              <div
                className={`mt-0.5 flex items-center justify-between text-[11px] ${
                  isMatchesOrDiffers
                    ? heatmap.subtextClass
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span>{signal.statisticalReliability}</span>
                <span className="font-mono tabular-nums">n={signal.sampleSize}</span>
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              {isConnected
                ? 'Buffering live market ticks...'
                : 'Connect feed to stream live ticks'}
            </div>
          )}
        </div>
      )}

      {/* 5-Step Reliability Heatmap Scale for Matches & Differs */}
      {isMatchesOrDiffers && (
        <div className="space-y-1" aria-label={`Reliability tier heatmap: ${reliabilityTier}`}>
          <div className="grid grid-cols-5 gap-1">
            {HEATMAP_SCALE_COLORS.map((step, idx) => {
              const isCurrent = heatmap.stepIndex === idx;
              return (
                <div
                  key={step.label}
                  title={step.label}
                  className={`h-1.5 rounded-sm transition-opacity ${step.bg} ${
                    isCurrent
                      ? 'opacity-100 ring-1 ring-slate-900/50 dark:ring-white/70'
                      : 'opacity-25'
                  }`}
                />
              );
            })}
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span>Very Low</span>
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {heatmap.shortLabel}
            </span>
            <span>Very High</span>
          </div>
        </div>
      )}

      {/* Full-Width Emerald Scan CTA */}
      <button
        type="button"
        onClick={() => onScan(category)}
        disabled={!signal}
        className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all cursor-pointer"
      >
        {!signal ? (
          <span>{isConnected ? 'Waiting for ticks...' : 'Connect to Scan'}</span>
        ) : hasScanned ? (
          <>
            <RotateCw className="h-4 w-4" />
            Scan Again
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Scan
          </>
        )}
      </button>
    </div>
  );
};
