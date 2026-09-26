import client from './client'
import type { LoginResponse } from '../types'

export async function login(username: string, password: string): Promise<LoginResponse> {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  const { data } = await client.post<LoginResponse>('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export async function getCurrentUser() {
  const { data } = await client.get('/auth/me')
  return data
}

export function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
}
