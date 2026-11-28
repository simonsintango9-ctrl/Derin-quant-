import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Play,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { DEFAULT_USER_SETTINGS } from '../constants/markets';
import { runEngineDiagnostics } from '../engines/diagnosticTests';
import {
  AccountMode,
  AccountSessionInfo,
  EngineDiagnosticResult,
  UserSettings,
} from '../types/deriv';

interface SettingsViewProps {
  settings: UserSettings;
  accountSession: AccountSessionInfo;
  onUpdateSettings: (next: UserSettings) => void;
  onAuthorizeAccount: (mode: AccountMode, token: string) => Promise<void>;
  onDisconnectAccount: () => void;
  onExportTicksJson: () => void;
  onExportSignalsCsv: () => void;
  onClearStoredData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  accountSession,
  onUpdateSettings,
  onAuthorizeAccount,
  onDisconnectAccount,
  onExportTicksJson,
  onExportSignalsCsv,
  onClearStoredData,
}) => {
  const [diagnostics, setDiagnostics] = useState<EngineDiagnosticResult[] | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [appIdDraft, setAppIdDraft] = useState(settings.appId);
  const [accountModeDraft, setAccountModeDraft] = useState<AccountMode>(
    accountSession.mode === 'public' ? 'demo' : accountSession.mode
  );
  const [tokenDraft, setTokenDraft] = useState('');
  const [showToken, setShowToken] = useState(false);

  const handleApplyAppId = () => {
    const clean = appIdDraft.trim() || '1089';
    setAppIdDraft(clean);
    onUpdateSettings({ ...settings, appId: clean });
  };

  const handleRunDiagnostics = () => {
    setDiagnostics(runEngineDiagnostics());
  };

  const toggleChart = (key: keyof UserSettings['chartVisibility']) => {
    onUpdateSettings({
      ...settings,
      chartVisibility: {
        ...settings.chartVisibility,
        [key]: !settings.chartVisibility[key],
      },
    });
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Public Deriv WebSocket &amp; Stream Parameters
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Streams live market ticks from Deriv&apos;s public options feed with zero API token or App ID required
            </p>
          </div>

          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label htmlFor="deriv-app-id" className="block text-slate-700 dark:text-slate-300 font-medium">
                Deriv App ID (Fallback &amp; Account Socket)
              </label>
              <div className="flex gap-2">
                <input
                  id="deriv-app-id"
                  type="text"
                  value={appIdDraft}
                  onChange={(e) => setAppIdDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleApplyAppId();
                  }}
                  placeholder="1089"
                  className="flex-1 rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleApplyAppId}
                  disabled={appIdDraft.trim() === settings.appId}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Apply
                </button>
              </div>
              <span className="block text-[11px] text-slate-500">
                Used only for optional Demo/Real account sockets or v3 fallback (default public App ID: 1089).
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Deriv Account Connection (Optional)
                </span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {accountSession.isAuthorized
                    ? `${(accountSession.actualAccountType || accountSession.mode).toUpperCase()} · ${accountSession.loginid}`
                    : 'Public WS Only'}
                </span>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-[#070B12] p-1 border border-slate-200 dark:border-slate-800 w-fit">
                {(['public', 'demo', 'real'] as AccountMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAccountModeDraft(mode);
                      if (mode === 'public' && accountSession.isAuthorized) {
                        onDisconnectAccount();
                        setTokenDraft('');
                      }
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                      accountModeDraft === mode
                        ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {mode === 'public' ? 'Public Only' : mode}
                  </button>
                ))}
              </div>

              {accountModeDraft !== 'public' && (
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <input
                      type={showToken ? 'text' : 'password'}
                      value={tokenDraft}
                      onChange={(e) => setTokenDraft(e.target.value)}
                      placeholder={`Optional: Deriv ${accountModeDraft.toUpperCase()} API token`}
                      autoComplete="off"
                      className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 pl-3 pr-9 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken((prev) => !prev)}
                      aria-label={showToken ? 'Hide token' : 'Show token'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showToken ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={!tokenDraft.trim() || accountSession.isAuthorizing}
                    onClick={() => void onAuthorizeAccount(accountModeDraft, tokenDraft.trim())}
                    className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {accountSession.isAuthorizing ? 'Authorizing...' : 'Connect'}
                  </button>

                  {accountSession.isAuthorized && (
                    <button
                      type="button"
                      onClick={() => {
                        onDisconnectAccount();
                        setTokenDraft('');
                      }}
                      className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                    >
                      Unlink
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>
                  Live market ticks stream via Public WS without any token. Optional tokens remain in memory only for read-only account status &amp; balance.
                </span>
              </div>
              {accountSession.authError && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                  {accountSession.authError}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Tick Buffer Capacity
                </span>
                <input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={settings.tickHistorySize}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      tickHistorySize: Math.max(
                        100,
                        Math.min(5000, Number(e.target.value) || 1000)
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Custom Tick Window Size
                </span>
                <input
                  type="number"
                  min={10}
                  max={2000}
                  value={settings.customWindowSize}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      customWindowSize: Math.max(
                        10,
                        Math.min(2000, Number(e.target.value) || 150)
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Analysis Duration (sec)
                </span>
                <input
                  type="number"
                  min={10}
                  max={3600}
                  value={settings.analysisDurationSeconds}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      analysisDurationSeconds: Math.max(
                        10,
                        Math.min(3600, Number(e.target.value) || 120)
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Signal Refresh Cycle (sec)
                </span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={settings.signalRefreshIntervalSeconds}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      signalRefreshIntervalSeconds: Math.max(
                        5,
                        Math.min(300, Number(e.target.value) || 12)
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Scanner Interval (sec)
                </span>
                <input
                  type="number"
                  min={15}
                  max={300}
                  value={settings.scannerIntervalSeconds}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      scannerIntervalSeconds: Math.max(
                        15,
                        Math.min(300, Number(e.target.value) || 25)
                      ),
                    })
                  }
                  className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoReconnect}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, autoReconnect: e.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-700 text-emerald-600"
                />
                <span>Automatic WebSocket reconnect</span>
              </label>

              <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notificationsEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, notificationsEnabled: e.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-700 text-emerald-600"
                />
                <span>In-app anomaly &amp; signal alerts</span>
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Statistical Thresholds &amp; Chart Visibility
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Calibrate Markov smoothing, minimum sample requirements, and dashboard panels
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <label className="block space-y-1.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Minimum Sample Size
              </span>
              <input
                type="number"
                min={30}
                max={500}
                value={settings.thresholds.minSampleSize}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    thresholds: {
                      ...settings.thresholds,
                      minSampleSize: Math.max(30, Math.min(500, Number(e.target.value) || 50)),
                    },
                  })
                }
                className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Markov Dirichlet α
              </span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={settings.markovAlphaSmoothing}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    markovAlphaSmoothing: Math.max(0, Math.min(5, Number(e.target.value) || 0.5)),
                  })
                }
                className="w-full rounded-lg bg-slate-50 dark:bg-[#070B12] border border-slate-200 dark:border-slate-800 px-3 py-2 font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Visible Visualizations
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              {(
                [
                  ['digitFrequency', 'Digit Frequency Chart'],
                  ['multiWindowComparison', 'Multi-Window Comparison'],
                  ['rollingFrequency', 'Rolling Frequency Chart'],
                  ['probabilityComparison', 'Probability Comparison Chart'],
                  ['markovHeatmap', 'Markov Transition Heatmap'],
                  ['signalPerformance', 'Signal Performance Chart'],
                  ['multiMarketComparison', 'Multi-Market Comparison'],
                ] as Array<[keyof UserSettings['chartVisibility'], string]>
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={settings.chartVisibility[key]}
                    onChange={() => toggleChart(key)}
                    className="rounded border-slate-300 dark:border-slate-700 text-emerald-600"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExportTicksJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export Active Ticks (JSON)
            </button>
            <button
              type="button"
              onClick={onExportSignalsCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              Export Signal Ledger (CSV)
            </button>
            <button
              type="button"
              onClick={() => {
                setAppIdDraft(DEFAULT_USER_SETTINGS.appId);
                onUpdateSettings(DEFAULT_USER_SETTINGS);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset Defaults
            </button>
            {!confirmClear ? (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear IndexedDB
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onClearStoredData();
                  setConfirmClear(false);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 text-white transition-colors cursor-pointer"
              >
                Confirm Erase Stored Data
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0E1522] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Algorithmic &amp; Precision Verification Suite
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Run deterministic unit checks for pip_size trailing zeros, deduplication, Markov
              normalization, Chi-square p-values, and out-of-sample grading
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunDiagnostics}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5" />
            Run Verification Suite
          </button>
        </div>

        {diagnostics ? (
          <div className="space-y-2.5">
            {diagnostics.map((item) => (
              <div
                key={item.name}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-[#090E17] border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  {item.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  )}
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    {item.name}
                  </span>
                </div>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  {item.details}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-500">
            Click Run Verification Suite to execute mathematical and digit-precision assertions.
          </div>
        )}
      </section>
    </div>
  );
};
