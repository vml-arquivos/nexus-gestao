import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { auth, getAccessToken, clearTokens, type UserProfile } from './api'

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>
  signUp: (payload: {
    nome: string
    email: string
    senha: string
    role: 'gestor' | 'membro'
    orgNome?: string
  }) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    const token = getAccessToken()
    if (!token) { setLoading(false); return }
    try {
      const { user: u } = await auth.me()
      setUser(u)
    } catch {
      clearTokens()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  const signIn = async (email: string, senha: string): Promise<{ error: string | null }> => {
    try {
      const { user: u } = await auth.login(email, senha)
      setUser(u)
      return { error: null }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Erro ao fazer login.' }
    }
  }

  const signUp = async (payload: {
    nome: string; email: string; senha: string; role: 'gestor' | 'membro'; orgNome?: string
  }): Promise<{ error: string | null }> => {
    try {
      const { user: u } = await auth.register(payload)
      setUser(u)
      return { error: null }
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Erro ao criar conta.' }
    }
  }

  const signOut = async () => {
    await auth.logout()
    setUser(null)
  }

  const refreshUser = async () => { await loadUser() }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, logout: signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
