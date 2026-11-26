import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart2,
  History,
  LayoutGrid,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { SUPPORTED_MARKETS } from './constants/markets';
import { ActiveSymbolInfo, DerivConnectionEngine } from './engines/connectionEngine';
import { runMarkovAnalysis } from './engines/markovEngine';
import {
  computePerformanceSummary,
  createPendingSignalRecord,
  evaluatePendingSignalsWithTick,
} from './engines/performanceEngine';
import { runProbabilityEngine } from './engines/probabilityEngine';
import {
  buildInitialScannerSummaries,
  evaluateScannerMarket,
} from './engines/scannerEngine';
import { generateSignals } from './engines/signalEngine';
import { runStatisticalAnalysis } from './engines/statisticalEngine';
import {
  clearAllStoredData,
  loadAllSignalRecords,
  loadMarketTicks,
  loadUserSettings,
  persistMarketTicks,
  persistSignalRecord,
  saveUserSettings,
} from './engines/storageEngine';
import { TickDataEngine } from './engines/tickDataEngine';
import {
  ConnectionStatusInfo,
  MarketSymbol,
  QuantSignal,
  ScannerMarketSummary,
  SignalCategory,
  SignalRecord,
  UserSettings,
} from './types/deriv';
import { ScannerView } from './components/ScannerView';
import { SettingsView } from './components/SettingsView';
import { SignalLedgerView } from './components/SignalLedgerView';
import { StatisticalLabView } from './components/StatisticalLabView';
import { ScannedCardState, TerminalView } from './components/TerminalView';

type ActiveTab = 'dashboard' | 'markets' | 'analysis' | 'history' | 'settings';

export default function App() {
  const [settings, setSettings] = useState<UserSettings>(() => loadUserSettings());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [ticksVersion, setTicksVersion] = useState(0);
  const [signalRecords, setSignalRecords] = useState<SignalRecord[]>([]);
  const [validatedSymbols, setValidatedSymbols] = useState<Map<MarketSymbol, ActiveSymbolInfo>>(
    () => new Map()
  );
  const [scannerSummaries, setScannerSummaries] = useState<ScannerMarketSummary[]>(() =>
    buildInitialScannerSummaries()
  );
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [scannedCards, setScannedCards] = useState<
    Partial<Record<SignalCategory, ScannedCardState>>
  >({});
  const [notification, setNotification] = useState<{
    type: 'error' | 'info';
    message: string;
  } | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusInfo>({
    state: 'disconnected',
    appId: settings.appId,
    endpoint: 'wss://ws.derivws.com/websockets/v3',
    lastMessageAt: null,
    reconnectAttempt: 0,
    errorMessage: null,
    validatedSymbolCount: 0,
    latencyMs: null,
  });

  const tickEngineRef = useRef<TickDataEngine>(new TickDataEngine(settings.tickHistorySize));
  const connectionRef = useRef<DerivConnectionEngine | null>(null);
  const activeMarketRef = useRef<MarketSymbol>(settings.selectedMarket);
  const signalRecordsRef = useRef<SignalRecord[]>(signalRecords);
  const settingsRef = useRef<UserSettings>(settings);
  const isScanningRef = useRef<boolean>(false);

  activeMarketRef.current = settings.selectedMarket;
  signalRecordsRef.current = signalRecords;
  settingsRef.current = settings;

  const effectiveWindowSize =
    settings.analysisWindowPreset === 'custom'
      ? settings.customWindowSize
      : settings.analysisWindowPreset;

  const pushToast = useCallback((type: 'error' | 'info', message: string) => {
    if (!settingsRef.current.notificationsEnabled && type === 'info') return;
    setNotification({ type, message });
  }, []);

  // Sync theme class on document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  // Load persisted signals & cached ticks on startup
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const [storedSignals, cachedTicks] = await Promise.all([
        loadAllSignalRecords(),
        loadMarketTicks(settings.selectedMarket),
      ]);
      if (!mounted) return;
      if (storedSignals.length > 0) {
        setSignalRecords(storedSignals);
      }
      if (cachedTicks.length > 0) {
        tickEngineRef.current.mergeHistory(settings.selectedMarket, cachedTicks);
        setTicksVersion((v) => v + 1);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist user settings & update engine configurations
  useEffect(() => {
    tickEngineRef.current.setMaxBufferSize(settings.tickHistorySize);
    saveUserSettings(settings);
    connectionRef.current?.updateConfig(
      settings.appId,
      settings.autoReconnect,
      settings.tickHistorySize
    );
  }, [settings]);

  // Initialize Deriv WebSocket Connection Engine
  useEffect(() => {
    const engine = new DerivConnectionEngine(
      settingsRef.current.appId,
      settingsRef.current.selectedMarket,
      settingsRef.current.autoReconnect,
      {
        onStatusChange: (status) => {
          setConnectionStatus(status);
        },
        onActiveSymbolsValidated: (validated) => {
          setValidatedSymbols(validated);
        },
        onHistoryReceived: (symbol, ticks) => {
          const merged = tickEngineRef.current.mergeHistory(symbol, ticks);
          void persistMarketTicks(symbol, merged);
          setScannerSummaries((prev) =>
            prev.map((item) =>
              item.symbol === symbol ? evaluateScannerMarket(symbol, merged, 100, 'ready') : item
            )
          );
          if (symbol === activeMarketRef.current) {
            setTicksVersion((v) => v + 1);
          }
        },
        onLiveTick: (tick) => {
          const accepted = tickEngineRef.current.appendLiveTick(tick);
          if (!accepted) return;

          // Evaluate any pending out-of-sample signals strictly against this newer tick
          const { updatedRecords, newlyEvaluated } = evaluatePendingSignalsWithTick(
            signalRecordsRef.current,
            tick
          );
          if (newlyEvaluated.length > 0) {
            setSignalRecords(updatedRecords);
            for (const rec of newlyEvaluated) {
              void persistSignalRecord(rec);
            }
          }

          const currentTicks = tickEngineRef.current.getTicks(tick.symbol);
          if (currentTicks.length % 10 === 0) {
            void persistMarketTicks(tick.symbol, currentTicks);
          }

          setScannerSummaries((prev) =>
            prev.map((item) =>
              item.symbol === tick.symbol
                ? evaluateScannerMarket(tick.symbol, currentTicks, 100, 'ready')
                : item
            )
          );

          if (tick.symbol === activeMarketRef.current) {
            setTicksVersion((v) => v + 1);
          }
        },
        onError: (msg) => {
          pushToast('error', msg);
        },
      },
      settingsRef.current.tickHistorySize
    );

    connectionRef.current = engine;
    engine.connect(settingsRef.current.selectedMarket);

    return () => {
      engine.disconnect();
      connectionRef.current = null;
    };
  }, [pushToast]);

  // Derived active market ticks & analytical models
  const activeTicks = useMemo(() => {
    void ticksVersion;
    return tickEngineRef.current.getTicks(settings.selectedMarket);
  }, [settings.selectedMarket, ticksVersion]);

  const stats = useMemo(
    () => runStatisticalAnalysis(settings.selectedMarket, activeTicks, effectiveWindowSize),
    [settings.selectedMarket, activeTicks, effectiveWindowSize]
  );

  const markov = useMemo(
    () => runMarkovAnalysis(activeTicks, effectiveWindowSize, settings.markovAlphaSmoothing),
    [activeTicks, effectiveWindowSize, settings.markovAlphaSmoothing]
  );

  const probability = useMemo(
    () =>
      runProbabilityEngine(
        activeTicks,
        effectiveWindowSize,
        markov,
        settings.thresholds.minSampleSize
      ),
    [activeTicks, effectiveWindowSize, markov, settings.thresholds.minSampleSize]
  );

  const { matchesSignal, differsSignal, evenSignal, oddSignal } = useMemo(
    () =>
      generateSignals({
        symbol: settings.selectedMarket,
        allTicks: activeTicks,
        selectedWindow: effectiveWindowSize,
        stats,
        markov,
        probability,
        validitySeconds: settings.signalRefreshIntervalSeconds,
        thresholds: settings.thresholds,
      }),
    [
      settings.selectedMarket,
      activeTicks,
      effectiveWindowSize,
      stats,
      markov,
      probability,
      settings.signalRefreshIntervalSeconds,
      settings.thresholds,
    ]
  );

  const liveSignals = useMemo(
    () => ({
      MATCHES: matchesSignal,
      DIFFERS: differsSignal,
      EVEN: evenSignal,
      ODD: oddSignal,
    }),
    [matchesSignal, differsSignal, evenSignal, oddSignal]
  );

  const performanceSummary = useMemo(
    () => computePerformanceSummary(signalRecords),
    [signalRecords]
  );

  const recordSignal = useCallback((signal: QuantSignal) => {
    const exists = signalRecordsRef.current.some((r) => r.id === signal.id);
    if (exists) return;
    const pending = createPendingSignalRecord(signal);
    setSignalRecords((prev) => [pending, ...prev].slice(0, 1000));
    void persistSignalRecord(pending);
  }, []);

  // On-demand Scan button handler for MATCHES / DIFFERS / EVEN / ODD cards
  const handleScanCategory = useCallback(
    (category: SignalCategory) => {
      const candidate = liveSignals[category];
      if (!candidate) {
        pushToast('info', 'Waiting for initial market ticks before scanning.');
        return;
      }

      const cycleSeconds = settingsRef.current.signalRefreshIntervalSeconds;
      setScannedCards((prev) => ({
        ...prev,
        [category]: {
          signal: candidate,
          secondsRemaining: cycleSeconds,
        },
      }));
      recordSignal(candidate);
    },
    [liveSignals, pushToast, recordSignal]
  );

  // Batch generate all 4 signal cards at once from current live tick models
  const handleGenerateAllSignals = useCallback(() => {
    const categories: SignalCategory[] = ['MATCHES', 'DIFFERS', 'EVEN', 'ODD'];
    const cycleSeconds = settingsRef.current.signalRefreshIntervalSeconds;
    const nextCards: Partial<Record<SignalCategory, ScannedCardState>> = {};
    let count = 0;

    for (const cat of categories) {
      const candidate = liveSignals[cat];
      if (candidate) {
        nextCards[cat] = {
          signal: candidate,
          secondsRemaining: cycleSeconds,
        };
        recordSignal(candidate);
        count++;
      }
    }

    if (count === 0) {
      pushToast('info', 'Waiting for market ticks before generating signals.');
      return;
    }

    setScannedCards(nextCards);
  }, [liveSignals, pushToast, recordSignal]);

  // Auto-generate and refresh signals when live ticks arrive and Auto-Generate is enabled
  useEffect(() => {
    if (!settings.autoGenerateSignals) return;
    if (!liveSignals.MATCHES || !liveSignals.DIFFERS || !liveSignals.EVEN || !liveSignals.ODD) {
      return;
    }

    const categories: SignalCategory[] = ['MATCHES', 'DIFFERS', 'EVEN', 'ODD'];
    const hasMissing = categories.some((cat) => !scannedCards[cat]);
    const hasExpired = categories.some(
      (cat) => scannedCards[cat] && scannedCards[cat]!.secondsRemaining <= 0
    );

    if (hasMissing || hasExpired) {
      const cycleSeconds = Math.max(5, settings.signalRefreshIntervalSeconds || 12);
      const nextCards: Partial<Record<SignalCategory, ScannedCardState>> = {};
      for (const cat of categories) {
        const candidate = liveSignals[cat];
        if (candidate) {
          nextCards[cat] = {
            signal: candidate,
            secondsRemaining: cycleSeconds,
          };
          recordSignal(candidate);
        }
      }
      setScannedCards(nextCards);
    }
  }, [
    settings.autoGenerateSignals,
    settings.signalRefreshIntervalSeconds,
    liveSignals,
    scannedCards,
    recordSignal,
  ]);

  // Clean 1-second countdown timer for scanned cards (zero volatile dependencies)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setScannedCards((prev) => {
        const keys = Object.keys(prev) as SignalCategory[];
        if (keys.length === 0) return prev;
        let changed = false;
        const next: Partial<Record<SignalCategory, ScannedCardState>> = { ...prev };
        for (const k of keys) {
          const item = prev[k];
          if (item && item.secondsRemaining > 0) {
            changed = true;
            next[k] = { ...item, secondsRemaining: item.secondsRemaining - 1 };
          }
        }
        return changed ? next : prev;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Multi-market staggered scanner (using ref lock to avoid interval reset loops)
  const runMarketScan = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn || conn.getStatus().state !== 'connected' || isScanningRef.current) {
      return;
    }

    isScanningRef.current = true;
    setIsScanning(true);

    try {
      for (const market of SUPPORTED_MARKETS) {
        if (conn.getStatus().state !== 'connected') break;

        if (market.symbol === activeMarketRef.current) {
          const ticks = tickEngineRef.current.getTicks(market.symbol);
          setScannerSummaries((prev) =>
            prev.map((s) =>
              s.symbol === market.symbol
                ? evaluateScannerMarket(market.symbol, ticks, 100, 'ready')
                : s
            )
          );
          continue;
        }

        try {
          setScannerSummaries((prev) =>
            prev.map((s) => (s.symbol === market.symbol ? { ...s, status: 'scanning' } : s))
          );
          const history = await conn.fetchSnapshotHistory(market.symbol, 200);
          const merged = tickEngineRef.current.mergeHistory(market.symbol, history);
          setScannerSummaries((prev) =>
            prev.map((s) =>
              s.symbol === market.symbol
                ? evaluateScannerMarket(market.symbol, merged, 100, 'ready')
                : s
            )
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Scan failed';
          setScannerSummaries((prev) =>
            prev.map((s) =>
              s.symbol === market.symbol
                ? evaluateScannerMarket(
                    market.symbol,
                    tickEngineRef.current.getTicks(market.symbol),
                    100,
                    'error',
                    msg
                  )
                : s
            )
          );
        }

        await new Promise((r) => window.setTimeout(r, 260));
      }
      setLastScanAt(Date.now());
    } finally {
      isScanningRef.current = false;
      setIsScanning(false);
    }
  }, []);

  useEffect(() => {
    if (connectionStatus.state !== 'connected') return;

    const initialTimer = window.setTimeout(() => {
      void runMarketScan();
    }, 2500);

    const intervalTimer = window.setInterval(() => {
      void runMarketScan();
    }, settings.scannerIntervalSeconds * 1000);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [connectionStatus.state, settings.scannerIntervalSeconds, runMarketScan]);

  const handleMarketSwitch = useCallback(
    async (nextMarket: MarketSymbol) => {
      if (nextMarket === settings.selectedMarket) return;
      setSettings((prev) => ({ ...prev, selectedMarket: nextMarket }));
      setScannedCards({});

      const cached = await loadMarketTicks(nextMarket);
      if (cached.length > 0) {
        tickEngineRef.current.mergeHistory(nextMarket, cached);
      }
      setTicksVersion((v) => v + 1);

      if (connectionRef.current) {
        try {
          await connectionRef.current.switchMarket(nextMarket, settings.tickHistorySize);
        } catch (err) {
          const msg = err instanceof Error ? err.message : `Failed to switch to ${nextMarket}`;
          pushToast('error', msg);
        }
      }
    },
    [settings.selectedMarket, settings.tickHistorySize, pushToast]
  );

  const handleToggleConnection = () => {
    const conn = connectionRef.current;
    if (!conn) return;
    if (
      connectionStatus.state === 'connected' ||
      connectionStatus.state === 'connecting' ||
      connectionStatus.state === 'reconnecting'
    ) {
      conn.disconnect();
    } else {
      conn.connect(settings.selectedMarket);
    }
  };

  const handleExportTicksJson = () => {
    const payload = {
      symbol: settings.selectedMarket,
      exportedAt: new Date().toISOString(),
      count: activeTicks.length,
      ticks: activeTicks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv-quant-${settings.selectedMarket}-ticks.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportSignalsCsv = () => {
    const headers = [
      'id',
      'symbol',
      'category',
      'targetDigit',
      'estimatedProbability',
      'historicalFrequency',
      'sampleSize',
      'windowUsed',
      'reliabilityTier',
      'generatedAt',
      'anchorTickEpoch',
      'actualNextDigit',
      'outcome',
      'modelUsed',
    ];
    const rows = signalRecords.map((r) =>
      [
        r.id,
        r.symbol,
        r.category,
        r.targetDigit,
        r.estimatedProbability.toFixed(4),
        r.historicalFrequency.toFixed(4),
        r.sampleSize,
        r.windowUsed,
        `"${r.reliabilityTier}"`,
        new Date(r.generatedAt).toISOString(),
        r.anchorTickEpoch,
        r.actualNextDigit ?? '',
        r.outcome,
        `"${r.modelUsed}"`,
      ].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv-quant-signals-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearStoredData = async () => {
    await clearAllStoredData();
    tickEngineRef.current.clearAll();
    setSignalRecords([]);
    setScannedCards({});
    setScannerSummaries(buildInitialScannerSummaries());
    setTicksVersion((v) => v + 1);
    pushToast('info', 'Cleared stored tick buffers and signal ledger from IndexedDB.');
  };

  const isStreamActive =
    connectionStatus.state === 'connected' ||
    connectionStatus.state === 'connecting' ||
    connectionStatus.state === 'reconnecting';

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'markets', label: 'Markets', icon: BarChart2 },
    { id: 'analysis', label: 'Analysis', icon: Activity },
    { id: 'history', label: 'History', icon: History },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-[#F3F5F8] dark:bg-[#070B12] text-slate-900 dark:text-slate-100 flex flex-col pb-20 md:pb-0 transition-colors">
      {/* Top App Header matching video layout + Desktop Navigation */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#070B12]/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Lockup */}
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className="flex items-center gap-2.5 shrink-0"
          >
            <span className="h-9 w-9 rounded-xl bg-emerald-600 text-white font-display font-bold text-base flex items-center justify-center shrink-0">
              D
            </span>
            <div className="leading-tight">
              <div className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
                DERIV QUANT AI
              </div>
              <div className="text-[10px] font-medium tracking-wider text-slate-500 dark:text-slate-400">
                ANALYSIS TOOL
              </div>
            </div>
          </a>

          {/* Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1.5 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                  activeTab === item.id
                    ? 'text-emerald-600 dark:text-emerald-400 border-emerald-600 dark:border-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Header Controls: Real Connection Status, Theme Toggle, Connect Action */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-500 dark:text-slate-400 mr-1 tabular-nums">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus.state === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : connectionStatus.state === 'connecting' ||
                        connectionStatus.state === 'reconnecting'
                      ? 'bg-amber-500 animate-pulse'
                      : connectionStatus.state === 'error'
                        ? 'bg-rose-500'
                        : 'bg-slate-400'
                }`}
              />
              <span>
                {connectionStatus.state === 'connected'
                  ? connectionStatus.latencyMs
                    ? `${connectionStatus.latencyMs}ms`
                    : 'Live'
                  : connectionStatus.state === 'reconnecting'
                    ? `Retry #${connectionStatus.reconnectAttempt}`
                    : connectionStatus.state}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  theme: prev.theme === 'dark' ? 'light' : 'dark',
                }))
              }
              aria-label="Toggle color theme"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#0E1522] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {settings.theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleConnection}
              className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isStreamActive
                  ? 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isStreamActive ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Disconnect</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  <span>Connect</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Viewport */}
      <main className="flex-1 mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-5 space-y-6">
        {notification && (
          <div
            className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 text-xs ${
              notification.type === 'error'
                ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-950/25 text-rose-800 dark:text-rose-200'
                : 'border-emerald-300 dark:border-emerald-500/35 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{notification.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              aria-label="Dismiss notification"
              className="p-1 opacity-70 hover:opacity-100 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <TerminalView
            market={settings.selectedMarket}
            connection={connectionStatus}
            ticks={activeTicks}
            stats={stats}
            probability={probability}
            liveSignals={liveSignals}
            scannedCards={scannedCards}
            settings={settings}
            onSelectMarket={(sym) => void handleMarketSwitch(sym)}
            onChangeWindowPreset={(preset) =>
              setSettings((prev) => ({ ...prev, analysisWindowPreset: preset }))
            }
            onScanCategory={handleScanCategory}
            onGenerateAllSignals={handleGenerateAllSignals}
            onToggleAutoGenerateSignals={() =>
              setSettings((prev) => ({
                ...prev,
                autoGenerateSignals: !prev.autoGenerateSignals,
              }))
            }
            onReorderSignalCards={(nextOrder) =>
              setSettings((prev) => ({ ...prev, signalCardOrder: nextOrder }))
            }
            onToggleConnection={handleToggleConnection}
            onReconnectNow={() =>
              connectionRef.current?.reconnectNow(settings.selectedMarket)
            }
            onSwitchToLab={() => setActiveTab('analysis')}
          />
        )}

        {activeTab === 'markets' && (
          <ScannerView
            summaries={scannerSummaries}
            activeMarket={settings.selectedMarket}
            isConnected={connectionStatus.state === 'connected'}
            isScanning={isScanning}
            lastScanAt={lastScanAt}
            settings={settings}
            onScanNow={() => void runMarketScan()}
            onSelectMarket={(sym) => {
              void handleMarketSwitch(sym);
              setActiveTab('dashboard');
            }}
          />
        )}

        {activeTab === 'analysis' && (
          <StatisticalLabView
            stats={stats}
            markov={markov}
            probability={probability}
            settings={settings}
          />
        )}

        {activeTab === 'history' && (
          <SignalLedgerView
            records={signalRecords}
            summary={performanceSummary}
            settings={settings}
            onExportSignalsCsv={handleExportSignalsCsv}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onUpdateSettings={setSettings}
            onExportTicksJson={handleExportTicksJson}
            onExportSignalsCsv={handleExportSignalsCsv}
            onClearStoredData={() => void handleClearStoredData()}
          />
        )}
      </main>

      {/* Desktop Quiet Footer */}
      <footer className="hidden md:block border-t border-slate-200 dark:border-slate-800/70 bg-white dark:bg-[#070B12] py-4">
        <div className="mx-auto max-w-[1440px] px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Deriv Quant AI · Validated Symbols: {validatedSymbols.size}/10
          </span>
          <span>
            Research use only. No automated execution. Historical digit patterns do not guarantee
            future outcomes.
          </span>
        </div>
      </footer>

      {/* Mobile Fixed Bottom Navigation Bar matching the 5-tab layout in the screenshot */}
      <nav
        aria-label="Primary Mobile Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B111C]/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-5 h-16 items-center">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center h-full gap-1 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-medium leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
