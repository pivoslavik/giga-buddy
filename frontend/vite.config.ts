import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import { loadEnv, type ProxyOptions } from "vite"
import { defineConfig } from "vitest/config"
import { mockApiPlugin } from "./mock/mockApi.ts"

/**
 * Forwards /api/* to the backend the way nginx does in production (#38): the method, path, query,
 * headers, cookies and body go through as they are.
 */
function apiProxy(target: string): Record<string, ProxyOptions> {
  return {
    "/api/": {
      target,
      changeOrigin: true,
      // X-Forwarded-For/Proto/Host tell the backend who the client is, not the dev server
      xfwd: true,
      // a cookie with the backend's own Domain would be dropped by the browser on localhost
      cookieDomainRewrite: "",
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // `npm run dev:mock` answers /api from mock/mockApi.ts instead of a real backend
  const useMockApi = mode === "mock"

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), useMockApi && mockApiPlugin()],
    // `npm run preview` uses the same proxy
    server: {
      // `npm run dev` forwards API calls to nginx from docker compose by default,
      // set API_PROXY_TARGET to point at a locally started backend instead
      proxy: useMockApi ? undefined : apiProxy(env.API_PROXY_TARGET || "http://localhost"),
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
      unstubGlobals: true,
      unstubEnvs: true,
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        // main.tsx only mounts the app into the DOM, there is nothing to assert there
        exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/**/*.d.ts"],
        reporter: ["text", "html", "lcov"],
        thresholds: {
          lines: 80,
        },
      },
    },
  }
})
