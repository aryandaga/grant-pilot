import apiClient from './client';

export type ChatSummary = {
  id: string;
  title: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type ChatDocumentAttachment = {
  id: string;
  name: string;
  investor_id: string | null;
  chunk_count: number;
  created_at: string | null;
};

export type ChatDetail = {
  id: string;
  title: string | null;
  created_at: string;
  messages: ChatMessage[];
  documents: ChatDocumentAttachment[];
};

export const getChats = () =>
  apiClient.get<ChatSummary[]>('/api/chats');

export const getChat = (id: string) =>
  apiClient.get<ChatDetail>(`/api/chats/${id}`);

export const createChat = () =>
  apiClient.post<ChatSummary>('/api/chats', {});

export const sendChatMessage = (
  chatId: string,
  payload: { role: 'user' | 'assistant'; content: string },
) => apiClient.post<ChatMessage>(`/api/chats/${chatId}/messages`, payload);

export const uploadChatDocument = (chatId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return apiClient.post<ChatDocumentAttachment>(`/api/chats/${chatId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const deleteChat = (chatId: string) =>
  apiClient.delete(`/api/chats/${chatId}`);
