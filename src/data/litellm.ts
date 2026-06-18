export interface CostModel {
  model: string;
  spend: number;
}

export interface CostDay {
  date: string;
  total: number;
  models: CostModel[];
}

interface SpendLogEntry {
  start_date?: string;
  end_date?: string;
  models: Record<string, number>;
  spend: number;
}

/**
 * Parse /spend/logs response into grouped CostDay[] with stripped model prefixes.
 */
export function parseSpendLogs(entries: SpendLogEntry[]): CostDay[] {
  const result: CostDay[] = [];

  for (const day of entries) {
    const cost = day.spend ?? 0;
    const models: CostModel[] = [];

    for (const [model, spend] of Object.entries(day.models ?? {})) {
      models.push({ model: model.replace(/^vertex_ai\//, ''), spend });
    }

    result.push({
      date: day.start_date ?? '',
      total: cost,
      models,
    });
  }

  return result;
}

/**
 * Fetch spend logs from LiteLLM proxy for the given date range.
 * Returns CostDay[] grouped by day, each with per-model spend breakdown.
 */
export async function fetchSpendLogs(
  apiBase: string,
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<CostDay[]> {
  const url = new URL(`${apiBase}/spend/logs`);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`LiteLLM spend/logs API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as SpendLogEntry[];
  return parseSpendLogs(data);
}
