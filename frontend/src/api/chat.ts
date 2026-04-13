import apiClient from './client';

export type ChatPayload = {
  query: string;
  document_ids: string[];
};

export type ChatResponse = {
  answer: string;
  sources: string[];
};

export async function sendMessage(payload: ChatPayload): Promise<ChatResponse> {
  const res = await apiClient.post<ChatResponse>('/api/ai/query', payload);
  return res.data;
}
