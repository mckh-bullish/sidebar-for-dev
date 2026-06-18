import React, { useRef } from 'react';
import { Box, Text, useStdout } from 'ink';
import { ScrollList, type ScrollListRef } from 'ink-scroll-list';
import type { CostDay } from '../data/litellm';
import { resolveModelColor } from '../pricing';
import type { Settings } from '../config';

interface CostPanelProps {
  days: CostDay[];
  settings: Settings;
  loading: boolean;
  error: string | null;
  terminalWidth: number;
}

const LABEL_WIDTH = 11; // "2026-06-18 " length
const TOTAL_WIDTH = 9;  // " $123.45" length

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function buildBar(
  day: CostDay,
  maxTotal: number,
  barWidth: number,
  modelColors: Settings['modelColors'],
): Array<{ chars: number; model: string; color: string }> {
  if (maxTotal === 0 || barWidth <= 0) return [];

  return day.models.map(m => {
    const ratio = day.total > 0 ? m.spend / day.total : 0;
    const totalRatio = maxTotal > 0 ? day.total / maxTotal : 0;
    const chars = Math.max(1, Math.round(ratio * totalRatio * barWidth));
    return { chars, model: m.model, color: resolveModelColor(m.model, modelColors) };
  });
}

function Legend({ models, modelColors }: { models: string[]; modelColors: Settings['modelColors'] }) {
  return (
    <Box flexDirection="row" flexWrap="wrap" marginBottom={1}>
      {models.map(m => (
        <Box key={m} marginRight={2}>
          <Text color={resolveModelColor(m, modelColors)}>■ </Text>
          <Text dimColor>{m.replace(/^claude-/, '')}</Text>
        </Box>
      ))}
    </Box>
  );
}

export function CostPanel({ days, settings, loading, error, terminalWidth }: CostPanelProps) {
  const listRef = useRef<ScrollListRef>(null);
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;

  if (loading) return <Box><Text dimColor>Loading cost data…</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error}</Text></Box>;
  if (days.length === 0) return <Box><Text dimColor>No cost data available.</Text></Box>;

  const barWidth = terminalWidth - LABEL_WIDTH - TOTAL_WIDTH - 2;
  const maxTotal = Math.max(...days.map(d => d.total), 0.001);
  const allModels = [...new Set(days.flatMap(d => d.models.map(m => m.model)))];

  // Header: 1 title + 1 legend + 1 marginTop = 3 rows
  const scrollHeight = Math.max(1, rows - 3);

  return (
    <Box flexDirection="column">
      <ScrollList
        ref={listRef}
        height={scrollHeight}
        selectedIndex={0}
        scrollAlignment="top"
      >
        <Text bold>💰 Cost (last {settings.costChartDays}d)</Text>
        <Box marginTop={1} marginBottom={1}>
          <Legend models={allModels} modelColors={settings.modelColors} />
        </Box>
        {days.map(day => {
          const segments = buildBar(day, maxTotal, barWidth, settings.modelColors);
          return (
            <Box key={day.date} flexDirection="row" marginBottom={0}>
              <Text dimColor>{day.date} </Text>
              <Box flexDirection="row">
                {segments.map((seg, i) => (
                  <Text key={i} color={seg.color}>{'█'.repeat(seg.chars)}</Text>
                ))}
              </Box>
              <Text dimColor> {formatCost(day.total)}</Text>
            </Box>
          );
        })}
      </ScrollList>
    </Box>
  );
}
