import apiClient from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentItem = {
  id: string;
  name: string;
  investor_id?: string | null;
  investor_name?: string | null;
  created_at: string;
  chunk_count: number;
};

export type DocumentSearchResult = {
  content: string;
  document_id: string;
  document_name: string;
  score: number;
};

export type AudioTranscriptionResult = {
  id: string;
  name: string;
  document_id: string;
  transcript: string;
  chunk_count: number;
  created_at: string | null;
};

export type DocumentTranscript = {
  document_id: string;
  name: string;
  transcript: string;
};

// ─── API functions ────────────────────────────────────────────────────────────

export async function getDocuments(): Promise<DocumentItem[]> {
  const res = await apiClient.get<DocumentItem[]>('/api/documents');
  return res.data;
}

export async function uploadDocument(
  file: File,
  investorId?: string,
): Promise<DocumentItem> {
  const form = new FormData();
  form.append('file', file);
  if (investorId) form.append('investor_id', investorId);
  const res = await apiClient.post<DocumentItem>('/api/documents/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function uploadAudioRecording(
  file: File,
  investorId?: string,
): Promise<AudioTranscriptionResult> {
  const form = new FormData();
  form.append('file', file);
  if (investorId) form.append('investor_id', investorId);
  const res = await apiClient.post<AudioTranscriptionResult>('/api/audio/transcribe', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/api/documents/${id}`);
}

export async function searchDocuments(
  query: string,
  investorId?: string,
): Promise<DocumentSearchResult[]> {
  const res = await apiClient.post<DocumentSearchResult[]>('/api/documents/search', {
    query,
    investor_id: investorId ?? null,
  });
  return res.data;
}

/**
 * Fetches the stored file via the authenticated axios client, creates a Blob URL,
 * and returns it so the caller can open it in a new tab.
 * This is needed because window.open() cannot send Authorization headers.
 */
export async function getDocumentBlobUrl(id: string): Promise<string> {
  const res = await apiClient.get(`/api/documents/${id}/download`, {
    responseType: 'blob',
  });
  return URL.createObjectURL(res.data as Blob);
}

export async function getDocumentTranscript(id: string): Promise<DocumentTranscript> {
  const res = await apiClient.get<DocumentTranscript>(`/api/documents/${id}/transcript`);
  return res.data;
}
