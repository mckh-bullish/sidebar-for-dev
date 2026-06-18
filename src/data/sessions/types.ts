export interface NormalizedSession {
  id: string;
  tool: 'claude' | 'pi' | 'opencode';
  project: string;
  lastActivity: Date;
  inputTokens: number;
  outputTokens: number;
  cost: number;          // real if recorded, calculated if not
  costRecorded: boolean; // true = from file, false = calculated
  model: string;
  messages: SessionSnippet[];
  summary?: string;
  summaryHash?: string;
}

export interface SessionSnippet {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}
