declare module "bun" {
  interface Env {
    PORT: number;
    STEAM_API_KEY: number;
    IP_SECRET_KEY?: string;
    LOG_LEVEL?: "debug" | "info" | "warn" | "error";
  }
}
