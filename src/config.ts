import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface RefreshIntervals {
  cost: number;
  prs: number;
  sessions: number;
}

export interface ModelPricing {
  input: number; // per 1M tokens
  output: number;
}

export interface LiteLLMConfig {
  apiBase: string;
  apiKey: string;
}

export interface Settings {
  refreshIntervals: RefreshIntervals;
  costChartDays: number;
  summaryModel: string;
  litellm: LiteLLMConfig;
  modelPricing: Record<string, ModelPricing>;
  modelColors: Record<string, string>;
  ghProxy: string;
}

export const DEFAULT_SETTINGS: Settings = {
  refreshIntervals: {
    cost: 300,
    prs: 300,
    sessions: 300,
  },
  costChartDays: 30,
  summaryModel: 'claude-haiku-4-5',
  litellm: {
    apiBase: process.env.LITELLM_API_BASE ?? '',
    apiKey: process.env.LITELLM_API_KEY ?? '',
  },
  modelPricing: {
    'claude-sonnet-4-6': { input: 3, output: 15 },
    'claude-opus-4-8': { input: 15, output: 75 },
    'claude-haiku-4-5': { input: 0.8, output: 4 },
  },
  modelColors: {
    'claude-sonnet-4-6': 'cyan',
    'claude-opus-4-8': 'magenta',
  },
  ghProxy: 'http://127.0.0.1:9000',
};

const SETTINGS_DIR = join(homedir(), '.sidebar_for_dev');
const SETTINGS_FILE = 'settings.json';

export function getHomeDir(): string {
  return homedir();
}

export function getSettingsPath(): string {
  return join(SETTINGS_DIR, SETTINGS_FILE);
}

export function loadConfig(path = getSettingsPath()): Settings {
  if (!existsSync(path)) {
    return { ...DEFAULT_SETTINGS };
  }

  const raw = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<Settings>;

  return {
    refreshIntervals: { ...DEFAULT_SETTINGS.refreshIntervals, ...parsed.refreshIntervals },
    costChartDays: parsed.costChartDays ?? DEFAULT_SETTINGS.costChartDays,
    summaryModel: parsed.summaryModel ?? DEFAULT_SETTINGS.summaryModel,
    litellm: { ...DEFAULT_SETTINGS.litellm, ...parsed.litellm },
    modelPricing: { ...DEFAULT_SETTINGS.modelPricing, ...parsed.modelPricing },
    modelColors: parsed.modelColors ?? {},
    ghProxy: parsed.ghProxy ?? DEFAULT_SETTINGS.ghProxy,
  };
}

export function saveConfig(settings: Settings, path = getSettingsPath()): void {
  if (!existsSync(join(path, '..'))) {
    mkdirSync(join(path, '..'), { recursive: true });
  }
  writeFileSync(path, JSON.stringify(settings, null, 2));
}
