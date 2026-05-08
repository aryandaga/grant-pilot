import apiClient from './client';

export type SpeechToTextResult = {
  transcript: string;
};

export async function transcribeSpeech(file: File): Promise<SpeechToTextResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<SpeechToTextResult>('/api/audio/speech-to-text', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}
