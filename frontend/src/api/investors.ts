import apiClient from './client';

export type AssignedUser = {
  id: string;
  name: string;
  email: string;
  role: 'head' | 'member';
};

export type Investor = {
  id: string;
  name: string;
  organization: string | null;
  stage: string;
  primary_owner_id: string | null;
  primary_owner: AssignedUser | null;
};

export type InvestorDetail = {
  id: string;
  name: string;
  organization: string | null;
  email: string | null;
  stage: string;
  capacity: number | null;
  ask_amount: number | null;
  interests: string[] | null;
  primary_owner_id: string | null;
  primary_owner: AssignedUser | null;
};

export type InvestorPayload = {
  name: string;
  stage: string;
  primary_owner_id?: string;
  organization?: string;
  email?: string;
  capacity?: number;
  ask_amount?: number;
  interests?: string[];
};

export type InvestorStage = {
  key: string;
  label: string;
  short_label: string;
  order: number;
};

export type InvestorBriefing = {
  chat_id: string;
  answer: string;
  sources: string[];
};

export async function getInvestors(): Promise<Investor[]> {
  const response = await apiClient.get<Investor[]>('/api/investors');
  return response.data;
}

export async function getInvestorStages(): Promise<InvestorStage[]> {
  const response = await apiClient.get<InvestorStage[]>('/api/investors/stages');
  return response.data;
}

export async function getInvestor(id: string): Promise<InvestorDetail> {
  const response = await apiClient.get<InvestorDetail>(`/api/investors/${id}`);
  return response.data;
}

export async function createInvestor(payload: InvestorPayload): Promise<InvestorDetail> {
  const response = await apiClient.post<InvestorDetail>('/api/investors', payload);
  return response.data;
}

export async function updateInvestor(id: string, payload: Partial<InvestorPayload>): Promise<InvestorDetail> {
  const response = await apiClient.put<InvestorDetail>(`/api/investors/${id}`, payload);
  return response.data;
}

export async function generateInvestorBriefing(id: string): Promise<InvestorBriefing> {
  const response = await apiClient.post<InvestorBriefing>(`/api/investors/${id}/ai-briefing`);
  return response.data;
}
