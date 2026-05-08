import apiClient from './client';

export type ChatPayload = {
  query: string;
  document_ids: string[];
  mode: 'general' | 'proposal' | 'research' | 'infer';
  chat_id?: string;
};

export type ChatResponse = {
  answer: string;
  sources: string[];
};

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .join('\n');
  }
  if (detail && typeof detail === 'object') return JSON.stringify(detail);
  return 'AI generation failed.';
}

export async function sendMessage(payload: ChatPayload): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/ai/query', payload);
  return res.data;
}

export async function streamMessage(
  payload: ChatPayload,
  handlers: {
    onSources?: (sources: string[]) => void;
    onDelta: (text: string) => void;
  },
): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch('http://localhost:8000/api/ai/query/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    let detail = 'AI generation failed.';
    try {
      const data = await res.json();
      detail = formatApiErrorDetail(data.detail ?? detail);
    } catch {
      // keep fallback detail
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (raw: string) => {
    const lines = raw.split('\n');
    const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim();
    const dataLines = lines
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    const dataText = dataLines.join('\n');
    if (!event || !dataText) return;

    const data = JSON.parse(dataText) as { text?: string; sources?: string[] };
    if (event === 'sources') handlers.onSources?.(data.sources ?? []);
    if (event === 'delta' && data.text) handlers.onDelta(data.text);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const event of events) {
      if (event.trim()) processEvent(event);
    }
  }

  if (buffer.trim()) processEvent(buffer);
}
