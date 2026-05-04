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

export interface PasskeyItem {
  id: string
  label: string
  created_at: string
}

export const authApi = {
  login: (body: LoginRequest) => api<LoginResponse>('/auth/login', { method: 'POST', body }),
  logout: () => api('/auth/logout', { method: 'POST' }),
  me: () => api<LoginResponse['operator']>('/operators/me'),

  // TOTP verification after password login
  totpVerify: (code: string) => api('/auth/totp/verify', { method: 'POST', body: { code } }),

  // TOTP setup (authenticated operators)
  totpSetup: () => api<{ secret: string; uri: string }>('/auth/totp/setup'),
  totpEnable: (secret: string, code: string) =>
    api<{ recovery_codes: string[] }>('/auth/totp/enable', { method: 'POST', body: { secret, code } }),
  totpDisable: () => api('/auth/totp', { method: 'DELETE' }),

  // Passkey auth flow
  passkeyChallenge: () =>
    api<{ challenge_id: string; challenge: string }>('/auth/passkey/challenge', { method: 'POST' }),
  passkeyVerify: (body: {
    challenge_id: string
    credential_id: string
    authenticator_data: string
    client_data_json: string
    signature: string
  }) => api('/auth/passkey/verify', { method: 'POST', body }),

  // Passkey management (settings page)
  passkeyRegisterChallenge: () =>
    api<{ challenge_id: string; challenge: string }>('/operators/me/passkeys/challenge', { method: 'POST' }),
  passkeyRegister: (body: {
    challenge_id: string
    credential_id: string
    public_key_cbor: string
    label: string
    aaguid?: string
  }) => api('/operators/me/passkeys/register', { method: 'POST', body }),
  passkeysList: () => api<{ data: PasskeyItem[] }>('/operators/me/passkeys'),
  passkeyDelete: (id: string) => api(`/operators/me/passkeys/${id}`, { method: 'DELETE' }),
}

// Re-export FetchError for consumers that need it
export { FetchError }
