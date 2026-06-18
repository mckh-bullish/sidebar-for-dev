import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Settings } from '../config';

interface SettingsPanelProps {
  settings: Settings;
  onSave: (updated: Settings) => void;
  onCancel: () => void;
}

type FieldKey =
  | 'cost_interval'
  | 'prs_interval'
  | 'sessions_interval'
  | 'costChartDays'
  | 'summaryModel'
  | 'ghProxy';

const FIELDS: Array<{ key: FieldKey; label: string; description: string }> = [
  { key: 'cost_interval', label: 'Cost refresh (s)', description: 'Seconds between cost panel refreshes' },
  { key: 'prs_interval', label: 'PRs refresh (s)', description: 'Seconds between PR panel refreshes' },
  { key: 'sessions_interval', label: 'Sessions refresh (s)', description: 'Seconds between session panel refreshes' },
  { key: 'costChartDays', label: 'Cost chart days', description: 'Number of days in cost bar chart' },
  { key: 'summaryModel', label: 'Summary model', description: 'LiteLLM model name for session summaries' },
  { key: 'ghProxy', label: 'GH proxy', description: 'HTTP proxy for gh CLI (leave blank to disable)' },
];

function getValue(settings: Settings, key: FieldKey): string {
  switch (key) {
    case 'cost_interval': return String(settings.refreshIntervals.cost);
    case 'prs_interval': return String(settings.refreshIntervals.prs);
    case 'sessions_interval': return String(settings.refreshIntervals.sessions);
    case 'costChartDays': return String(settings.costChartDays);
    case 'summaryModel': return settings.summaryModel;
    case 'ghProxy': return settings.ghProxy;
  }
}

function applyValue(settings: Settings, key: FieldKey, value: string): Settings {
  const s = { ...settings, refreshIntervals: { ...settings.refreshIntervals } };
  switch (key) {
    case 'cost_interval': s.refreshIntervals.cost = parseInt(value, 10) || 300; break;
    case 'prs_interval': s.refreshIntervals.prs = parseInt(value, 10) || 300; break;
    case 'sessions_interval': s.refreshIntervals.sessions = parseInt(value, 10) || 300; break;
    case 'costChartDays': s.costChartDays = parseInt(value, 10) || 30; break;
    case 'summaryModel': s.summaryModel = value; break;
    case 'ghProxy': s.ghProxy = value; break;
  }
  return s;
}

export function SettingsPanel({ settings, onSave, onCancel }: SettingsPanelProps) {
  const [focusIdx, setFocusIdx] = useState(0);
  const [values, setValues] = useState<Record<FieldKey, string>>(
    Object.fromEntries(FIELDS.map(f => [f.key, getValue(settings, f.key)])) as Record<FieldKey, string>,
  );

  useInput((input, key) => {
    if (key.escape) { onCancel(); return; }
    if (key.upArrow) { setFocusIdx(i => Math.max(0, i - 1)); return; }
    if (key.downArrow) { setFocusIdx(i => Math.min(FIELDS.length - 1, i + 1)); return; }

    if (key.return) {
      // Save: apply all values back to settings
      let updated = { ...settings };
      for (const f of FIELDS) {
        updated = applyValue(updated, f.key, values[f.key]);
      }
      onSave(updated);
      return;
    }

    if (key.backspace || key.delete) {
      const fk = FIELDS[focusIdx].key;
      setValues(v => ({ ...v, [fk]: v[fk].slice(0, -1) }));
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const fk = FIELDS[focusIdx].key;
      setValues(v => ({ ...v, [fk]: v[fk] + input }));
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>⚙️  Settings</Text>
      <Text dimColor>↑↓ navigate · type to edit · Enter to save · Esc to cancel</Text>
      <Box marginTop={1} flexDirection="column">
        {FIELDS.map((f, i) => (
          <Box key={f.key} flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              {i === focusIdx && <Text color="cyan">▶ </Text>}
              {i !== focusIdx && <Text>  </Text>}
              <Text bold color={i === focusIdx ? 'cyan' : undefined}>{f.label}: </Text>
              <Text color={i === focusIdx ? 'white' : 'gray'}>{values[f.key]}</Text>
              {i === focusIdx && <Text color="cyan">█</Text>}
            </Box>
            {i === focusIdx && <Box paddingLeft={4}><Text dimColor>{f.description}</Text></Box>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
