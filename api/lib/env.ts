import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
  kimiApiKey: process.env.KIMI_API_KEY ?? "",
  kimiApiBase: process.env.KIMI_API_BASE ?? "https://api.kimi.com/coding/v1",
  kimiModel: process.env.KIMI_MODEL ?? "kimi-for-coding",
  nvidiaApiKey: process.env.NVIDIA_API_KEY ?? "",
  nvidiaApiBase: process.env.NVIDIA_API_BASE ?? "https://integrate.api.nvidia.com/v1",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
};
