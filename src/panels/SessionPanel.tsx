import React, { useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { ScrollList, type ScrollListRef } from 'ink-scroll-list';
import type { NormalizedSession } from '../data/sessions/types';
import type { SummaryCache } from '../data/summarize';

interface SessionPanelProps {
  sessions: NormalizedSession[];
  summaryCache: SummaryCache;
  loading: boolean;
  summarizing: boolean;
  error: string | null;
  selectedIndex: number;
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

function StickyHeader({ count }: { count: number }) {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>🤖 Sessions (past 3d — {count})</Text>
      <Text dimColor>  CC=Claude Code  PI=pi  OC=opencode  |  S=summarize  R=refresh</Text>
    </Box>
  );
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
}: SessionPanelProps) {
  const listRef = useRef<ScrollListRef>(null);
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;

  if (loading) return <Box><Text dimColor>Loading sessions…</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error}</Text></Box>;
  if (sessions.length === 0) return <Box><Text dimColor>No sessions in the past 3 days.</Text></Box>;

  // Header is the first item in the scroll list (index 0), sessions follow.
  // selectedIndex from parent maps to items[selectedIndex + 1].
  // Always start with header selected (index 0) → scrolled to top.
  // Buffer: 2 header rows + 1 bottom margin to avoid clipping at terminal edge
  const scrollHeight = Math.max(1, rows - 3);

  const adjustedIndex = selectedIndex + 1;

  return (
    <Box flexDirection="column">
      <ScrollList
        ref={listRef}
        height={scrollHeight}
        selectedIndex={0}  // always header at top of viewport
        scrollAlignment="top"
      >
        <StickyHeader count={sessions.length} />
        {sessions.map((s, i) => (
          <SessionRow
            key={s.id}
            session={s}
            summary={summaryCache[s.id]?.summary}
            selected={false}
            summarizing={false}
          />
        ))}
      </ScrollList>
    </Box>
  );
}
