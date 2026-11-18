export function aiConfiguration() {
  const provider = process.env.AI_PROVIDER?.trim() || (process.env.NVIDIA_API_KEY?.trim() ? "nvidia" : "openai-compatible");
  if (provider === "nvidia") {
    return {
      provider,
      key: process.env.NVIDIA_API_KEY?.trim(),
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model: process.env.NVIDIA_MODEL?.trim() || "meta/llama-3.3-70b-instruct",
    };
  }
  if (provider !== "openai-compatible") throw new Error("Unsupported AI provider");
  return {
    provider,
    key: process.env.AI_API_KEY?.trim(),
    baseUrl: (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.AI_MODEL || "gpt-6.1",
  };
}
