import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

function pickEnvValue(env: Record<string, string | undefined>, keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) {
      return value;
    }
  }

  return "";
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };

  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(
        pickEnvValue(env, ["VITE_SUPABASE_URL", "SUPABASE_URL"]),
      ),
      __SUPABASE_ANON_KEY__: JSON.stringify(
        pickEnvValue(env, ["VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"]),
      ),
      __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(
        pickEnvValue(env, [
          "VITE_SUPABASE_PUBLISHABLE_KEY",
          "SUPABASE_PUBLISHABLE_KEY",
        ]),
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
