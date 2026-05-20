export const env = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL ?? "",
  SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:8080",
};
