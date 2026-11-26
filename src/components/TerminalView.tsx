import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Clock,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { MARKET_MAP, SUPPORTED_MARKETS } from '../constants/markets';
import {
  ConnectionStatusInfo,
  MarketSymbol,
  ProbabilityReport,
  QuantSignal,
  SignalCategory,
  StatisticalAnalysisResult,
  TickRecord,
  UserSettings,
  WindowPreset,
} from '../types/deriv';
import { DigitFrequencyChart, MultiWindowComparisonChart } from './charts/QuantCharts';
import { DigitScanCard } from './DigitScanCard';

export interface ScannedCardState {
  signal: QuantSignal;
  secondsRemaining: number;
}

interface TerminalViewProps {
  market: MarketSymbol;
  connection: ConnectionStatusInfo;
  ticks: TickRecord[];
  stats: StatisticalAnalysisResult;
  probability: ProbabilityReport;
  liveSignals: {
    MATCHES: QuantSignal | null;
    DIFFERS: QuantSignal | null;
    EVEN: QuantSignal | null;
    ODD: QuantSignal | null;
  };
  scannedCards: Partial<Record<SignalCategory, ScannedCardState>>;
  settings: UserSettings;
  onSelectMarket: (symbol: MarketSymbol) => void;
  onChangeWindowPreset: (preset: WindowPreset) => void;
  onScanCategory: (category: SignalCategory) => void;
  onGenerateAllSignals: () => void;
  onToggleAutoGenerateSignals: () => void;
  onReorderSignalCards: (nextOrder: SignalCategory[]) => void;
  onToggleConnection: () => void;
  onReconnectNow: () => void;
  onSwitchToLab: () => void;
}

const DEFAULT_SIGNAL_CARD_ORDER: SignalCategory[] = ['MATCHES', 'DIFFERS', 'EVEN', 'ODD'];

export const TerminalView: React.FC<TerminalViewProps> = ({
  market,
  connection,
  ticks,
  stats,
  probability,
  liveSignals,
  scannedCards,
  settings,
  onSelectMarket,
  onChangeWindowPreset,
  onScanCategory,
  onGenerateAllSignals,
  onToggleAutoGenerateSignals,
  onReorderSignalCards,
  onToggleConnection,
  onReconnectNow,
  onSwitchToLab,
}) => {
  const [draggedCategory, setDraggedCategory] = useState<SignalCategory | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<SignalCategory | null>(null);

  const cardOrder =
    settings.signalCardOrder && settings.signalCardOrder.length === 4
      ? settings.signalCardOrder
      : DEFAULT_SIGNAL_CARD_ORDER;
  const isCustomOrder = cardOrder.some((cat, idx) => cat !== DEFAULT_SIGNAL_CARD_ORDER[idx]);

  const moveCard = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= cardOrder.length ||
      toIndex >= cardOrder.length
    ) {
      return;
    }
    const next = [...cardOrder];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    onReorderSignalCards(next);
  };

  const handleCardDragStart = (
    category: SignalCategory,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    setDraggedCategory(category);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', category);
  };

  const handleCardDragOver = (
    category: SignalCategory,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCategory !== category) {
      setDragOverCategory(category);
    }
  };

  const handleCardDrop = (
    targetCategory: SignalCategory,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    const sourceCategory =
      draggedCategory ?? (e.dataTransfer.getData('text/plain') as SignalCategory);
    if (sourceCategory && sourceCategory !== targetCategory) {
      const fromIndex = cardOrder.indexOf(sourceCategory);
      const toIndex = cardOrder.indexOf(targetCategory);
      moveCard(fromIndex, toIndex);
    }
    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  const handleCardDragEnd = () => {
    setDraggedCategory(null);
    setDragOverCategory(null);
  };
  const isDark = settings.theme === 'dark';
  const isConnected = connection.state === 'connected';
  const latestTick = ticks.length > 0 ? ticks[ticks.length - 1] : null;
  const previousTick = ticks.length > 1 ? ticks[ticks.length - 2] : null;
  const marketMeta = MARKET_MAP[market];

  const priceDelta =
    latestTick && previousTick ? latestTick.quote - previousTick.quote : 0;

  const recentTicksReversed = [...ticks.slice(-24)].reverse();

  // Contract Analysis metrics: Parity (Even/Odd) & Over/Under (0-4 vs 5-9)
  const contractBreakdown = useMemo(() => {
    const evenPct = stats.digits
      .filter((d) => d.digit % 2 === 0)
      .reduce((s, d) => s + d.percentage, 0);
    const oddPct = 100 - evenPct;
    const under5Pct = stats.digits
      .filter((d) => d.digit <= 4)
      .reduce((s, d) => s + d.percentage, 0);
    const over4Pct = 100 - under5Pct;
    return { evenPct, oddPct, under5Pct, over4Pct };
  }, [stats.digits]);

  const endpointHost = connection.endpoint.replace(/^wss?:\/\//, '').split('/')[0];
  const isFeedTransitioning =
    connection.state === 'connecting' || connection.state === 'reconnecting';
  const feedStatusText =
    connection.state === 'connected'
      ? 'Live Feed Connected'
      : connection.state === 'connecting'
        ? 'Connecting to Deriv Feed...'
        : connection.state === 'reconnecting'
          ? `Reconnecting to Feed (Attempt #${connection.reconnectAttempt})...`
          : connection.state === 'error'
            ? 'Feed Connection Error'
            : 'Feed Disconnected';

  return (
    <div className="space-y-6">
      {/* Live Market Feed Connection Bar */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`h-2.5 w-2.5 rounded-full shrink-0 ${
              isConnected
                ? 'bg-emerald-500 animate-pulse'
                : isFeedTransitioning
                  ? 'bg-amber-500 animate-pulse'
                  : connection.state === 'error'
                    ? 'bg-rose-500'
                    : 'bg-slate-400'
            }`}
          />
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {feedStatusText}
            </div>
            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums truncate">
              {endpointHost} · App ID {connection.appId}
              {connection.latencyMs ? ` · ${connection.latencyMs}ms` : ''}
              {latestTick ? ` · Last tick ${new Date(latestTick.epoch * 1000).toLocaleTimeString()}` : ''}
              {connection.errorMessage && !isConnected ? ` · ${connection.errorMessage}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReconnectNow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/80 dark:hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFeedTransitioning ? 'animate-spin' : ''}`} />
            <span>Reconnect</span>
          </button>

          <button
            type="button"
            onClick={onToggleConnection}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isConnected || isFeedTransitioning
                ? 'border border-slate-200 dark:border-slate-700 bg-white hover:bg-slate-100 dark:bg-[#090E17] dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {isConnected || isFeedTransitioning ? (
              <>
                <WifiOff className="h-3.5 w-3.5" />
                <span>Disconnect</span>
              </>
            ) : (
              <>
                <Wifi className="h-3.5 w-3.5" />
                <span>Connect Feed</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Top Row: Select Market (Left) + Live Price & Window Controls (Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Select Market Card matching screenshot */}
        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <label
              htmlFor="dashboard-market-select"
              className="block text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              Select Market
            </label>

            <div className="relative">
              <span
                className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full ${
                  isConnected ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <select
                id="dashboard-market-select"
                value={market}
                onChange={(e) => onSelectMarket(e.target.value as MarketSymbol)}
                className="w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#070B12] pl-8 pr-10 py-3 text-sm font-medium text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <optgroup label="Volatility Indices (1-Second)">
                  {SUPPORTED_MARKETS.filter((m) => m.category === 'Volatility (1s)').map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Standard Volatility Indices">
                  {SUPPORTED_MARKETS.filter((m) => m.category === 'Standard Volatility').map(
                    (m) => (
                      <option key={m.symbol} value={m.symbol}>
                        {m.name}
                      </option>
                    )
                  )}
                </optgroup>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>Symbol: {market}</span>
            <span>
              {latestTick ? `Pip ${latestTick.pipSize} (${latestTick.decimals}dp)` : marketMeta.category}
            </span>
          </div>
        </div>

        {/* Live Market Price + Extracted Last Digit + Analysis Window */}
        <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Live Quote · {marketMeta.name}
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="font-mono text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {latestTick ? latestTick.formattedQuote : '—'}
                </span>
                {latestTick && previousTick && (
                  <span
                    className={`inline-flex items-center gap-0.5 font-mono text-xs font-medium tabular-nums ${
                      priceDelta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : priceDelta < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {priceDelta > 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    ) : priceDelta < 0 ? (
                      <ArrowDownRight className="h-3.5 w-3.5" />
                    ) : null}
                    {priceDelta >= 0 ? '+' : ''}
                    {priceDelta.toFixed(latestTick.decimals)}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Last Digit</div>
                <div className="font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  {latestTick
                    ? new Date(latestTick.epoch * 1000).toLocaleTimeString()
                    : 'Waiting'}
                </div>
              </div>
              <div className="h-14 w-14 rounded-2xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center">
                <span className="font-mono text-3xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {latestTick ? latestTick.lastDigit : '—'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 font-mono text-xs tabular-nums overflow-x-auto">
              <span className="text-slate-400 mr-1">Recent:</span>
              {ticks.slice(-8).map((t) => (
                <span
                  key={t.epoch}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  {t.lastDigit}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#070B12] p-1 border border-slate-200 dark:border-slate-800">
              {([50, 100, 200, 'custom'] as WindowPreset[]).map((preset) => (
                <button
                  key={String(preset)}
                  type="button"
                  onClick={() => onChangeWindowPreset(preset)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    settings.analysisWindowPreset === preset
                      ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {preset === 'custom' ? `${settings.customWindowSize}t` : `${preset}t`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DIGIT ANALYSIS: Reorderable 2x2 / 4-col Scan Grid */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
              Digit Analysis
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              · {stats.windowSize} ticks
            </span>
            {isCustomOrder && (
              <button
                type="button"
                onClick={() => onReorderSignalCards([...DEFAULT_SIGNAL_CARD_ORDER])}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Order
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleAutoGenerateSignals}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                settings.autoGenerateSignals
                  ? 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0E1522] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
              title="Automatically generate and refresh signals as live ticks arrive"
            >
              {settings.autoGenerateSignals ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>Auto-Generate: {settings.autoGenerateSignals ? 'ON' : 'OFF'}</span>
            </button>

            <button
              type="button"
              onClick={onGenerateAllSignals}
              disabled={ticks.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Generate All</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {cardOrder.map((cat, idx) => {
            const scanned = scannedCards[cat];
            return (
              <DigitScanCard
                key={cat}
                category={cat}
                market={market}
                signal={liveSignals[cat]}
                scannedSignal={scanned?.signal ?? null}
                secondsRemaining={scanned?.secondsRemaining ?? 0}
                isConnected={isConnected}
                index={idx}
                totalCount={cardOrder.length}
                isDragging={draggedCategory === cat}
                isDragOver={dragOverCategory === cat && draggedCategory !== cat}
                onScan={onScanCategory}
                onMoveLeft={() => moveCard(idx, idx - 1)}
                onMoveRight={() => moveCard(idx, idx + 1)}
                onDragStart={handleCardDragStart}
                onDragOver={handleCardDragOver}
                onDragLeave={() => {
                  if (dragOverCategory === cat) {
                    setDragOverCategory(null);
                  }
                }}
                onDrop={handleCardDrop}
                onDragEnd={handleCardDragEnd}
              />
            );
          })}
        </div>
      </section>

      {/* Anomaly Banner if active */}
      {probability.anomalies.length > 0 && ticks.length > 0 && (
        <section className="rounded-xl border border-amber-300 dark:border-amber-500/35 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong className="font-semibold">{probability.anomalies[0].title}:</strong>{' '}
              {probability.anomalies[0].description}
            </span>
          </div>
          <button
            type="button"
            onClick={onSwitchToLab}
            className="text-xs font-medium text-amber-800 dark:text-amber-300 underline underline-offset-2"
          >
            Inspect in Analysis Lab
          </button>
        </section>
      )}

      {/* CONTRACT ANALYSIS Section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xs font-semibold tracking-wider uppercase text-slate-500 dark:text-slate-400">
            Contract Analysis
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            χ² = {probability.chiSquareStatistic.toFixed(2)} (p={probability.chiSquarePValue.toFixed(3)})
          </span>
        </div>

        {/* Parity & Over/Under Summary Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>Even / Odd Parity Split ({stats.windowSize}t)</span>
              <span className="font-mono tabular-nums">
                {contractBreakdown.evenPct.toFixed(1)}% / {contractBreakdown.oddPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${contractBreakdown.evenPct}%` }}
              />
              <div
                className="bg-sky-500 transition-all"
                style={{ width: `${contractBreakdown.oddPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
              <span>Under 5 (0–4) / Over 4 (5–9) Split</span>
              <span className="font-mono tabular-nums">
                {contractBreakdown.under5Pct.toFixed(1)}% / {contractBreakdown.over4Pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              <div
                className="bg-teal-500 transition-all"
                style={{ width: `${contractBreakdown.under5Pct}%` }}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${contractBreakdown.over4Pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Digit Distribution Chart + Live Tick Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Digit Frequency Distribution (0–9)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Observed percentages across last {stats.windowSize} ticks vs 10.0% baseline
                </p>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {stats.comparison50v200
                  ? `50v200 Stability: ${stats.comparison50v200.stabilityIndex.toFixed(1)}%`
                  : 'Buffering multi-window'}
              </span>
            </div>

            {settings.chartVisibility.digitFrequency ? (
              <DigitFrequencyChart
                digits={stats.digits}
                windowSize={stats.windowSize}
                isDark={isDark}
              />
            ) : (
              <div className="py-10 text-center text-xs text-slate-500">
                Digit frequency chart hidden in Settings.
              </div>
            )}

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {stats.digits.map((d) => (
                <div
                  key={d.digit}
                  className={`rounded-lg p-2 text-center border ${
                    d.isHot
                      ? 'bg-emerald-50 dark:bg-emerald-950/25 border-emerald-300 dark:border-emerald-500/40'
                      : d.isCold
                        ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-500/35'
                        : 'bg-slate-50 dark:bg-[#090E17] border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                    {d.digit}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                    {d.percentage.toFixed(1)}%
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-500 tabular-nums">
                    n={d.count}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Tick Stream */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 flex flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Activity
                  className={`h-4 w-4 ${
                    isConnected
                      ? 'text-emerald-600 dark:text-emerald-400 animate-pulse'
                      : 'text-slate-400'
                  }`}
                />
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Live Tick Stream
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {isConnected ? 'Live · ' : ''}
                {ticks.length} ticks
              </span>
            </div>

            {recentTicksReversed.length === 0 ? (
              <div className="flex-1 flex items-center justify-center py-12 text-center text-xs text-slate-500">
                {isConnected
                  ? 'Waiting for incoming ticks from Deriv WebSocket...'
                  : 'Disconnected. Tap Connect to stream live ticks.'}
              </div>
            ) : (
              <div className="mt-3 overflow-y-auto max-h-[340px] pr-1">
                <table className="w-full text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                      <th className="py-1.5 text-left font-medium">Time</th>
                      <th className="py-1.5 text-right font-medium">Quote</th>
                      <th className="py-1.5 text-right font-medium">Digit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {recentTicksReversed.map((tick, idx) => (
                      <tr
                        key={`${tick.symbol}-${tick.epoch}`}
                        className={
                          idx === 0
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/20 text-slate-900 dark:text-slate-100'
                            : 'text-slate-700 dark:text-slate-300'
                        }
                      >
                        <td className="py-1.5 text-left text-slate-500">
                          {new Date(tick.epoch * 1000).toLocaleTimeString()}
                        </td>
                        <td className="py-1.5 text-right">{tick.formattedQuote}</td>
                        <td className="py-1.5 text-right font-bold text-emerald-700 dark:text-emerald-300">
                          {tick.lastDigit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Hot/Cold, Overdue, Momentum & Multi-Window Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Hot/Cold, Overdue &amp; Digit Momentum
              </h3>
              <span className="text-xs text-slate-500">
                High absence does not increase next-tick odds
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2 text-left font-medium">Digit</th>
                    <th className="py-2 text-right font-medium">Freq %</th>
                    <th className="py-2 text-right font-medium">Dev</th>
                    <th className="py-2 text-right font-medium">Momentum</th>
                    <th className="py-2 text-right font-medium">Absent</th>
                    <th className="py-2 text-right font-medium">Max Gap</th>
                    <th className="py-2 text-right font-medium">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {stats.digits.map((d) => (
                    <tr key={d.digit} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 text-left font-bold text-slate-900 dark:text-slate-100">
                        {d.digit}
                      </td>
                      <td className="py-2 text-right text-slate-700 dark:text-slate-200">
                        {d.percentage.toFixed(1)}%
                      </td>
                      <td
                        className={`py-2 text-right ${
                          d.deviationFromUniform > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : d.deviationFromUniform < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-400'
                        }`}
                      >
                        {d.deviationFromUniform >= 0 ? '+' : ''}
                        {d.deviationFromUniform.toFixed(1)}%
                      </td>
                      <td
                        className={`py-2 text-right ${
                          d.momentumDelta > 0.5
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : d.momentumDelta < -0.5
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-400'
                        }`}
                      >
                        {d.momentumDelta >= 0 ? '+' : ''}
                        {d.momentumDelta.toFixed(1)}%
                      </td>
                      <td className="py-2 text-right text-slate-700 dark:text-slate-300">
                        {d.ticksSinceLast}t
                      </td>
                      <td className="py-2 text-right text-slate-500">{d.maxHistoricalGap}t</td>
                      <td className="py-2 text-right font-sans">
                        {d.isHot ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Hot
                          </span>
                        ) : d.isCold ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold">
                            Cold
                          </span>
                        ) : (
                          <span className="text-slate-400">Neutral</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-5">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Multi-Window &amp; Pattern Structure
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                50 vs 100 vs 200 tick distribution comparison
              </p>
            </div>

            {settings.chartVisibility.multiWindowComparison && (
              <MultiWindowComparisonChart ticks={ticks} isDark={isDark} />
            )}

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-slate-500 dark:text-slate-400">Current Streak</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {stats.patterns.currentStreakDigit !== null
                    ? `Digit ${stats.patterns.currentStreakDigit} (×${stats.patterns.currentStreakLength})`
                    : '—'}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 p-3">
                <div className="text-slate-500 dark:text-slate-400">Repeat Rate (10% Base)</div>
                <div className="mt-1 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {stats.patterns.consecutiveRepeatRate.toFixed(1)}%
                </div>
              </div>
            </div>

            {stats.mostOverdueDigit && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Longest current absence:
                </span>
                <span className="font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                  Digit {stats.mostOverdueDigit.digit} ({stats.mostOverdueDigit.ticksSinceLast} ticks ago)
                </span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
