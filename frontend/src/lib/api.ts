// ============================================================
// COMMIT PLATFORM — API Client (Frontend → FastAPI)
// src/lib/api.ts
// ============================================================
// Usage:
//   import { api } from '@/lib/api'
//   const classrooms = await api.get('/classrooms')
//   const classroom  = await api.post('/classrooms', { name: 'Period 1' })
// ============================================================

const API_URL = 'http://localhost:8888'

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('commit_access_token')
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `Request failed: ${response.status}`)
  }

  // 204 No Content
  if (response.status === 204) return undefined as T

  return response.json()
}

export const api = {
  get:    <T>(path: string)                  => request<T>('GET',    path),
  post:   <T>(path: string, body?: unknown)  => request<T>('POST',   path, body),
  patch:  <T>(path: string, body?: unknown)  => request<T>('PATCH',  path, body),
  delete: <T>(path: string)                  => request<T>('DELETE', path),
}

// ============================================================
// Auth helpers
// ============================================================

export function saveSession(accessToken: string, refreshToken: string) {
  localStorage.setItem('commit_access_token', accessToken)
  localStorage.setItem('commit_refresh_token', refreshToken)
}

export function clearSession() {
  localStorage.removeItem('commit_access_token')
  localStorage.removeItem('commit_refresh_token')
}

export function isLoggedIn(): boolean {
  return !!getToken()
}
