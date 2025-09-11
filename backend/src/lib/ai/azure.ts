import { createAzure } from '@ai-sdk/azure';

const resourceName = Bun.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? '';
const apiKey = Bun.env.AZURE_OPENAI_API_KEY ?? '';


// Azure provider configured like in aulean-backend
export const azure = createAzure({
  resourceName,
  apiKey,
});

// Helper to get a model from env, with sensible defaults
export function azureModelFromEnv() {
  const primary = Bun.env.AZURE_OPENAI_DEPLOYMENT ?? Bun.env.AZURE_OPENAI_DEPLOYMENT_NAME ?? 'gpt-5-mini';
  return azure(primary);
}

