import apiClient from './client';

export type Investor = {
  id: string;
  name: string;
  organization: string;
  stage: string;
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
};

export type InvestorPayload = {
  name: string;
  stage: string;
  organization?: string;
  email?: string;
  capacity?: number;
  ask_amount?: number;
  interests?: string[];
};

export async function getInvestors(): Promise<Investor[]> {
  const response = await apiClient.get<Investor[]>('/api/investors');
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
