import React, { useState, useEffect, useCallback, useRef } from 'react';
import { execSync } from 'node:child_process';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { loadConfig, saveConfig } from './config';
import type { Settings } from './config';
import { fetchSpendLogs } from './data/litellm';
import { fetchOpenPrs, type PrItem } from './data/prs';
import { readClaudeSessions } from './data/sessions/claude';
import { readPiSessions } from './data/sessions/pi';
import { readOpencodeSessionsFromDb } from './data/sessions/opencode';
import { mergeSessions } from './data/sessions/index';
import { loadSummaryCache, summarizeSession, saveSummaryCache, computeContentHash, needsResummarization } from './data/summarize';
import type { SummaryCache } from './data/summarize';
import type { CostDay } from './data/litellm';
import type { PrGroup } from './data/prs';
import type { NormalizedSession } from './data/sessions/types';
import { CostPanel } from './panels/CostPanel';
import { PrPanel } from './panels/PrPanel';
import { SessionPanel } from './panels/SessionPanel';
import { SettingsPanel } from './panels/SettingsPanel';

type Tab = 'cost' | 'prs' | 'sessions' | 'settings';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nDaysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [cols, setCols] = useState(stdout?.columns ?? 120);

  useEffect(() => {
    const onResize = () => setCols(stdout?.columns ?? 120);
    (stdout as any)?.on('resize', onResize);
    return () => (stdout as any)?.off('resize', onResize);
  }, [stdout]);

  const terminalWidth = cols;

  const [settings, setSettings] = useState<Settings>(() => loadConfig());
  const [tab, setTab] = useState<Tab>('cost');
  const [prevTab, setPrevTab] = useState<Tab>('cost');

  // Cost
  const [costDays, setCostDays] = useState<CostDay[]>([]);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState<string | null>(null);

  // PRs
  const [prs, setPrs] = useState<PrGroup>({});
  const [prsLoading, setPrsLoading] = useState(true);
  const [prsError, setPrsError] = useState<string | null>(null);
  const [prSelectedIdx, setPrSelectedIdx] = useState(-1);

  // Sessions
  const [sessions, setSessions] = useState<NormalizedSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessionSelectedIdx, setSessionSelectedIdx] = useState(0);
  const [summaryCache, setSummaryCache] = useState<SummaryCache>(() => loadSummaryCache());
  const [summarizing, setSummarizing] = useState(false);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ── Data fetchers ────────────────────────────────────────────────
  const refreshCost = useCallback(async () => {
    setCostLoading(true);
    setCostError(null);
    try {
      const s = settingsRef.current;
      const days = await fetchSpendLogs(
        s.litellm.apiBase || process.env.LITELLM_API_BASE || '',
        s.litellm.apiKey || process.env.LITELLM_API_KEY || '',
        formatDate(nDaysAgo(s.costChartDays)),
        formatDate(new Date()),
      );
      // Sort ascending by date
      setCostDays(days.sort((a, b) => a.date.localeCompare(b.date)));
    } catch (e) {
      setCostError(e instanceof Error ? e.message : String(e));
    } finally {
      setCostLoading(false);
    }
  }, []);

  const refreshPrs = useCallback(async () => {
    setPrsLoading(true);
    setPrsError(null);
    try {
      const group = fetchOpenPrs(settingsRef.current);
      setPrs(group);
    } catch (e) {
      setPrsError(e instanceof Error ? e.message : String(e));
    } finally {
      setPrsLoading(false);
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const cutoff = nDaysAgo(3);
      const claude = readClaudeSessions(undefined, cutoff);
      const pi = readPiSessions(undefined, cutoff);
      const opencode = readOpencodeSessionsFromDb(undefined, cutoff);
      const merged = mergeSessions(claude, pi, opencode, cutoff);
      setSessions(merged);

      // Load cache and render immediately, then summarize in background
      const cache = loadSummaryCache();
      setSummaryCache({ ...cache });
      setSessionsLoading(false);

      // Background summarization — does not block render
      const s = settingsRef.current;
      const needSummary = merged.filter(sess => needsResummarization(sess, cache));
      if (needSummary.length > 0) {
        const apiBase = s.litellm.apiBase || process.env.LITELLM_API_BASE || '';
        const apiKey = s.litellm.apiKey || process.env.LITELLM_API_KEY || '';
        for (const sess of needSummary) {
          try {
            const text = await summarizeSession(sess, apiBase, apiKey, s.summaryModel);
            if (text) {
              cache[sess.id] = { summary: text, hash: computeContentHash(sess) };
              setSummaryCache(prev => ({ ...prev, [sess.id]: cache[sess.id] }));
            }
          } catch { /* non-fatal */ }
        }
        saveSummaryCache(cache);
      }
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : String(e));
      setSessionsLoading(false);
    }
  }, []);

  // Force re-summarize selected session
  const forceSummarize = useCallback(async () => {
    const sess = sessions[sessionSelectedIdx];
    if (!sess || summarizing) return;
    setSummarizing(true);
    try {
      const s = settingsRef.current;
      const text = await summarizeSession(
        sess,
        s.litellm.apiBase || process.env.LITELLM_API_BASE || '',
        s.litellm.apiKey || process.env.LITELLM_API_KEY || '',
        s.summaryModel,
      );
      if (text) {
        const updated = { ...summaryCache, [sess.id]: { summary: text, hash: computeContentHash(sess) } };
        saveSummaryCache(updated);
        setSummaryCache(updated);
      }
    } catch { /* non-fatal */ } finally {
      setSummarizing(false);
    }
  }, [sessions, sessionSelectedIdx, summarizing, summaryCache]);

  // ── Initial load ─────────────────────────────────────────────────
  useEffect(() => { void refreshCost(); }, [refreshCost]);
  useEffect(() => { void refreshPrs(); }, [refreshPrs]);
  useEffect(() => { void refreshSessions(); }, [refreshSessions]);

  // ── Auto-refresh timers ──────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => { void refreshCost(); }, settings.refreshIntervals.cost * 1000);
    return () => clearInterval(id);
  }, [settings.refreshIntervals.cost, refreshCost]);

  useEffect(() => {
    const id = setInterval(() => { void refreshPrs(); }, settings.refreshIntervals.prs * 1000);
    return () => clearInterval(id);
  }, [settings.refreshIntervals.prs, refreshPrs]);

  useEffect(() => {
    const id = setInterval(() => { void refreshSessions(); }, settings.refreshIntervals.sessions * 1000);
    return () => clearInterval(id);
  }, [settings.refreshIntervals.sessions, refreshSessions]);

  // ── Flash message helper ─────────────────────────────────────────
  const showFlash = useCallback((msg: string) => {
    setFlashMsg(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashMsg(null), 3000);
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────────
  useInput((input, key) => {
    if (tab === 'settings') return; // SettingsPanel handles its own input

    if (input === 'q') { exit(); return; }
    if (input === '1') { setTab('cost'); return; }
    if (input === '2') { setTab('prs'); return; }
    if (input === '3') { setTab('sessions'); return; }
    if (input === '=' || input === ',') {
      setPrevTab(tab);
      setTab('settings');
      return;
    }

    if (input === 'r' || input === 'R') {
      if (tab === 'cost') void refreshCost();
      else if (tab === 'prs') void refreshPrs();
      else if (tab === 'sessions') void refreshSessions();
      return;
    }

    if (tab === 'sessions') {
      if (input === 's' || input === 'S') { void forceSummarize(); return; }
      if (key.upArrow) { setSessionSelectedIdx(i => Math.max(0, i - 1)); return; }
      if (key.downArrow) { setSessionSelectedIdx(i => Math.min(sessions.length - 1, i + 1)); return; }
      if (key.return) {
        const sess = sessions[sessionSelectedIdx];
        if (!sess) return;
        let cmd = '';
        if (sess.tool === 'claude') cmd = `claude --resume ${sess.id}`;
        else if (sess.tool === 'pi') cmd = `pi --resume ${sess.id}`;
        else cmd = `open ${sess.id}`;
        try {
          execSync(`echo '${cmd}' | pbcopy`, { stdio: 'ignore' });
          showFlash(`Copied: ${cmd}`);
        } catch {
          showFlash('Could not copy — check clipboard permissions');
        }
        return;
      }
    }

    if (tab === 'prs') {
      const total = Object.values(prs).reduce((a, v) => a + v.length, 0);
      if (key.upArrow) { setPrSelectedIdx(i => Math.max(-1, i - 1)); return; }
      if (key.downArrow) { setPrSelectedIdx(i => Math.min(total - 1, i + 1)); return; }
      if (key.return) {
        if (prSelectedIdx < 0) return;
        let count = 0;
        let target: PrItem | undefined;
        for (const repo of Object.values(prs)) {
          for (const pr of repo) {
            if (count === prSelectedIdx) { target = pr; break; }
            count++;
          }
          if (target) break;
        }
        if (target?.url) {
          try { execSync(`open "${target.url}"`, { stdio: 'ignore' }); } catch { /* best effort */ }
        }
      }
    }
  });

  // ── Tab bar ──────────────────────────────────────────────────────
  function TabBar() {
    const tabs: Array<{ id: Tab; label: string }> = [
      { id: 'cost', label: '1:Cost' },
      { id: 'prs', label: '2:PRs' },
      { id: 'sessions', label: '3:Sessions' },
    ];
    return (
      <Box flexDirection="row" borderStyle="single" borderBottom={true} paddingX={1}>
        {tabs.map(t => (
          <Box key={t.id} marginRight={2}>
            <Text
              bold={tab === t.id}
              color={tab === t.id ? 'cyan' : 'gray'}
              underline={tab === t.id}
            >
              {t.label}
            </Text>
          </Box>
        ))}
        <Box flexGrow={1} />
        <Text dimColor>q:quit =:settings R:refresh</Text>
      </Box>
    );
  }

  // ── Render ───────────────────────────────────────────────────────
  if (tab === 'settings') {
    return (
      <Box flexDirection="column">
        <SettingsPanel
          settings={settings}
          onSave={(updated) => {
            setSettings(updated);
            saveConfig(updated);
            setTab(prevTab);
          }}
          onCancel={() => setTab(prevTab)}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <TabBar />
      {flashMsg && <Box><Text bold color="cyan">{flashMsg}</Text></Box>}
      <Box marginTop={1} flexDirection="column">
        {tab === 'cost' && (
          <CostPanel
            days={costDays}
            settings={settings}
            loading={costLoading}
            error={costError}
            terminalWidth={terminalWidth}
          />
        )}
        {tab === 'prs' && (
          <PrPanel
            prs={prs}
            loading={prsLoading}
            error={prsError}
            selectedIndex={prSelectedIdx}
            terminalWidth={terminalWidth}
          />
        )}
        {tab === 'sessions' && (
          <SessionPanel
            sessions={sessions}
            summaryCache={summaryCache}
            loading={sessionsLoading}
            summarizing={summarizing}
            error={sessionsError}
            selectedIndex={sessionSelectedIdx}
          />
        )}
      </Box>
    </Box>
  );
}
