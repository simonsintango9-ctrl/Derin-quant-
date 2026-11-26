import { DERIV_WS_ENDPOINT, DERIV_WS_ENDPOINTS, MARKET_MAP } from '../constants/markets';
import { ConnectionStatusInfo, MarketSymbol, TickRecord } from '../types/deriv';
import { normalizeDerivTick, resolvePipPrecision } from './digitExtractionEngine';

export interface ActiveSymbolInfo {
  symbol: string;
  display_name: string;
  pip?: number;
  pip_size?: number;
  exchange_is_open: number;
}

export interface ConnectionCallbacks {
  onStatusChange: (status: ConnectionStatusInfo) => void;
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
  private appId: string;
  private autoReconnect: boolean;
  private historyCount: number;
  private callbacks: ConnectionCallbacks;

  private status: ConnectionStatusInfo;
  private manualDisconnect = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private pingSentAt: number | null = null;
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
    historyCount = 1000
  ) {
    this.appId = appId;
    this.activeSymbol = initialMarket;
    this.autoReconnect = autoReconnect;
    this.historyCount = Math.max(100, Math.min(5000, historyCount));
    this.callbacks = callbacks;

    this.status = {
      state: 'disconnected',
      appId,
      endpoint: DERIV_WS_ENDPOINT,
      lastMessageAt: null,
      reconnectAttempt: 0,
      errorMessage: null,
      validatedSymbolCount: 0,
      latencyMs: null,
    };
  }

  public getStatus(): ConnectionStatusInfo {
    return { ...this.status };
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

    if (
      appChanged &&
      (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING)
    ) {
      this.disconnect();
      this.connect(this.activeSymbol);
    }
  }

  public connect(market?: MarketSymbol): void {
    if (market) {
      this.activeSymbol = market;
    }

    this.manualDisconnect = false;
    this.clearReconnectTimer();

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const sanitizedAppId = this.appId.trim() || '1089';
    const endpoint = DERIV_WS_ENDPOINTS[this.endpointIndex % DERIV_WS_ENDPOINTS.length];
    const url = `${endpoint}?app_id=${encodeURIComponent(sanitizedAppId)}`;

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

      socket.onopen = () => {
        if (this.ws !== socket) return;
        openedOnce = true;
        this.updateStatus({
          state: 'connected',
          endpoint,
          reconnectAttempt: 0,
          errorMessage: null,
          lastMessageAt: Date.now(),
        });
        this.startPingLoop();
        void this.bootstrapSession();
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        this.handleMessage(event.data);
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        if (this.status.reconnectAttempt === 0) {
          this.callbacks.onError(`WebSocket transport error connecting to ${endpoint}`);
        }
      };

      socket.onclose = (event) => {
        if (this.ws !== socket) return;
        this.stopPingLoop();
        this.rejectAllPending(new Error('WebSocket connection closed'));
        this.currentSubscriptionId = null;

        if (this.manualDisconnect) {
          this.updateStatus({
            state: 'disconnected',
            reconnectAttempt: 0,
          });
          return;
        }

        // Rotate to fallback Deriv endpoint if handshake never succeeded
        if (!openedOnce) {
          this.endpointIndex = (this.endpointIndex + 1) % DERIV_WS_ENDPOINTS.length;
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
      const msg = err instanceof Error ? err.message : 'Failed to initialize WebSocket connection';
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
    this.stopPingLoop();
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

    this.currentSubscriptionId = null;
    this.updateStatus({
      state: 'disconnected',
      reconnectAttempt: 0,
      latencyMs: null,
    });
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

  public async fetchSnapshotHistory(symbol: MarketSymbol, count = 200): Promise<TickRecord[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to Deriv WebSocket');
    }

    const res = await this.sendRequest({
      ticks_history: symbol,
      adjust_start_time: 1,
      count,
      end: 'latest',
      style: 'ticks',
    });

    return this.parseHistoryResponse(symbol, res);
  }

  private async bootstrapSession(): Promise<void> {
    const validateSymbols = async () => {
      try {
        const symRes = await this.sendRequest({
          active_symbols: 'brief',
          product_type: 'basic',
        });

        const activeList = (symRes.active_symbols as ActiveSymbolInfo[] | undefined) || [];
        const validated = new Map<MarketSymbol, ActiveSymbolInfo>();

        for (const item of activeList) {
          if (item.symbol in MARKET_MAP) {
            const sym = item.symbol as MarketSymbol;
            validated.set(sym, item);
            const rawPip = item.pip_size ?? item.pip;
            if (typeof rawPip === 'number' && rawPip > 0) {
              this.symbolPipMap.set(sym, resolvePipPrecision(rawPip).pipSize);
            }
          }
        }

        this.updateStatus({ validatedSymbolCount: validated.size });
        this.callbacks.onActiveSymbolsValidated(validated);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to validate active symbols';
        this.callbacks.onError(msg);
      }
    };

    const subscribeTicks = async () => {
      try {
        await this.subscribeToMarketTicks(this.activeSymbol, this.historyCount);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : `Failed to subscribe to ${this.activeSymbol}`;
        this.callbacks.onError(msg);
      }
    };

    // Start live tick subscription immediately in parallel with symbol validation
    await Promise.allSettled([subscribeTicks(), validateSymbols()]);
  }

  private async subscribeToMarketTicks(symbol: MarketSymbol, count = 1000): Promise<void> {
    let res: Record<string, unknown>;
    try {
      res = await this.sendRequest({
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: 'latest',
        style: 'ticks',
        subscribe: 1,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('already subscribed')) {
        await this.sendRequest({ forget_all: 'ticks' }).catch(() => {});
        res = await this.sendRequest({
          ticks_history: symbol,
          adjust_start_time: 1,
          count,
          end: 'latest',
          style: 'ticks',
          subscribe: 1,
        });
      } else {
        throw err;
      }
    }

    // Guard against stale rapid market-switch resolution
    if (this.activeSymbol !== symbol) {
      const staleSub = res.subscription as { id?: string } | undefined;
      if (staleSub?.id && this.ws?.readyState === WebSocket.OPEN) {
        void this.sendRequest({ forget: staleSub.id }).catch(() => {});
      }
      return;
    }

    const sub = res.subscription as { id?: string } | undefined;
    if (sub?.id) {
      this.currentSubscriptionId = sub.id;
    } else if (this.activeSymbol === symbol && this.ws?.readyState === WebSocket.OPEN) {
      // Fallback: guarantee live tick stream subscription if ticks_history omitted subscription
      try {
        const liveRes = await this.sendRequest({ ticks: symbol, subscribe: 1 });
        const liveSub = liveRes.subscription as { id?: string } | undefined;
        if (liveSub?.id && this.activeSymbol === symbol) {
          this.currentSubscriptionId = liveSub.id;
        }
      } catch {
        // Ignore fallback failure if already streaming
      }
    }

    const ticks = this.parseHistoryResponse(symbol, res);
    this.callbacks.onHistoryReceived(symbol, ticks);
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
      const errObj = data.error as { message?: string };
      const msg = errObj.message || 'Deriv stream error';
      this.updateStatus({ errorMessage: msg });
      this.callbacks.onError(msg);
      return;
    }

    if (data.msg_type === 'tick' && data.tick) {
      const rawTick = data.tick as {
        symbol?: string;
        quote?: number | string;
        epoch?: number | string;
        pip_size?: number | string;
        id?: string;
      };

      const sym = (rawTick.symbol || this.activeSymbol) as MarketSymbol;
      if (!(sym in MARKET_MAP)) return;

      if (sym !== this.activeSymbol) return;
      if (this.currentSubscriptionId && rawTick.id && rawTick.id !== this.currentSubscriptionId) {
        return;
      }

      const fallbackPip = this.symbolPipMap.get(sym) ?? MARKET_MAP[sym].defaultPipSize;
      const normalized = normalizeDerivTick(rawTick, sym, fallbackPip);
      if (normalized) {
        this.symbolPipMap.set(sym, normalized.pipSize);
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
}
