import { describe, it, expect } from 'vitest';
import { loadConfig, saveConfig, DEFAULT_SETTINGS, getHomeDir } from './config';

describe('config', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('has default 300s intervals for all panels', () => {
      expect(DEFAULT_SETTINGS.refreshIntervals.cost).toBe(300);
      expect(DEFAULT_SETTINGS.refreshIntervals.prs).toBe(300);
      expect(DEFAULT_SETTINGS.refreshIntervals.sessions).toBe(300);
    });

    it('has 30 cost chart days default', () => {
      expect(DEFAULT_SETTINGS.costChartDays).toBe(30);
    });

    it('has haiku model default', () => {
      expect(DEFAULT_SETTINGS.summaryModel).toBe('claude-haiku-4-5');
    });

    it('has opus pricing defined', () => {
      expect(DEFAULT_SETTINGS.modelPricing['claude-opus-4-8']).toBeDefined();
    });

    it('has sonnet pricing defined', () => {
      expect(DEFAULT_SETTINGS.modelPricing['claude-sonnet-4-6']).toBeDefined();
    });

    it('has haiku pricing defined', () => {
      expect(DEFAULT_SETTINGS.modelPricing['claude-haiku-4-5']).toBeDefined();
    });

    it('has gh proxy default', () => {
      expect(DEFAULT_SETTINGS.ghProxy).toBe('http://127.0.0.1:9000');
    });
  });

  describe('getHomeDir', () => {
    it('returns environment HOME or process homedir', () => {
      const result = getHomeDir();
      expect(result.length).toBeGreaterThan(0);
      expect(result.startsWith('/')).toBe(true);
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when settings file does not exist', async () => {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const tmpDir = join(tmpdir(), `sidebar-test-${Date.now()}`);
      const settingsPath = join(tmpDir, 'settings.json');

      const config = loadConfig(settingsPath);
      expect(config).toEqual(DEFAULT_SETTINGS);
    });

    it('loads and merges user overrides with defaults', async () => {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const fs = await import('node:fs');
      const tmpDir = join(tmpdir(), `sidebar-test-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const settingsPath = join(tmpDir, 'settings.json');

      const overrides = {
        refreshIntervals: { cost: 60, prs: 120, sessions: 60 },
        costChartDays: 7,
      };
      fs.writeFileSync(settingsPath, JSON.stringify(overrides));

      const config = loadConfig(settingsPath);
      expect(config.refreshIntervals.cost).toBe(60);
      expect(config.refreshIntervals.prs).toBe(120);
      expect(config.refreshIntervals.sessions).toBe(60);
      expect(config.costChartDays).toBe(7);
      // non-overridden defaults preserved
      expect(config.summaryModel).toBe('claude-haiku-4-5');
      expect(config.ghProxy).toBe('http://127.0.0.1:9000');
    });
  });

  describe('saveConfig', () => {
    it('writes settings to file', async () => {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const fs = await import('node:fs');
      const tmpDir = join(tmpdir(), `sidebar-test-${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const settingsPath = join(tmpDir, 'settings.json');

      const settings = { ...DEFAULT_SETTINGS, refreshIntervals: { cost: 10, prs: 20, sessions: 30 } };
      saveConfig(settings, settingsPath);

      const loaded = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(loaded.refreshIntervals.cost).toBe(10);
    });

    it('creates parent directories if they do not exist', async () => {
      const { tmpdir } = await import('node:os');
      const { join } = await import('node:path');
      const fs = await import('node:fs');
      const tmpDir = join(tmpdir(), `sidebar-test-${Date.now()}/a/b/c`);
      const settingsPath = join(tmpDir, 'settings.json');

      saveConfig(DEFAULT_SETTINGS, settingsPath);
      expect(fs.existsSync(settingsPath)).toBe(true);
    });
  });
});
