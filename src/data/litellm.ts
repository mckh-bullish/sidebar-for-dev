export interface CostModel {
  model: string;
  spend: number;
}

export interface CostDay {
  date: string;
  total: number;
  models: CostModel[];
}

interface DailyActivityResult {
  date: string;
  metrics: { spend: number };
  breakdown: {
    models: Record<string, { metrics: { spend: number } }>;
  };
}

interface DailyActivityResponse {
  results: DailyActivityResult[];
}

/**
 * Parse /user/daily/activity response into CostDay[] with stripped model prefixes.
 * Filters out models with zero spend and unknown/empty model names.
 */
export function parseDailyActivity(response: DailyActivityResponse): CostDay[] {
  return response.results.map(r => {
    const models: CostModel[] = Object.entries(r.breakdown.models ?? {})
      .map(([model, v]) => ({
        model: model.replace(/^vertex_ai\//, '').replace(/-\d{8}$/, ''), // strip date suffixes
        spend: v.metrics.spend,
      }))
      .filter(m => m.spend > 0 && m.model.length > 0);

    // Merge duplicate model names after stripping
    const merged = new Map<string, number>();
    for (const m of models) {
      merged.set(m.model, (merged.get(m.model) ?? 0) + m.spend);
    }

    return {
      date: r.date,
      total: r.metrics.spend,
      models: [...merged.entries()].map(([model, spend]) => ({ model, spend })),
    };
  });
}

/**
 * Fetch daily spend from LiteLLM proxy for the given date range.
 * Uses /user/daily/activity which returns per-day, per-model breakdowns
 * and is accessible to internal_user role (unlike /global/spend/report).
 */
export async function fetchSpendLogs(
  apiBase: string,
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<CostDay[]> {
  const url = new URL(`${apiBase}/user/daily/activity`);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`LiteLLM daily/activity API ${response.status}: ${response.statusText}`);
  }

  const data = await response.json() as DailyActivityResponse;
  return parseDailyActivity(data);
}
