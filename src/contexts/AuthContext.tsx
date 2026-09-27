import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import client from '../api/client'
import type { User, LoginResponse } from '../types'

interface AuthContextValue {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<User>
  demoLogin: (username: string) => Promise<User>
  logout: () => Promise<void>
  refreshUser: () => Promise<User | null>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Never trust or hydrate role/department from editable localStorage
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(localStorage.getItem('token')))

  const clearSessionState = useCallback(() => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }, [])

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const existingToken = localStorage.getItem('token')
    if (!existingToken) {
      clearSessionState()
      return null
    }
    try {
      const { data } = await client.get<User>('/auth/me')
      if (data && (data.role === 'admin' || data.role === 'officer')) {
        localStorage.removeItem('user')
        setUser(data)
        setToken(existingToken)
        return data
      }
      clearSessionState()
      return null
    } catch {
      clearSessionState()
      return null
    }
  }, [clearSessionState])

  useEffect(() => {
    let mounted = true
    localStorage.removeItem('user')
    const initAuth = async () => {
      const existingToken = localStorage.getItem('token')
      if (!existingToken) {
        if (mounted) {
          setUser(null)
          setToken(null)
          setIsLoading(false)
        }
        return
      }
      try {
        const { data } = await client.get<User>('/auth/me')
        if (mounted && data && (data.role === 'admin' || data.role === 'officer')) {
          setUser(data)
          setToken(existingToken)
        } else if (mounted) {
          clearSessionState()
        }
      } catch {
        if (mounted) {
          clearSessionState()
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    initAuth()
    return () => {
      mounted = false
    }
  }, [clearSessionState])

  const login = useCallback(
    async (username: string, password: string): Promise<User> => {
      try {
        const { data } = await client.post<LoginResponse>('/auth/login', { username, password })
        const accessToken = data.access_token
        localStorage.setItem('token', accessToken)
        localStorage.removeItem('user')
        setToken(accessToken)
        // Fetch authoritative role & assigned department directly from server /auth/me
        const { data: verifiedUser } = await client.get<User>('/auth/me')
        const finalUser = verifiedUser || data.user
        setUser(finalUser)
        return finalUser
      } catch (err) {
        clearSessionState()
        throw err
      }
    },
    [clearSessionState]
  )

  const demoLogin = useCallback(
    async (username: string): Promise<User> => {
      try {
        const { data } = await client.post<LoginResponse>('/auth/demo-login', { username })
        const accessToken = data.access_token
        localStorage.setItem('token', accessToken)
        localStorage.removeItem('user')
        setToken(accessToken)
        const { data: verifiedUser } = await client.get<User>('/auth/me')
        const finalUser = verifiedUser || data.user
        setUser(finalUser)
        return finalUser
      } catch (err) {
        clearSessionState()
        throw err
      }
    },
    [clearSessionState]
  )

  const logout = useCallback(async () => {
    const activeToken = localStorage.getItem('token')
    if (activeToken) {
      try {
        await client.post('/auth/logout')
      } catch {
        // Proceed with local cleanup even if network request fails
      }
    }
    clearSessionState()
  }, [clearSessionState])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        demoLogin,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
