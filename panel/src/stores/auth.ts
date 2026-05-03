import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface AuthOperator {
  id: string
  email: string
  full_name: string
  role: 'owner' | 'admin' | 'operator' | 'readonly'
}

interface AuthState {
  operator: AuthOperator | null
  setOperator: (op: AuthOperator | null) => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      operator: null,
      setOperator: (operator) => set({ operator }),
      isAuthenticated: () => get().operator !== null,
    }),
    { name: 'tundra-auth' },
  ),
)
