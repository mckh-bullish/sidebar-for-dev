import React, { useRef } from 'react';
import { Box, Text } from 'ink';
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
  const listRef = useRef<ScrollListRef>(null);

  if (loading) return <Box><Text dimColor>Loading sessions…</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error}</Text></Box>;
  if (sessions.length === 0) return <Box><Text dimColor>No sessions in the past 3 days.</Text></Box>;

  return (
    <Box flexDirection="column">
      <Text bold>🤖 Sessions (past 3d — {sessions.length})</Text>
      <Text dimColor>  CC=Claude Code  PI=pi  OC=opencode  |  S=summarize  R=refresh</Text>
      <ScrollList
        ref={listRef}
        height={height}
        selectedIndex={selectedIndex}
        scrollAlignment="top"
      >
        {sessions.map((s, i) => (
          <SessionRow
            key={s.id}
            session={s}
            summary={summaryCache[s.id]?.summary}
            selected={i === selectedIndex}
            summarizing={summarizing && i === selectedIndex}
          />
        ))}
      </ScrollList>
    </Box>
  );
}
