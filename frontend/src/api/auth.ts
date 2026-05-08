import apiClient from './client';

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: 'head' | 'member';
};

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/auth/login', {
    email,
    password,
  });
  return response.data;
}

export async function getCurrentUser(): Promise<CurrentUser> {
  const response = await apiClient.get<CurrentUser>('/api/auth/me');
  return response.data;
}
