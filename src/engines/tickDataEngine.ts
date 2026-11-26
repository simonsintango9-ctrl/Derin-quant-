import { MarketSymbol, TickRecord } from '../types/deriv';

/**
 * Maintains deduplicated, chronologically ordered rolling tick histories per market.
 */
export class TickDataEngine {
  private buffers = new Map<MarketSymbol, TickRecord[]>();
  private seenEpochs = new Map<MarketSymbol, Set<number>>();
  private maxBufferSize: number;

  constructor(maxBufferSize = 1000) {
    this.maxBufferSize = Math.max(100, Math.min(5000, maxBufferSize));
  }

  public setMaxBufferSize(size: number): void {
    this.maxBufferSize = Math.max(100, Math.min(5000, size));
    for (const [symbol, list] of this.buffers.entries()) {
      if (list.length > this.maxBufferSize) {
        const trimmed = list.slice(-this.maxBufferSize);
        this.buffers.set(symbol, trimmed);
        this.seenEpochs.set(symbol, new Set(trimmed.map((t) => t.epoch)));
      }
    }
  }

  /**
   * Bulk-loads historical ticks (e.g. from ticks_history or IndexedDB) with deduplication.
   */
  public mergeHistory(symbol: MarketSymbol, incoming: TickRecord[]): TickRecord[] {
    if (!incoming.length) {
      return this.getTicks(symbol);
    }

    const existing = this.buffers.get(symbol) || [];
    const epochMap = new Map<number, TickRecord>();

    for (const tick of existing) {
      epochMap.set(tick.epoch, tick);
    }
    for (const tick of incoming) {
      if (Number.isFinite(tick.epoch) && tick.epoch > 0 && tick.lastDigit >= 0 && tick.lastDigit <= 9) {
        epochMap.set(tick.epoch, tick);
      }
    }

    const merged = Array.from(epochMap.values())
      .sort((a, b) => a.epoch - b.epoch)
      .slice(-this.maxBufferSize);

    this.buffers.set(symbol, merged);
    this.seenEpochs.set(symbol, new Set(merged.map((t) => t.epoch)));
    return merged;
  }

  /**
   * Appends a single live tick if it is valid and not a duplicate epoch.
   * Returns true if accepted, false if duplicate or out-of-order stale tick.
   */
  public appendLiveTick(tick: TickRecord): boolean {
    const symbol = tick.symbol;
    let list = this.buffers.get(symbol);
    let seen = this.seenEpochs.get(symbol);

    if (!list || !seen) {
      list = [];
      seen = new Set<number>();
      this.buffers.set(symbol, list);
      this.seenEpochs.set(symbol, seen);
    }

    // Duplicate protection
    if (seen.has(tick.epoch)) {
      return false;
    }

    // Reject stale out-of-order ticks older than latest recorded epoch
    if (list.length > 0 && tick.epoch < list[list.length - 1].epoch) {
      return false;
    }

    list.push(tick);
    seen.add(tick.epoch);

    if (list.length > this.maxBufferSize) {
      const removed = list.shift();
      if (removed) {
        seen.delete(removed.epoch);
      }
    }

    return true;
  }

  public getTicks(symbol: MarketSymbol, limit?: number): TickRecord[] {
    const list = this.buffers.get(symbol) || [];
    if (!limit || limit >= list.length) {
      return [...list];
    }
    return list.slice(-limit);
  }

  public getLatestTick(symbol: MarketSymbol): TickRecord | null {
    const list = this.buffers.get(symbol);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  public getTickCount(symbol: MarketSymbol): number {
    return this.buffers.get(symbol)?.length || 0;
  }

  public clearMarket(symbol: MarketSymbol): void {
    this.buffers.delete(symbol);
    this.seenEpochs.delete(symbol);
  }

  public clearAll(): void {
    this.buffers.clear();
    this.seenEpochs.clear();
  }
}
