import {
  DERIV_AUTH_WS_ENDPOINTS,
  DERIV_WS_ENDPOINT,
  DERIV_WS_ENDPOINTS,
  MARKET_MAP,
} from '../constants/markets';
import {
  AccountMode,
  AccountSessionInfo,
  ConnectionStatusInfo,
  DerivAccountSummary,
  MarketSymbol,
  TickRecord,
} from '../types/deriv';
import { normalizeDerivTick, resolvePipPrecision } from './digitExtractionEngine';

export interface ActiveSymbolInfo {
  symbol?: string;
  underlying_symbol?: string;
  display_name?: string;
  underlying_symbol_name?: string;
  pip?: number;
  pip_size?: number;
  exchange_is_open?: number;
  is_trading_suspended?: number;
}

export interface ConnectionCallbacks {
  onStatusChange: (status: ConnectionStatusInfo) => void;
  onAccountChange?: (account: AccountSessionInfo) => void;
  onActiveSymbolsValidated: (validated: Map<MarketSymbol, ActiveSymbolInfo>) => void;
  onHistoryReceived: (symbol: MarketSymbol, ticks: TickRecord[]) => void;
  onLiveTick: (tick: TickRecord) => void;
  onError: (message: string) => void;
}

interface PendingRequest {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timeoutId: number;
}

export class DerivConnectionEngine {
  private ws: WebSocket | null = null;
  private accountWs: WebSocket | null = null;
  private accountPendingRequests = new Map<number, PendingRequest>();
  private accountReqIdCounter = 1;
  private accountEndpointIndex = 0;
  private appId: string;
  private autoReconnect: boolean;
  private historyCount: number;
  private callbacks: ConnectionCallbacks;

  private status: ConnectionStatusInfo;
  private accountSession: AccountSessionInfo;
  private apiToken: string | null = null;
  private balanceSubscriptionId: string | null = null;

  private manualDisconnect = false;
  private reconnectTimer: number | null = null;
  private connectTimeoutTimer: number | null = null;
  private pingTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private pingSentAt: number | null = null;
  private connectedAt: number | null = null;
  private watchdogRetrying = false;
  private endpointIndex = 0;

  private reqIdCounter = 1;
  private pendingRequests = new Map<number, PendingRequest>();

  private activeSymbol: MarketSymbol;
  private currentSubscriptionId: string | null = null;
  private symbolPipMap = new Map<MarketSymbol, number>();

  constructor(
    appId: string,
    initialMarket: MarketSymbol,
    autoReconnect: boolean,
    callbacks: ConnectionCallbacks,
    historyCount = 1000,
    initialAccountMode: AccountMode = 'public'
  ) {
    this.appId = appId.trim() || '1089';
    this.activeSymbol = initialMarket;
    this.autoReconnect = autoReconnect;
    this.historyCount = Math.max(100, Math.min(5000, historyCount));
    this.callbacks = callbacks;

    this.status = {
      state: 'disconnected',
      appId: this.appId,
      endpoint: DERIV_WS_ENDPOINT,
      lastMessageAt: null,
      lastLiveTickAt: null,
      liveTickCount: 0,
      reconnectAttempt: 0,
      errorMessage: null,
      validatedSymbolCount: 0,
      latencyMs: null,
    };

    this.accountSession = {
      mode: initialAccountMode,
      isAuthorized: false,
      isAuthorizing: false,
      loginid: null,
      actualAccountType: null,
      currency: null,
      balance: null,
      email: null,
      accounts: [],
      authError: null,
    };
  }

  public getStatus(): ConnectionStatusInfo {
    return { ...this.status };
  }

  public getAccountSession(): AccountSessionInfo {
    return { ...this.accountSession };
  }

  public async setAccountCredentials(mode: AccountMode, token: string | null): Promise<void> {
    const cleanToken = token ? token.trim() : null;
    this.apiToken = mode === 'public' ? null : cleanToken;

    if (mode === 'public' || !this.apiToken) {
      this.closeAccountSocket();
      this.balanceSubscriptionId = null;

      this.updateAccount({
        mode: 'public',
        isAuthorized: false,
        isAuthorizing: false,
        loginid: null,
        actualAccountType: null,
        currency: null,
        balance: null,
        email: null,
        accounts: [],
        authError: null,
      });
      return;
    }

    this.updateAccount({
      mode,
      authError: null,
    });

    await this.authorizeAccountSocket();
  }

  public updateConfig(appId: string, autoReconnect: boolean, historyCount?: number): void {
    const cleanAppId = appId.trim() || '1089';
    const appChanged = this.appId !== cleanAppId;
    this.appId = cleanAppId;
    this.autoReconnect = autoReconnect;
    if (historyCount !== undefined) {
      this.historyCount = Math.max(100, Math.min(5000, historyCount));
    }
    this.status.appId = cleanAppId;

    const usingV3Feed = !this.status.endpoint.includes('/options/ws/public');
    if (
      appChanged &&
      usingV3Feed &&
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      this.disconnect();
      this.connect(this.activeSymbol);
    } else if (appChanged && this.apiToken) {
      this.closeAccountSocket();
      void this.authorizeAccountSocket();
    }
  }

  private buildEndpointUrl(endpoint: string, appId: string): string {
    if (endpoint.includes('/options/ws/public')) {
      return endpoint;
    }
    return `${endpoint}?app_id=${encodeURIComponent(appId)}`;
  }

  public connect(market?: MarketSymbol): void {
    if (market) {
      this.activeSymbol = market;
    }

    this.manualDisconnect = false;
    this.clearReconnectTimer();
    this.clearConnectTimeout();

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const sanitizedAppId = this.appId.trim() || '1089';
    const endpoint = DERIV_WS_ENDPOINTS[this.endpointIndex % DERIV_WS_ENDPOINTS.length];
    const url = this.buildEndpointUrl(endpoint, sanitizedAppId);

    this.updateStatus({
      state: this.status.reconnectAttempt > 0 ? 'reconnecting' : 'connecting',
      appId: sanitizedAppId,
      endpoint,
      errorMessage: null,
    });

    let openedOnce = false;

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      this.connectTimeoutTimer = window.setTimeout(() => {
        if (this.ws === socket && socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }, 10000);

      socket.onopen = () => {
        if (this.ws !== socket) return;
        openedOnce = true;
        this.connectedAt = Date.now();
        this.clearConnectTimeout();
        this.updateStatus({
          state: 'connected',
          endpoint,
          reconnectAttempt: 0,
          errorMessage: null,
          lastMessageAt: Date.now(),
        });
        this.startPingLoop();
        this.startWatchdogLoop();
        void this.bootstrapSession();
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        this.handleMessage(event.data);
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        if (this.status.reconnectAttempt >= DERIV_WS_ENDPOINTS.length) {
          this.callbacks.onError(`Unable to reach public Deriv WebSocket (${endpoint})`);
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.clearConnectTimeout();
        this.stopPingLoop();
        this.stopWatchdogLoop();
        this.rejectAllPending(new Error('WebSocket connection closed'));
        this.currentSubscriptionId = null;

        if (this.manualDisconnect) {
          this.updateStatus({
            state: 'disconnected',
            reconnectAttempt: 0,
          });
          return;
        }

        // Rotate to fallback public Deriv endpoint if handshake never succeeded
        if (!openedOnce) {
          this.endpointIndex = (this.endpointIndex + 1) % DERIV_WS_ENDPOINTS.length;
          if (this.endpointIndex === 0 && this.appId !== '1089') {
            this.appId = '1089';
          }
        }

        const reason = event.reason || `Connection closed (code ${event.code})`;
        this.updateStatus({
          state: this.autoReconnect ? 'reconnecting' : 'error',
          errorMessage: reason,
        });

        if (this.autoReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      this.clearConnectTimeout();
      const msg =
        err instanceof Error ? err.message : 'Failed to initialize Public WebSocket connection';
      this.updateStatus({
        state: 'error',
        errorMessage: msg,
      });
      this.callbacks.onError(msg);
    }
  }

  public reconnectNow(market?: MarketSymbol): void {
    this.disconnect();
    this.endpointIndex = 0;
    this.status.reconnectAttempt = 0;
    this.connect(market ?? this.activeSymbol);
  }

  public disconnect(): void {
    this.manualDisconnect = true;
    this.clearReconnectTimer();
    this.clearConnectTimeout();
    this.stopPingLoop();
    this.stopWatchdogLoop();
    this.rejectAllPending(new Error('Disconnected by user'));

    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ forget_all: 'ticks' }));
        }
        this.ws.close(1000, 'Manual disconnect');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.closeAccountSocket();
    this.currentSubscriptionId = null;
    this.balanceSubscriptionId = null;
    this.connectedAt = null;
    this.updateAccount({
      isAuthorized: false,
      isAuthorizing: false,
    });
    this.updateStatus({
      state: 'disconnected',
      reconnectAttempt: 0,
      latencyMs: null,
    });
  }

  public async resubscribeTicks(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect(this.activeSymbol);
      return;
    }
    try {
      await this.sendRequest({ forget_all: 'ticks' }).catch(() => {});
      await this.subscribeToMarketTicks(this.activeSymbol, this.historyCount);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : `Failed to stream ticks for ${this.activeSymbol}`;
      this.callbacks.onError(msg);
    }
  }

  public async switchMarket(symbol: MarketSymbol, historyCount?: number): Promise<void> {
    this.activeSymbol = symbol;
    this.currentSubscriptionId = null;
    if (historyCount !== undefined) {
      this.historyCount = Math.max(100, Math.min(5000, historyCount));
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      await this.sendRequest({ forget_all: 'ticks' });
    } catch {
      // Continue subscribing even if forget_all had nothing active
    }

    await this.subscribeToMarketTicks(symbol, this.historyCount);
  }

  public async fetchSnapshotHistory(symbol: MarketSymbol, count = 100): Promise<TickRecord[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Public Deriv WebSocket');
    }

    const res = await this.sendRequest({
      ticks_history: symbol,
      adjust_start_time: 1,
      count: Math.max(20, Math.min(1000, count)),
      end: 'latest',
      style: 'ticks',
    });

    return this.parseHistoryResponse(symbol, res);
  }

  private closeAccountSocket(): void {
    for (const [, req] of this.accountPendingRequests) {
      window.clearTimeout(req.timeoutId);
      req.reject(new Error('Account WebSocket closed'));
    }
    this.accountPendingRequests.clear();

    if (this.accountWs) {
      try {
        if (this.accountWs.readyState === WebSocket.OPEN) {
          this.accountWs.send(JSON.stringify({ logout: 1 }));
        }
        this.accountWs.close(1000, 'Account socket closed');
      } catch {
        // Ignore close errors
      }
      this.accountWs = null;
    }
  }

  private sendAccountRequest(
    socket: WebSocket,
    payload: Record<string, unknown>,
    timeoutMs = 10000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (socket.readyState !== WebSocket.OPEN) {
        reject(new Error('Deriv account WebSocket is not open'));
        return;
      }

      const reqId = this.accountReqIdCounter++;
      const timeoutId = window.setTimeout(() => {
        this.accountPendingRequests.delete(reqId);
        reject(new Error('Deriv account authorization timed out'));
      }, timeoutMs);

      this.accountPendingRequests.set(reqId, { resolve, reject, timeoutId });

      try {
        socket.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (err) {
        window.clearTimeout(timeoutId);
        this.accountPendingRequests.delete(reqId);
        reject(err instanceof Error ? err : new Error('Failed to send account message'));
      }
    });
  }

  private async ensureAccountSocketOpen(): Promise<WebSocket> {
    if (this.accountWs && this.accountWs.readyState === WebSocket.OPEN) {
      return this.accountWs;
    }

    this.closeAccountSocket();
    const sanitizedAppId = this.appId.trim() || '1089';

    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < DERIV_AUTH_WS_ENDPOINTS.length; attempt++) {
      const idx = (this.accountEndpointIndex + attempt) % DERIV_AUTH_WS_ENDPOINTS.length;
      const endpoint = DERIV_AUTH_WS_ENDPOINTS[idx];
      const url = `${endpoint}?app_id=${encodeURIComponent(sanitizedAppId)}`;

      try {
        const socket = await new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(url);
          const timer = window.setTimeout(() => {
            ws.close();
            reject(new Error(`Timeout connecting to ${endpoint}`));
          }, 8000);

          ws.onopen = () => {
            window.clearTimeout(timer);
            resolve(ws);
          };

          ws.onerror = () => {
            window.clearTimeout(timer);
            reject(new Error(`Unable to reach Deriv account WebSocket (${endpoint})`));
          };

          ws.onmessage = (event) => {
            if (this.accountWs !== ws) return;
            try {
              const data = JSON.parse(event.data as string) as Record<string, unknown>;
              const reqId = typeof data.req_id === 'number' ? data.req_id : null;
              if (reqId !== null && this.accountPendingRequests.has(reqId)) {
                const pending = this.accountPendingRequests.get(reqId)!;
                this.accountPendingRequests.delete(reqId);
                window.clearTimeout(pending.timeoutId);
                if (data.error) {
                  const errObj = data.error as { message?: string; code?: string };
                  pending.reject(new Error(errObj.message || errObj.code || 'Deriv auth error'));
                } else {
                  pending.resolve(data);
                }
                return;
              }

              if (data.msg_type === 'balance' && data.balance) {
                const rawBal = data.balance as {
                  balance?: number | string;
                  currency?: string;
                  loginid?: string;
                };
                const balVal = Number(rawBal.balance);
                if (Number.isFinite(balVal)) {
                  this.updateAccount({
                    balance: balVal,
                    currency: rawBal.currency || this.accountSession.currency,
                    loginid: rawBal.loginid || this.accountSession.loginid,
                  });
                }
              }
            } catch {
              // Ignore malformed account messages
            }
          };

          ws.onclose = () => {
            if (this.accountWs !== ws) return;
            this.accountWs = null;
            for (const [, req] of this.accountPendingRequests) {
              window.clearTimeout(req.timeoutId);
              req.reject(new Error('Deriv account WebSocket closed'));
            }
            this.accountPendingRequests.clear();
          };
        });

        this.accountWs = socket;
        this.accountEndpointIndex = idx;
        return socket;
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error('Account WebSocket failed');
      }
    }

    throw lastErr ?? new Error('Unable to connect to Deriv account WebSocket');
  }

  private async authorizeAccountSocket(): Promise<void> {
    if (!this.apiToken) {
      return;
    }

    this.updateAccount({ isAuthorizing: true, authError: null });

    try {
      const socket = await this.ensureAccountSocketOpen();
      const authRes = await this.sendAccountRequest(socket, { authorize: this.apiToken });
      const auth = authRes.authorize as
        | {
            loginid?: string;
            is_virtual?: number;
            currency?: string;
            balance?: number | string;
            email?: string;
            account_list?: Array<{
              loginid?: string;
              is_virtual?: number;
              currency?: string;
              is_disabled?: number;
            }>;
          }
        | undefined;

      if (!auth || !auth.loginid) {
        throw new Error('Authorization response missing account details.');
      }

      const actualType: 'demo' | 'real' = auth.is_virtual === 1 ? 'demo' : 'real';
      const parsedBalance = Number(auth.balance);
      const accounts: DerivAccountSummary[] = Array.isArray(auth.account_list)
        ? auth.account_list
            .filter((a) => Boolean(a.loginid))
            .map((a) => ({
              loginid: String(a.loginid),
              accountType: a.is_virtual === 1 ? 'demo' : 'real',
              currency: String(a.currency || auth.currency || 'USD'),
              isDisabled: a.is_disabled === 1,
            }))
        : [];

      const mismatchWarning =
        this.accountSession.mode !== 'public' && this.accountSession.mode !== actualType
          ? `Token belongs to a ${actualType.toUpperCase()} account (${auth.loginid}), while ${this.accountSession.mode.toUpperCase()} mode was selected.`
          : null;

      this.updateAccount({
        isAuthorized: true,
        isAuthorizing: false,
        loginid: auth.loginid,
        actualAccountType: actualType,
        currency: auth.currency || 'USD',
        balance: Number.isFinite(parsedBalance) ? parsedBalance : null,
        email: auth.email || null,
        accounts,
        authError: mismatchWarning,
      });

      // Subscribe to read-only live balance updates for the connected Deriv account
      try {
        if (this.balanceSubscriptionId) {
          await this.sendAccountRequest(socket, { forget: this.balanceSubscriptionId }).catch(() => {});
        }
        const balRes = await this.sendAccountRequest(socket, { balance: 1, subscribe: 1 });
        const balSub = balRes.subscription as { id?: string } | undefined;
        if (balSub?.id) {
          this.balanceSubscriptionId = balSub.id;
        }
      } catch {
        // Balance subscription optional; authorize already includes initial balance
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Account WebSocket authorization failed';
      this.updateAccount({
        isAuthorized: false,
        isAuthorizing: false,
        loginid: null,
        actualAccountType: null,
        currency: null,
        balance: null,
        authError: msg,
      });
      this.callbacks.onError(`Deriv Account Auth: ${msg}`);
    }
  }

  private async bootstrapSession(): Promise<void> {
    const subscribeTicks = async () => {
      try {
        await this.subscribeToMarketTicks(this.activeSymbol, this.historyCount);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : `Failed to subscribe to ${this.activeSymbol}`;
        this.callbacks.onError(msg);
      }
    };

    const validateSymbols = async () => {
      try {
        const symRes = await this.sendRequest({
          active_symbols: 'brief',
        });

        const activeList = (symRes.active_symbols as ActiveSymbolInfo[] | undefined) || [];
        const validated = new Map<MarketSymbol, ActiveSymbolInfo>();

        for (const item of activeList) {
          const symName = item.underlying_symbol || item.symbol;
          if (symName && symName in MARKET_MAP) {
            const sym = symName as MarketSymbol;
            validated.set(sym, {
              ...item,
              symbol: sym,
              display_name: item.underlying_symbol_name || item.display_name || MARKET_MAP[sym].name,
            });
            const rawPip = item.pip_size ?? item.pip;
            if (typeof rawPip === 'number' && rawPip > 0) {
              this.symbolPipMap.set(sym, resolvePipPrecision(rawPip).pipSize);
            }
          }
        }

        this.updateStatus({ validatedSymbolCount: validated.size });
        this.callbacks.onActiveSymbolsValidated(validated);
      } catch {
        // Symbol catalog metadata is optional; keep streaming ticks using MARKET_MAP defaults
      }
    };

    const authorizeIfConfigured = async () => {
      if (this.apiToken && !this.accountSession.isAuthorized) {
        await this.authorizeAccountSocket();
      }
    };

    // Always start Public WS live tick stream first; validate symbols & optionally authorize account in parallel
    await subscribeTicks();
    void Promise.allSettled([validateSymbols(), authorizeIfConfigured()]);
  }

  private emitInitialLiveTick(symbol: MarketSymbol, liveRes: Record<string, unknown>): void {
    const liveSub = liveRes.subscription as { id?: string } | undefined;
    if (liveSub?.id && this.activeSymbol === symbol) {
      this.currentSubscriptionId = liveSub.id;
    }

    if (liveRes.tick && this.activeSymbol === symbol) {
      const rawTick = liveRes.tick as Record<string, unknown>;
      const fallbackPip = this.symbolPipMap.get(symbol) ?? MARKET_MAP[symbol].defaultPipSize;
      const normalized = normalizeDerivTick(
        {
          symbol,
          quote: rawTick.quote as number | string | undefined,
          epoch: rawTick.epoch as number | string | undefined,
          pip_size: rawTick.pip_size as number | string | undefined,
          id: (rawTick.id as string | undefined) || liveSub?.id,
        },
        symbol,
        fallbackPip
      );
      if (normalized) {
        this.symbolPipMap.set(symbol, normalized.pipSize);
        this.updateStatus({
          lastLiveTickAt: Date.now(),
          liveTickCount: this.status.liveTickCount + 1,
        });
        this.callbacks.onLiveTick(normalized);
      }
    }
  }

  private async subscribeToMarketTicks(symbol: MarketSymbol, count = 1000): Promise<void> {
    const requestCount = Math.max(50, Math.min(1000, count));

    // Step 1: Immediately open the live tick stream using lightweight { ticks, subscribe: 1 }
    let liveRes: Record<string, unknown>;
    try {
      liveRes = await this.sendRequest({ ticks: symbol, subscribe: 1 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('already subscribed')) {
        await this.sendRequest({ forget_all: 'ticks' }).catch(() => {});
        liveRes = await this.sendRequest({ ticks: symbol, subscribe: 1 });
      } else {
        throw err;
      }
    }

    if (this.activeSymbol !== symbol) {
      const staleSub = liveRes.subscription as { id?: string } | undefined;
      if (staleSub?.id && this.ws?.readyState === WebSocket.OPEN) {
        void this.sendRequest({ forget: staleSub.id }).catch(() => {});
      }
      return;
    }

    this.emitInitialLiveTick(symbol, liveRes);

    // Step 2: Hydrate recent historical ticks independently (without subscribe: 1)
    try {
      const histRes = await this.sendRequest({
        ticks_history: symbol,
        adjust_start_time: 1,
        count: requestCount,
        end: 'latest',
        style: 'ticks',
      });

      if (this.activeSymbol === symbol) {
        const ticks = this.parseHistoryResponse(symbol, histRes);
        if (ticks.length > 0) {
          this.callbacks.onHistoryReceived(symbol, ticks);
        }
      }
    } catch {
      // Live tick stream continues cleanly even if bulk history request is throttled
    }
  }

  private parseHistoryResponse(symbol: MarketSymbol, res: Record<string, unknown>): TickRecord[] {
    const history = res.history as
      | { prices?: Array<number | string>; times?: Array<number | string>; pip_size?: number | string }
      | undefined;

    const topPip = Number(res.pip_size);
    const histPip = Number(history?.pip_size);
    const rawPip =
      Number.isFinite(topPip) && topPip > 0
        ? topPip
        : Number.isFinite(histPip) && histPip > 0
          ? histPip
          : this.symbolPipMap.get(symbol) ?? MARKET_MAP[symbol].defaultPipSize;

    const pipSize = resolvePipPrecision(rawPip).pipSize;
    this.symbolPipMap.set(symbol, pipSize);

    if (!history || !Array.isArray(history.prices) || !Array.isArray(history.times)) {
      return [];
    }

    const len = Math.min(history.prices.length, history.times.length);
    const records: TickRecord[] = [];
    for (let i = 0; i < len; i++) {
      const normalized = normalizeDerivTick(
        {
          symbol,
          quote: history.prices[i],
          epoch: history.times[i],
          pip_size: pipSize,
        },
        symbol,
        pipSize
      );
      if (normalized) {
        records.push(normalized);
      }
    }
    return records;
  }

  private handleMessage(rawData: string): void {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    const now = Date.now();
    this.status.lastMessageAt = now;

    if (data.msg_type === 'ping' && this.pingSentAt !== null) {
      const latencyMs = Math.max(1, now - this.pingSentAt);
      this.pingSentAt = null;
      this.updateStatus({ latencyMs, lastMessageAt: now });
    }

    const reqId = typeof data.req_id === 'number' ? data.req_id : null;
    if (reqId !== null && this.pendingRequests.has(reqId)) {
      const pending = this.pendingRequests.get(reqId)!;
      this.pendingRequests.delete(reqId);
      window.clearTimeout(pending.timeoutId);

      if (data.error) {
        const errObj = data.error as { message?: string; code?: string };
        pending.reject(new Error(errObj.message || errObj.code || 'Deriv API error'));
      } else {
        pending.resolve(data);
      }
      return;
    }

    if (data.error) {
      const errObj = data.error as { message?: string; code?: string };
      const msg = errObj.message || 'Deriv stream error';
      if (errObj.code === 'InvalidAppID' && this.appId !== '1089') {
        this.appId = '1089';
        this.reconnectNow(this.activeSymbol);
        return;
      }
      this.updateStatus({ errorMessage: msg });
      this.callbacks.onError(msg);
      return;
    }

    if (data.msg_type === 'balance' && data.balance) {
      const rawBal = data.balance as {
        balance?: number | string;
        currency?: string;
        loginid?: string;
      };
      const balVal = Number(rawBal.balance);
      if (Number.isFinite(balVal)) {
        this.updateAccount({
          balance: balVal,
          currency: rawBal.currency || this.accountSession.currency,
          loginid: rawBal.loginid || this.accountSession.loginid,
        });
      }
      return;
    }

    if (data.msg_type === 'tick' && data.tick) {
      const rawTick = data.tick as {
        symbol?: string;
        underlying_symbol?: string;
        quote?: number | string;
        epoch?: number | string;
        pip_size?: number | string;
        id?: string;
      };
      const subObj = data.subscription as { id?: string } | undefined;
      const incomingSubId = rawTick.id || subObj?.id;

      const sym = (rawTick.underlying_symbol || rawTick.symbol || this.activeSymbol) as MarketSymbol;
      if (!(sym in MARKET_MAP)) return;

      if (sym !== this.activeSymbol) return;
      if (this.currentSubscriptionId && incomingSubId && incomingSubId !== this.currentSubscriptionId) {
        return;
      }
      if (!this.currentSubscriptionId && incomingSubId) {
        this.currentSubscriptionId = incomingSubId;
      }

      const fallbackPip = this.symbolPipMap.get(sym) ?? MARKET_MAP[sym].defaultPipSize;
      const normalized = normalizeDerivTick(
        {
          symbol: sym,
          quote: rawTick.quote,
          epoch: rawTick.epoch,
          pip_size: rawTick.pip_size,
          id: incomingSubId,
        },
        sym,
        fallbackPip
      );
      if (normalized) {
        this.symbolPipMap.set(sym, normalized.pipSize);
        this.updateStatus({
          lastMessageAt: now,
          lastLiveTickAt: now,
          liveTickCount: this.status.liveTickCount + 1,
        });
        this.callbacks.onLiveTick(normalized);
      }
    }
  }

  private sendRequest(
    payload: Record<string, unknown>,
    timeoutMs = 12000
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket is not open'));
        return;
      }

      const reqId = this.reqIdCounter++;
      const timeoutId = window.setTimeout(() => {
        this.pendingRequests.delete(reqId);
        reject(new Error('Deriv API request timed out'));
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timeoutId });

      try {
        this.ws.send(JSON.stringify({ ...payload, req_id: reqId }));
      } catch (err) {
        window.clearTimeout(timeoutId);
        this.pendingRequests.delete(reqId);
        reject(err instanceof Error ? err : new Error('Failed to send WebSocket message'));
      }
    });
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingTimer = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.pingSentAt = Date.now();
        void this.sendRequest({ ping: 1 }, 8000).catch(() => {
          // Ping timeout handled gracefully
        });
      }
    }, 25000);
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private startWatchdogLoop(): void {
    this.stopWatchdogLoop();
    this.watchdogTimer = window.setInterval(() => {
      if (
        !this.ws ||
        this.ws.readyState !== WebSocket.OPEN ||
        this.manualDisconnect ||
        this.watchdogRetrying
      ) {
        return;
      }

      const now = Date.now();
      const referenceTime = this.status.lastLiveTickAt ?? this.connectedAt ?? now;
      if (now - referenceTime > 10000) {
        this.watchdogRetrying = true;
        void this.resubscribeTicks().finally(() => {
          this.watchdogRetrying = false;
        });
      }
    }, 4500);
  }

  private stopWatchdogLoop(): void {
    if (this.watchdogTimer !== null) {
      window.clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const attempt = this.status.reconnectAttempt + 1;
    const baseDelay = Math.min(30000, 1000 * Math.pow(2, Math.min(attempt - 1, 5)));
    const jitter = Math.floor(Math.random() * 500);

    this.updateStatus({ reconnectAttempt: attempt });
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.manualDisconnect) {
        this.connect(this.activeSymbol);
      }
    }, baseDelay + jitter);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeoutTimer !== null) {
      window.clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [, req] of this.pendingRequests) {
      window.clearTimeout(req.timeoutId);
      req.reject(err);
    }
    this.pendingRequests.clear();
  }

  private updateStatus(patch: Partial<ConnectionStatusInfo>): void {
    this.status = { ...this.status, ...patch };
    this.callbacks.onStatusChange({ ...this.status });
  }

  private updateAccount(patch: Partial<AccountSessionInfo>): void {
    this.accountSession = { ...this.accountSession, ...patch };
    this.callbacks.onAccountChange?.({ ...this.accountSession });
  }
}
