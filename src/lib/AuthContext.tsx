import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { auth, getAccessToken, clearTokens, decodeOptimisticUser, type UserProfile } from './api'

interface AuthContextValue {
  user: UserProfile | null
  loading: boolean
  signIn: (email: string, senha: string) => Promise<{ error: string | null }>
  signUp: (payload: {
    nome: string
    email: string
    senha: string
    role: 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'
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

    // Preenche com o que já dá para saber localmente (sem rede) e libera a
    // tela na hora. O /me continua rodando por baixo para confirmar o
    // perfil completo (avatar, org_nome etc.) e para expulsar a sessão se
    // o token não for mais válido no servidor (revogado, org desativada...).
    const optimista = decodeOptimisticUser(token)
    if (optimista) {
      setUser(optimista)
      setLoading(false)
    }

    try {
      const { user: u } = await auth.me()
      setUser(u)
    } catch (error) {
      // Falha de internet/servidor não revoga uma sessão local ainda válida.
      // O próprio cliente de API limpa tokens em 401 confirmado; aqui só
      // removemos a sessão quando não existe um JWT local utilizável.
      if (!optimista) {
        clearTokens()
        setUser(null)
      } else {
        setUser(optimista)
        console.warn('[AUTH] Perfil remoto indisponível; mantendo sessão offline local.', error)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUser() }, [loadUser])

  // Mantém a sessão viva enquanto existir refresh token válido.
  // O usuário só sai de fato quando clicar em sair ou quando o refresh expirar/revogar.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (getAccessToken()) auth.me().catch(() => undefined)
    }, 10 * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [])

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
    nome: string; email: string; senha: string; role: 'admin' | 'dev' | 'gestor' | 'sub_gestor' | 'membro'; orgNome?: string
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
