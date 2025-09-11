import { createGoogleGenerativeAI } from '@ai-sdk/google';

const apiKey = Bun.env.GOOGLE_GENERATIVE_AI_API_KEY;
if (!apiKey) {
  throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set');
}

export const googleAI = createGoogleGenerativeAI({ apiKey });

