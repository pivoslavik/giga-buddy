import { queryOptions, type QueryClient } from "@tanstack/react-query"
import { ApiError, apiFetch } from "../../shared/api/client"

/** Response of GET /api/user: a row of the users table without the password (issue #9). */
export interface User {
  id: number
  username: string
  email: string
  role: string
  display_name: string
}

const NO_SESSION_STATUSES = new Set([401, 403])

/**
 * Resolves the current user from the session cookies.
 *
 * `null` means "guest": there is no valid session, so the landing page is shown.
 * If the backend fails or is unreachable we also fall back to a guest instead of
 * breaking the whole app — the user can still see the landing page and try to log in.
 */
export async function fetchSessionUser(): Promise<User | null> {
  try {
    return await apiFetch<User>("/api/user")
  } catch (error) {
    if (!(error instanceof ApiError && NO_SESSION_STATUSES.has(error.status))) {
      console.warn("Could not resolve the session, continuing as a guest", error)
    }
    return null
  }
}

/**
 * Shared query for the current session. Route guards read it through the query cache,
 * so after logging in or out call `refetchSession`.
 */
export const sessionQueryOptions = queryOptions({
  queryKey: ["session"],
  queryFn: fetchSessionUser,
  staleTime: 5 * 60 * 1000,
  retry: false,
})

/**
 * Re-reads the session right away and resolves to the fresh user (or `null` for a guest).
 *
 * Invalidating the query is not enough: nothing subscribes to it, so it is not refetched,
 * and the guards' `ensureQueryData` keeps returning the cached value even when it is stale.
 */
export function refetchSession(queryClient: QueryClient) {
  return queryClient.fetchQuery({ ...sessionQueryOptions, staleTime: 0 })
}
