import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface DigitPredictionBody {
  symbol?: string;
  marketName?: string;
  windowSize?: number;
  analysisMode?: string;
  analysisDurationSeconds?: number;
  recentDigits?: number[];
  currentLastDigit?: number | null;
  frequencyStdDev?: number;
  quoteStdDev?: number;
  tickVolatility?: number;
  chiSquareStatistic?: number;
  chiSquarePValue?: number;
  normalizedEntropy?: number;
  digitMetrics?: Array<{
    digit: number;
    percentage: number;
    zScore: number;
    momentumDelta: number;
    ticksSinceLast: number;
  }>;
  markovConditionals?: Array<{
    toDigit: number;
    smoothedProbability: number;
    liftOverUniform: number;
  }>;
  signalConfidences?: {
    MATCHES?: number | null;
    DIFFERS?: number | null;
    EVEN?: number | null;
    ODD?: number | null;
  };
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      geminiConfigured: Boolean(getGeminiClient()),
      timestamp: Date.now(),
    });
  });

  app.post('/api/ai/digit-prediction', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const body = (req.body || {}) as DigitPredictionBody;
    if (!body.symbol || !Array.isArray(body.digitMetrics) || body.digitMetrics.length !== 10) {
      res.status(400).json({
        error: 'Invalid analysis payload: symbol and 10 digit metrics (0-9) are required.',
      });
      return;
    }

    const promptContext = {
      market: body.marketName || body.symbol,
      symbol: body.symbol,
      sampleSize: body.windowSize ?? 0,
      analysisMode: body.analysisMode ?? 'ticks',
      durationSeconds: body.analysisDurationSeconds ?? null,
      currentLastDigit: body.currentLastDigit ?? null,
      recentDigits: Array.isArray(body.recentDigits) ? body.recentDigits.slice(-30) : [],
      statisticalEngine: {
        frequencyStdDevPct: Number((body.frequencyStdDev ?? 0).toFixed(3)),
        quoteStdDev: Number((body.quoteStdDev ?? 0).toFixed(5)),
        tickVolatilityPct: Number((body.tickVolatility ?? 0).toFixed(5)),
        chiSquareStatistic: Number((body.chiSquareStatistic ?? 0).toFixed(3)),
        chiSquarePValue: Number((body.chiSquarePValue ?? 1).toFixed(4)),
        normalizedEntropy: Number((body.normalizedEntropy ?? 1).toFixed(4)),
      },
      digitMetrics: body.digitMetrics.map((m) => ({
        digit: m.digit,
        pct: Number(m.percentage.toFixed(2)),
        zScore: Number(m.zScore.toFixed(2)),
        momentum: Number(m.momentumDelta.toFixed(2)),
        absentTicks: m.ticksSinceLast,
      })),
      markovFromCurrent: Array.isArray(body.markovConditionals)
        ? body.markovConditionals.map((c) => ({
            toDigit: c.toDigit,
            probPct: Number((c.smoothedProbability * 100).toFixed(2)),
            lift: Number(c.liftOverUniform.toFixed(3)),
          }))
        : [],
      signalConfidenceScores: body.signalConfidences || {},
    };

    const extractGeminiErrorMessage = (err: unknown): { status: number; message: string; retryable: boolean } => {
      const raw = err instanceof Error ? err.message : 'Failed to generate AI digit prediction.';
      try {
        const outer = JSON.parse(raw) as { error?: { code?: number; message?: string; status?: string } };
        if (outer?.error?.message) {
          const code = Number(outer.error.code) || 502;
          const retryable = code === 503 || code === 429 || outer.error.status === 'UNAVAILABLE';
          return { status: code === 400 || code === 403 || code === 429 ? code : 502, message: outer.error.message, retryable };
        }
      } catch {
        // Not a JSON-wrapped SDK error message
      }
      const retryable = raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('429');
      return { status: 502, message: raw, retryable };
    };

    try {
      let responseText = '';
      let lastErr: unknown = null;
      const maxAttempts = 2;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: `Analyze this live synthetic index digit distribution snapshot and produce a calibrated statistical digit prediction and confidence assessment:\n${JSON.stringify(promptContext)}`,
            config: {
              abortSignal: AbortSignal.timeout(12000),
              systemInstruction:
                'You are a quantitative statistical analyst specializing in synthetic index digit distributions. Analyze empirical frequencies, z-scores, Markov conditional transitions, Shannon entropy, chi-square significance, and tick return volatility. Never promise guaranteed outcomes or financial profits; frame all outputs strictly as probabilistic statistical estimates for research. Keep rationale concise (2-3 sentences).',
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  predictedDigit: {
                    type: Type.INTEGER,
                    description: 'Primary statistical focus digit from 0 to 9.',
                  },
                  runnerUpDigit: {
                    type: Type.INTEGER,
                    description: 'Secondary statistical digit from 0 to 9.',
                  },
                  differsAvoidDigit: {
                    type: Type.INTEGER,
                    description: 'Lowest-momentum or suppressed digit from 0 to 9 for Differs research.',
                  },
                  recommendedCategory: {
                    type: Type.STRING,
                    description: 'One of MATCHES, DIFFERS, EVEN, or ODD.',
                  },
                  parityBias: {
                    type: Type.STRING,
                    description: 'One of EVEN, ODD, or NEUTRAL.',
                  },
                  aiConfidenceScore: {
                    type: Type.INTEGER,
                    description: 'Calibrated statistical confidence score from 0 to 100.',
                  },
                  confidenceTier: {
                    type: Type.STRING,
                    description: 'One of Very High, High, Moderate, Low, or Very Low.',
                  },
                  volatilityRegime: {
                    type: Type.STRING,
                    description: 'One of Low, Moderate, Elevated, or Extreme.',
                  },
                  rationale: {
                    type: Type.STRING,
                    description: 'Concise 2-3 sentence quantitative explanation referencing z-scores, Markov transitions, and volatility.',
                  },
                  riskFactors: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: '2-3 brief statistical caveats (sample size, p-value, volatility).',
                  },
                },
                required: [
                  'predictedDigit',
                  'runnerUpDigit',
                  'differsAvoidDigit',
                  'recommendedCategory',
                  'parityBias',
                  'aiConfidenceScore',
                  'confidenceTier',
                  'volatilityRegime',
                  'rationale',
                  'riskFactors',
                ],
              },
            },
          });

          responseText = (response.text ?? '').trim();
          lastErr = null;
          break;
        } catch (err) {
          lastErr = err;
          const info = extractGeminiErrorMessage(err);
          if (!info.retryable || attempt === maxAttempts) {
            throw err;
          }
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      }

      if (lastErr) {
        throw lastErr;
      }

      const rawText = responseText;
      if (!rawText) {
        res.status(502).json({ error: 'AI model returned an empty analysis response.' });
        return;
      }

      const cleanedText = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(cleanedText) as Record<string, unknown>;
      } catch {
        res.status(502).json({ error: 'AI model returned a non-JSON prediction payload.' });
        return;
      }
      const clampDigit = (val: unknown, fallback: number) => {
        const n = Number(val);
        return Number.isInteger(n) && n >= 0 && n <= 9 ? n : fallback;
      };
      const clampScore = (val: unknown) => {
        const n = Number(val);
        return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 50;
      };

      res.json({
        symbol: body.symbol,
        generatedAt: Date.now(),
        model: 'gemini-4-hydrogen',
        predictedDigit: clampDigit(parsed.predictedDigit, 0),
        runnerUpDigit: clampDigit(parsed.runnerUpDigit, 1),
        differsAvoidDigit: clampDigit(parsed.differsAvoidDigit, 9),
        recommendedCategory:
          parsed.recommendedCategory === 'MATCHES' ||
          parsed.recommendedCategory === 'DIFFERS' ||
          parsed.recommendedCategory === 'EVEN' ||
          parsed.recommendedCategory === 'ODD'
            ? parsed.recommendedCategory
            : 'DIFFERS',
        parityBias:
          parsed.parityBias === 'EVEN' || parsed.parityBias === 'ODD' || parsed.parityBias === 'NEUTRAL'
            ? parsed.parityBias
            : 'NEUTRAL',
        aiConfidenceScore: clampScore(parsed.aiConfidenceScore),
        confidenceTier:
          typeof parsed.confidenceTier === 'string' ? parsed.confidenceTier : 'Moderate',
        volatilityRegime:
          typeof parsed.volatilityRegime === 'string' ? parsed.volatilityRegime : 'Moderate',
        rationale:
          typeof parsed.rationale === 'string'
            ? parsed.rationale
            : 'Statistical distribution evaluated across the active tick window.',
        riskFactors: Array.isArray(parsed.riskFactors)
          ? parsed.riskFactors.filter((x): x is string => typeof x === 'string').slice(0, 4)
          : [],
      });
    } catch (err) {
      const info = extractGeminiErrorMessage(err);
      res.status(info.status).json({ error: info.message });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      const msg = err instanceof Error ? err.message : 'Internal server error';
      res.status(500).json({ error: msg });
      return;
    }
    next(err);
  });

  if (!IS_PROD) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deriv Quant AI server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
