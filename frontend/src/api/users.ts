import apiClient from './client';
import type { AssignedUser } from './investors';

export async function getUsers(): Promise<AssignedUser[]> {
  const response = await apiClient.get<AssignedUser[]>('/api/users');
  return response.data;
}
