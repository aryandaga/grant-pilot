import apiClient from './client';

export type Investor = {
  id: string;
  name: string;
  organization: string;
  stage: string;
};

export async function getInvestors(): Promise<Investor[]> {
  const response = await apiClient.get<Investor[]>('/api/investors');
  return response.data;
}
