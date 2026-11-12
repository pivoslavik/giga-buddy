import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { refetchSession } from "../../entities/session/session"
import { apiFetch } from "../../shared/api/client"

/** POST /api/auth/logout: the backend ends the session and expires its httpOnly cookies. */
export async function logout(): Promise<void> {
  await apiFetch<unknown>("/api/auth/logout", { method: "POST" })
}

/**
 * Logs out and opens the landing page.
 *
 * The cookies are httpOnly, so only the backend can drop them, and the session is re-read to make
 * sure it did: with the user still cached, the guard of /welcome would send them back to the app.
 */
export function useLogout() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async () => {
      await logout()

      const user = await refetchSession(queryClient)
      if (user) {
        throw new Error("POST /api/auth/logout succeeded, but GET /api/user still sees the session")
      }
    },
    onSuccess: () => navigate({ to: "/welcome", replace: true }),
    onError: (error) => console.warn("Could not log out", error),
  })
}
