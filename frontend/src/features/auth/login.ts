import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { refetchSession } from "../../entities/session/session"
import { ApiError, apiFetch } from "../../shared/api/client"

export interface Credentials {
  username: string
  password: string
}

/** POST /api/login (#6): on success the backend puts the session into httpOnly cookies. */
export async function login(credentials: Credentials): Promise<void> {
  await apiFetch<unknown>("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  })
}

/** 401 is an unknown user or a wrong password, 400 is a request the backend rejects outright. */
const WRONG_CREDENTIALS_STATUSES = new Set([400, 401])

export function isWrongCredentials(error: unknown) {
  return error instanceof ApiError && WRONG_CREDENTIALS_STATUSES.has(error.status)
}

/**
 * Logs in and opens the main page.
 *
 * The session is re-read before navigating: the guard of `/` trusts the session query, and with
 * the guest still cached there it would send the user straight back to the landing page.
 */
export function useLogin() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (credentials: Credentials) => {
      await login(credentials)

      const user = await refetchSession(queryClient)
      if (!user) {
        throw new Error("POST /api/login succeeded, but GET /api/user does not see the session")
      }
      return user
    },
    onSuccess: () => navigate({ to: "/" }),
    onError: (error) => {
      if (!isWrongCredentials(error)) {
        console.warn("Could not log in", error)
      }
    },
  })
}
