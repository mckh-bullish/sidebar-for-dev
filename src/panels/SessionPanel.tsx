import React, { useRef, useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { ScrollView, type ScrollViewRef } from 'ink-scroll-view';
import type { NormalizedSession } from '../data/sessions/types';
import type { SummaryCache } from '../data/summarize';

interface SessionPanelProps {
  sessions: NormalizedSession[];
  summaryCache: SummaryCache;
  loading: boolean;
  summarizing: boolean;
  error: string | null;
  selectedIndex: number;
  height: number;
}

const TOOL_COLORS: Record<string, string> = {
  claude: 'magenta',
  pi: 'cyan',
  opencode: 'green',
};

const TOOL_LABELS: Record<string, string> = {
  claude: 'CC',
  pi: 'PI',
  opencode: 'OC',
};

function relTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.floor(ms / 60_000)}m ago`;
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function SessionRow({
  session,
  summary,
  selected,
  summarizing,
}: {
  session: NormalizedSession;
  summary?: string;
  selected: boolean;
  summarizing: boolean;
}) {
  const toolColor = TOOL_COLORS[session.tool] ?? 'white';
  const toolLabel = TOOL_LABELS[session.tool] ?? '??';
  const projectName = session.project.split('/').pop() ?? session.project;
  const model = session.model.replace(/^claude-/, '');

  return (
    <Box flexDirection="column" paddingLeft={1} marginBottom={1}>
      <Box flexDirection="row">
        {selected && <Text color="cyan">▶ </Text>}
        {!selected && <Text>  </Text>}
        <Text bold color={toolColor}>[{toolLabel}] </Text>
        <Text bold>{projectName.slice(0, 25)}{projectName.length > 25 ? '…' : ''} </Text>
        <Text dimColor>{relTime(session.lastActivity)} </Text>
        <Text color="gray">↑{fmtTokens(session.inputTokens)} ↓{fmtTokens(session.outputTokens)} </Text>
        <Text color={session.costRecorded ? 'green' : 'yellow'}>${session.cost < 0.01 ? session.cost.toFixed(4) : session.cost.toFixed(2)}</Text>
        {!session.costRecorded && <Text dimColor>~</Text>}
        <Text dimColor> {model}</Text>
      </Box>
      <Box paddingLeft={4}>
        {summarizing && selected && <Text dimColor italic>Summarizing…</Text>}
        {!summarizing && summary && <Text dimColor>{summary}</Text>}
        {!summarizing && !summary && <Text dimColor color="gray">No summary yet — press S to summarize</Text>}
      </Box>
    </Box>
  );
}

export function SessionPanel({
  sessions,
  summaryCache,
  loading,
  summarizing,
  error,
  selectedIndex,
  height,
}: SessionPanelProps) {
  const listRef = useRef<ScrollViewRef>(null);
  const { stdout } = useStdout();
  const [scrollOffset, setScrollOffset] = useState(0);

  if (loading) return <Box><Text dimColor>Loading sessions…</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error}</Text></Box>;
  if (sessions.length === 0) return <Box><Text dimColor>No sessions in the past 3 days.</Text></Box>;

  // Each session takes 3 lines: 2 content lines + 1 blank line
  const lineHeight = 3;
  const termRows = stdout?.rows ?? 24;
  // Header: 2 title rows + 1 marginTop gap = 3 rows
  const headerRows = 3;
  const viewportHeight = Math.max(1, termRows - headerRows);

  // Compute scroll offset: when selectedIndex changes, scroll to keep it visible at top
  useEffect(() => {
    // Scroll so the selected item appears just below the header (top of viewport)
    const targetOffset = Math.min(
      selectedIndex * lineHeight,
      sessions.length * lineHeight - viewportHeight,
    );
    setScrollOffset(targetOffset);
  }, [selectedIndex, sessions.length, viewportHeight]);

  const visibleStart = Math.min(scrollOffset, Math.max(0, sessions.length - Math.ceil(viewportHeight / lineHeight)));
  const visibleCount = Math.min(Math.ceil(viewportHeight / lineHeight), sessions.length - visibleStart);

  return (
    <Box flexDirection="column">
      <Text bold>🤖 Sessions (past 3d — {sessions.length})</Text>
      <Text dimColor>  CC=Claude Code  PI=pi  OC=opencode  |  S=summarize  R=refresh</Text>
      <Box marginTop={1}>
        <Box flexDirection="column" height={viewportHeight} overflow="hidden">
          {sessions.slice(visibleStart, visibleStart + visibleCount).map((s, i) => (
            <SessionRow
              key={s.id}
              session={s}
              summary={summaryCache[s.id]?.summary}
              selected={i + visibleStart === selectedIndex}
              summarizing={summarizing && i + visibleStart === selectedIndex}
            />
          ))}
        </Box>
      </Box>
    </Box>
  );
}
