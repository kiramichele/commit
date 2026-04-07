'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api, clearSession, saveSession } from '@/lib/api'

interface Profile {
  profile_id: string
  role: string
  display_name: string
  email: string
  approval_status: string
  avatar_url?: string | null
}

interface AuthContextType {
  profile: Profile | null
  loading: boolean
  login: (email: string, password: string) => Promise<Profile>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('commit_access_token')
    if (!token) { setLoading(false); return }
    api.get<Profile>('/auth/me')
      .then(setProfile)
      .catch(() => { clearSession(); setProfile(null) })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string): Promise<Profile> => {
    const data = await api.post<{ access_token: string; refresh_token: string; profile: Profile }>(
      '/auth/login', { email, password }
    )
    saveSession(data.access_token, data.refresh_token)
    setProfile(data.profile)
    return data.profile
  }

  const logout = () => {
    clearSession()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ profile, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
