import React from 'react';
import { Box, Text } from 'ink';
import { resolveModelColor } from '../pricing';
import type { Settings } from '../config';
import type { CostDay } from '../data/litellm';

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
  if (loading) return <Box><Text dimColor>Loading cost data…</Text></Box>;
  if (error) return <Box><Text color="red">Error: {error}</Text></Box>;
  if (days.length === 0) return <Box><Text dimColor>No cost data available.</Text></Box>;

  const barWidth = terminalWidth - LABEL_WIDTH - TOTAL_WIDTH - 2;
  const maxTotal = Math.max(...days.map(d => d.total), 0.001);

  const allModels = [...new Set(days.flatMap(d => d.models.map(m => m.model)))];

  return (
    <Box flexDirection="column">
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
    </Box>
  );
}
