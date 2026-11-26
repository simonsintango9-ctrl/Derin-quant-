import { MarketDefinition, MarketSymbol, UserSettings } from '../types/deriv';

export const DERIV_WS_ENDPOINT = 'wss://ws.derivws.com/websockets/v3';
export const DERIV_WS_ENDPOINTS = [
  'wss://ws.derivws.com/websockets/v3',
  'wss://ws.binaryws.com/websockets/v3',
] as const;
export const DEFAULT_DERIV_APP_ID = '1089';

export const SUPPORTED_MARKETS: MarketDefinition[] = [
  {
    symbol: '1HZ10V',
    name: 'Volatility 10 (1s) Index',
    shortName: 'Vol 10 (1s)',
    category: 'Volatility (1s)',
    defaultPipSize: 0.01,
  },
  {
    symbol: '1HZ25V',
    name: 'Volatility 25 (1s) Index',
    shortName: 'Vol 25 (1s)',
    category: 'Volatility (1s)',
    defaultPipSize: 0.01,
  },
  {
    symbol: '1HZ50V',
    name: 'Volatility 50 (1s) Index',
    shortName: 'Vol 50 (1s)',
    category: 'Volatility (1s)',
    defaultPipSize: 0.01,
  },
  {
    symbol: '1HZ75V',
    name: 'Volatility 75 (1s) Index',
    shortName: 'Vol 75 (1s)',
    category: 'Volatility (1s)',
    defaultPipSize: 0.01,
  },
  {
    symbol: '1HZ100V',
    name: 'Volatility 100 (1s) Index',
    shortName: 'Vol 100 (1s)',
    category: 'Volatility (1s)',
    defaultPipSize: 0.01,
  },
  {
    symbol: 'R_10',
    name: 'Volatility 10 Index',
    shortName: 'Vol 10',
    category: 'Standard Volatility',
    defaultPipSize: 0.001,
  },
  {
    symbol: 'R_25',
    name: 'Volatility 25 Index',
    shortName: 'Vol 25',
    category: 'Standard Volatility',
    defaultPipSize: 0.001,
  },
  {
    symbol: 'R_50',
    name: 'Volatility 50 Index',
    shortName: 'Vol 50',
    category: 'Standard Volatility',
    defaultPipSize: 0.0001,
  },
  {
    symbol: 'R_75',
    name: 'Volatility 75 Index',
    shortName: 'Vol 75',
    category: 'Standard Volatility',
    defaultPipSize: 0.0001,
  },
  {
    symbol: 'R_100',
    name: 'Volatility 100 Index',
    shortName: 'Vol 100',
    category: 'Standard Volatility',
    defaultPipSize: 0.01,
  },
];

export const MARKET_MAP: Record<MarketSymbol, MarketDefinition> = SUPPORTED_MARKETS.reduce(
  (acc, item) => {
    acc[item.symbol] = item;
    return acc;
  },
  {} as Record<MarketSymbol, MarketDefinition>
);

export const DEFAULT_USER_SETTINGS: UserSettings = {
  appId: DEFAULT_DERIV_APP_ID,
  selectedMarket: '1HZ100V',
  theme: 'light',
  tickHistorySize: 1000,
  analysisWindowPreset: 100,
  customWindowSize: 150,
  scannerIntervalSeconds: 25,
  signalRefreshIntervalSeconds: 12,
  markovAlphaSmoothing: 0.5,
  autoReconnect: true,
  autoGenerateSignals: true,
  notificationsEnabled: true,
  compactMode: false,
  signalCardOrder: ['MATCHES', 'DIFFERS', 'EVEN', 'ODD'],
  chartVisibility: {
    digitFrequency: true,
    multiWindowComparison: true,
    rollingFrequency: true,
    probabilityComparison: true,
    markovHeatmap: true,
    signalPerformance: true,
    multiMarketComparison: true,
  },
  thresholds: {
    minSampleSize: 50,
    lowConfidenceMaxScore: 0.35,
    moderateConfidenceMaxScore: 0.55,
    highConfidenceMaxScore: 0.75,
    veryHighConfidenceMinScore: 0.75,
  },
};
