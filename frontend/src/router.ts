import type { QueryClient } from "@tanstack/react-query"
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from "@tanstack/react-router"
import { sessionQueryOptions } from "./entities/session/session"
import { AppLayout } from "./pages/app-layout/AppLayout"
import { ChatPage } from "./pages/chat/ChatPage"
import { HomePage } from "./pages/home/HomePage"
import { LandingPage } from "./pages/landing/LandingPage"
import { KnowledgeBasePage, ProfilePage } from "./pages/placeholder/PlaceholderPages"

export interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()()

/** Landing page for guests. Users who already have a session go straight to the app. */
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/welcome",
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (user) {
      throw redirect({ to: "/", replace: true })
    }
  },
  component: LandingPage,
})

/**
 * Pathless layout for every page that needs a session: guests are sent to the landing page,
 * users get the header with the sections of the app.
 */
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(sessionQueryOptions)
    if (!user) {
      throw redirect({ to: "/welcome", replace: true })
    }
    return { user }
  },
  component: AppLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: HomePage,
})

const profileRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/profile",
  component: ProfilePage,
})

const chatRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/chat",
  component: ChatPage,
})

const knowledgeBaseRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/knowledge-base",
  component: KnowledgeBasePage,
})

const routeTree = rootRoute.addChildren([
  welcomeRoute,
  authenticatedRoute.addChildren([homeRoute, profileRoute, chatRoute, knowledgeBaseRoute]),
])

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    context: { queryClient },
    defaultPreload: "intent",
    scrollRestoration: true,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
