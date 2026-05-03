import { $fetch, FetchError } from 'ofetch'

export interface ApiError {
  code: string
  message: string
  request_id: string
  details: Record<string, unknown>
}

export class TundraApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly requestId: string,
    public readonly details: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'TundraApiError'
  }
}

export const api = $fetch.create({
  baseURL: '/api/v1',
  credentials: 'include',
  onResponseError({ response }) {
    const body = response._data as { error?: ApiError }
    const err = body.error
    if (err) {
      throw new TundraApiError(err.code, err.message, err.request_id, err.details)
    }
  },
})

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  operator: {
    id: string
    email: string
    full_name: string
    role: string
  }
  requires_totp: boolean
}

export const authApi = {
  login: (body: LoginRequest) => api<LoginResponse>('/auth/login', { method: 'POST', body }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api<LoginResponse['operator']>('/operators/me'),
}

// Re-export FetchError for consumers that need it
export { FetchError }
