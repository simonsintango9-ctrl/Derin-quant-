export type MarketSymbol =
  | '1HZ10V'
  | '1HZ25V'
  | '1HZ50V'
  | '1HZ75V'
  | '1HZ100V'
  | 'R_10'
  | 'R_25'
  | 'R_50'
  | 'R_75'
  | 'R_100';

export type MarketCategory = 'Volatility (1s)' | 'Standard Volatility';

export interface MarketDefinition {
  symbol: MarketSymbol;
  name: string;
  shortName: string;
  category: MarketCategory;
  defaultPipSize: number;
  apiValidated?: boolean;
  isMarketOpen?: boolean;
  actualPipSize?: number;
}

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export interface ConnectionStatusInfo {
  state: ConnectionState;
  appId: string;
  endpoint: string;
  lastMessageAt: number | null;
  reconnectAttempt: number;
  errorMessage: string | null;
  validatedSymbolCount: number;
  latencyMs: number | null;
}

export interface TickRecord {
  symbol: MarketSymbol;
  epoch: number; // Unix timestamp in seconds
  receivedAt: number; // Client timestamp in ms
  quote: number;
  formattedQuote: string;
  pipSize: number;
  decimals: number;
  lastDigit: number; // 0-9
  subscriptionId?: string;
}

export type WindowPreset = 50 | 100 | 200 | 'custom';

export interface DigitMetric {
  digit: number;
  count: number;
  frequency: number; // 0 to 1
  percentage: number; // 0 to 100
  deviationFromUniform: number; // percentage points (e.g., +2.4 or -1.8)
  ticksSinceLast: number; // 0 means appeared on most recent tick
  maxHistoricalGap: number;
  momentumDelta: number; // percentage points change: recent half vs prior half
  isHot: boolean;
  isCold: boolean;
  zScore: number;
}

export interface RepeatingPatternReport {
  currentStreakDigit: number | null;
  currentStreakLength: number;
  longestConsecutiveDigit: number | null;
  longestConsecutiveLength: number;
  consecutiveRepeatRate: number; // % of ticks matching previous digit (baseline 10%)
  topBigrams: Array<{ sequence: string; count: number; percentage: number }>;
  topTrigrams: Array<{ sequence: string; count: number; percentage: number }>;
  shortTermShiftScore: number; // Total variation distance between recent 25 ticks and prior window
}

export interface WindowComparison {
  shortWindow: number;
  longWindow: number;
  digitDeltas: Array<{
    digit: number;
    shortPct: number;
    longPct: number;
    deltaPct: number;
  }>;
  totalVariationDistance: number; // 0 to 1
  stabilityIndex: number; // 0 to 100 (higher = more consistent across windows)
}

export interface StatisticalAnalysisResult {
  symbol: MarketSymbol;
  windowSize: number;
  totalAvailableTicks: number;
  digits: DigitMetric[];
  hotDigits: DigitMetric[];
  coldDigits: DigitMetric[];
  mostOverdueDigit: DigitMetric | null;
  patterns: RepeatingPatternReport;
  comparison50v200: WindowComparison | null;
  shannonEntropy: number; // Max is log2(10) ≈ 3.3219 bits
  normalizedEntropy: number; // 0 to 1
}

export interface MarkovTransition {
  fromDigit: number;
  toDigit: number;
  count: number;
  rawProbability: number;
  smoothedProbability: number;
  liftOverUniform: number;
}

export interface MarkovAnalysisResult {
  sampleTransitions: number;
  alphaSmoothing: number;
  countMatrix: number[][]; // 10x10
  rawMatrix: number[][]; // 10x10
  smoothedMatrix: number[][]; // 10x10
  rowTotals: number[];
  topTransitions: MarkovTransition[];
  currentLastDigit: number | null;
  conditionalFromCurrent: MarkovTransition[];
}

export interface DigitProbabilityEstimate {
  digit: number;
  empiricalProb: number;
  markovConditionalProb: number | null;
  blendedEstimate: number;
  uniformBaseline: number; // 0.10
  ciLow: number; // Wilson 95% lower
  ciHigh: number; // Wilson 95% upper
  standardError: number;
  zScore: number;
}

export interface AnomalyAlert {
  id: string;
  severity: 'info' | 'warning' | 'alert';
  title: string;
  description: string;
}

export interface ProbabilityReport {
  sampleSize: number;
  isSampleSufficient: boolean;
  minimumRecommendedSample: number;
  chiSquareStatistic: number;
  degreesOfFreedom: number; // 9
  chiSquarePValue: number;
  isStatisticallySignificant: boolean; // p < 0.05 and all expected >= 5
  estimates: DigitProbabilityEstimate[];
  rollingFrequencySeries: Array<{
    tickIndex: number;
    epoch: number;
    frequencies: number[]; // length 10 (0-9) in %
  }>;
  anomalies: AnomalyAlert[];
  outOfSampleValidation: {
    trainSize: number;
    testSize: number;
    trainTopDigit: number | null;
    testTopDigitHitRate: number | null; // % in held-out slice
    baselineRate: number; // 10%
  };
}

export type SignalCategory = 'MATCHES' | 'DIFFERS' | 'EVEN' | 'ODD';

export type SignalQualityTier =
  | 'Insufficient Data'
  | 'Very Low Confidence'
  | 'Low Confidence'
  | 'Moderate Confidence'
  | 'High Confidence'
  | 'Very High Confidence';

export interface QuantSignal {
  id: string;
  symbol: MarketSymbol;
  category: SignalCategory;
  targetDigit: number;
  targetLabel?: string; // e.g., "MATCH DIGIT 4" or "EVEN (0,2,4,6,8)"
  estimatedProbability: number; // 0 to 1
  confidenceInterval: [number, number];
  historicalFrequency: number; // 0 to 1
  baselineProbability: number; // 0.10 for MATCHES, 0.90 for DIFFERS, 0.50 for EVEN/ODD
  sampleSize: number;
  windowUsed: number;
  modelAgreementScore: number; // 0 to 1 (how many independent models agree)
  modelsSupporting: string[];
  statisticalReliability: SignalQualityTier;
  evidenceSummary: string;
  generatedAt: number; // ms timestamp
  anchorTickEpoch: number;
  validitySeconds: number;
  expiresAt: number;
  modelName: string;
}

export type SignalOutcome = 'PENDING' | 'CORRECT' | 'INCORRECT';

export interface SignalRecord {
  id: string;
  symbol: MarketSymbol;
  category: SignalCategory;
  targetDigit: number;
  estimatedProbability: number;
  historicalFrequency: number;
  sampleSize: number;
  windowUsed: number;
  reliabilityTier: SignalQualityTier;
  modelUsed: string;
  generatedAt: number;
  anchorTickEpoch: number;
  evaluatedAt: number | null;
  observedTickEpoch: number | null;
  actualNextDigit: number | null;
  outcome: SignalOutcome;
}

export interface PerformanceBreakdownItem {
  label: string;
  total: number;
  correct: number;
  incorrect: number;
  accuracyPct: number;
}

export interface PerformanceSummary {
  totalRecorded: number;
  evaluatedCount: number;
  pendingCount: number;
  correctCount: number;
  incorrectCount: number;
  accuracyPct: number;
  byCategory: PerformanceBreakdownItem[];
  byMarket: PerformanceBreakdownItem[];
  byWindow: PerformanceBreakdownItem[];
  byTimePeriod: PerformanceBreakdownItem[];
  cumulativeAccuracySeries: Array<{
    index: number;
    timestamp: number;
    accuracyPct: number;
    outcome: SignalOutcome;
  }>;
}

export interface ScannerMarketSummary {
  symbol: MarketSymbol;
  name: string;
  category: MarketCategory;
  latestQuote: string | null;
  latestDigit: number | null;
  lastUpdatedEpoch: number | null;
  sampleCount: number;
  chiSquareStatistic: number;
  chiSquarePValue: number;
  maxDeviationPct: number;
  topHotDigit: number | null;
  topHotPct: number | null;
  topColdDigit: number | null;
  topColdPct: number | null;
  dispersionScore: number; // Statistical dispersion metric (NOT a prediction guarantee)
  anomalyDetected: boolean;
  status: 'idle' | 'scanning' | 'ready' | 'error';
  errorMessage?: string;
}

export interface ClassificationThresholds {
  minSampleSize: number; // e.g., 50
  lowConfidenceMaxScore: number;
  moderateConfidenceMaxScore: number;
  highConfidenceMaxScore: number;
  veryHighConfidenceMinScore: number;
}

export interface ChartVisibilityConfig {
  digitFrequency: boolean;
  multiWindowComparison: boolean;
  rollingFrequency: boolean;
  probabilityComparison: boolean;
  markovHeatmap: boolean;
  signalPerformance: boolean;
  multiMarketComparison: boolean;
}

export interface UserSettings {
  appId: string;
  selectedMarket: MarketSymbol;
  theme: 'light' | 'dark';
  tickHistorySize: number;
  analysisWindowPreset: WindowPreset;
  customWindowSize: number;
  scannerIntervalSeconds: number;
  signalRefreshIntervalSeconds: number;
  markovAlphaSmoothing: number;
  autoReconnect: boolean;
  autoGenerateSignals: boolean;
  notificationsEnabled: boolean;
  compactMode: boolean;
  signalCardOrder: SignalCategory[];
  chartVisibility: ChartVisibilityConfig;
  thresholds: ClassificationThresholds;
}

export interface EngineDiagnosticResult {
  name: string;
  passed: boolean;
  details: string;
}
