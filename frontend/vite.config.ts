import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import { loadEnv } from "vite"
import { defineConfig } from "vitest/config"
import { mockApiPlugin } from "./mock/mockApi.ts"

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  // `npm run dev:mock` answers /api from mock/mockApi.ts instead of a real backend
  const useMockApi = mode === "mock"

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), useMockApi && mockApiPlugin()],
    server: {
      proxy: useMockApi
        ? undefined
        : {
            // `npm run dev` forwards API calls to nginx from docker compose by default,
            // set API_PROXY_TARGET to point at a locally started backend instead
            "/api": {
              target: env.API_PROXY_TARGET || "http://localhost",
              changeOrigin: true,
            },
          },
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
