import { getApiKey, getApiProvider, getApiModel, logApiUsage } from '../db/database';
import { ModuleFlashcardsResponse } from '../types';

export type SupportedProvider = 'gemini' | 'openrouter' | 'anthropic' | 'deepseek' | 'groq' | 'openai';

/**
 * Auto-detect the AI provider based on API key prefix and pattern
 */
export function detectProvider(key: string): SupportedProvider {
  const trimmed = key.trim();
  if (trimmed.startsWith('AIza')) {
    return 'gemini';
  }
  if (trimmed.startsWith('sk-or-')) {
    return 'openrouter';
  }
  if (trimmed.startsWith('sk-ant-')) {
    return 'anthropic';
  }
  if (trimmed.startsWith('gsk_')) {
    return 'groq';
  }
  if (trimmed.startsWith('sk-proj-')) {
    return 'openai';
  }
  if (trimmed.startsWith('sk-')) {
    return 'openrouter';
  }
  return 'gemini';
}

/**
 * Strictly resolve provider by key prefix so invalid cross-provider routing never occurs
 */
export function resolveProvider(apiKey: string, userPreference?: string): SupportedProvider {
  const cleanKey = apiKey.trim();

  // Unambiguous key prefixes
  if (cleanKey.startsWith('sk-or-')) {
    return 'openrouter';
  }
  if (cleanKey.startsWith('sk-ant-')) {
    return 'anthropic';
  }
  if (cleanKey.startsWith('AIza')) {
    return 'gemini';
  }
  if (cleanKey.startsWith('gsk_')) {
    return 'groq';
  }

  // sk- prefix: respect user choice if valid for OpenAI/DeepSeek
  if (cleanKey.startsWith('sk-')) {
    if (userPreference === 'deepseek') return 'deepseek';
    if (userPreference === 'openai') return 'openai';
    return 'openrouter';
  }

  if (userPreference && userPreference !== 'auto') {
    return userPreference as SupportedProvider;
  }

  return 'gemini';
}

export function getProviderDisplayName(provider: SupportedProvider): string {
  switch (provider) {
    case 'gemini':
      return 'Google Gemini';
    case 'openrouter':
      return 'OpenRouter';
    case 'anthropic':
      return 'Anthropic / Cline';
    case 'deepseek':
      return 'DeepSeek';
    case 'groq':
      return 'Groq';
    case 'openai':
      return 'OpenAI';
    default:
      return 'AI Engine';
  }
}

/**
 * Robust JSON parser that handles codeblocks, preambles, and postambles
 */
export function extractAndParseJson<T = any>(text: string): T {
  let cleaned = text.trim();

  // Remove markdown codeblock wrapper if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    // If there's chatter before or after the JSON, find the outermost { ... }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }
    throw new Error('AI returned an invalid response format. Please try again.');
  }
}

function buildPrompt(moduleTitle: string, moduleContent: string): string {
  return `
You are the master AI curriculum engine for the FLASED flashcard system.
Your mission is to convert the provided study notes for '${moduleTitle}' into an exhaustive, high-yield flashcard deck engineered specifically for a 3-tier active recall testing loop:
- "IDK" (User didn't know / forgot -> card repeats until mastered)
- "A Bit" (User partially remembered -> card pushed to end of review queue)
- "I Know" (User fully recalled -> card mastered and removed from cycle)

CRITICAL FLASHCARD SYSTEM RULES:
1. DESIGNED FOR ACTIVE RECALL TESTING (IDK / A BIT / I KNOW):
   - Front (question): A direct, sharp test question asking the student to recall the definition, mechanism, classification, or principle. Must test memory effectively without giving away the answer.
   - Back (explanation): A BRIEF, CRYSTAL-CLEAR EXPLANATION OF THE TEXT. It must give the student the exact explanation they need to verify if they knew it ("I Know"), knew part ("A Bit"), or forgot ("IDK").

2. BRIEF EXPLANATIONS FOR ALL TEXTS (NO SKIPS, NO FLUFF):
   - Every single concept, rule, definition, and topic present in the pasted source text MUST have a flashcard with a brief, high-yield explanation.
   - DO NOT skip any educational topic or concept from the source text.
   - Keep each explanation brief, punchy, and dense (1-2 sentences). Explain the core concept well so it is easy to read and remember.
   - Strip out conversational filler, page numbers, and formatting noise to preserve API quota.

3. STRICT SOURCE GROUNDING (NO INVENTED TOPICS):
   - Follow ONLY the pasted topics. Base every question and explanation strictly on the provided text.
   - Never invent or hallucinate outside categories or topics.

4. STANDALONE CONCEPTS VS. MULTI-ITEM FRAMEWORKS:
   - Standalone Concepts / Definitions (e.g. "What is E-Commerce?"):
     * Must be a SINGLE card alone with a direct, brief explanation answering the question.
     * Do NOT invent fake acronyms or artificial bullet points (no random "ADSA" cards).
     * Set 'points' to [] and 'memory_code' to "".
   - Multi-Item Lists / Frameworks (e.g. "4 Models of E-Commerce", "3 Steps of Transcription"):
     * Break the 2 to 6 components into clean bullet points in 'points'.
     * Form a memorable acronym code in 'memory_code' strictly matching the first letter of each bullet keyword.

5. CONCEPT GROUPING:
   - Assign each card a clear, uppercase 'concept_group' (e.g. "DEFINITIONS", "PROTOCOLS", "MODELS") derived from that section of the text.

CRITICAL OUTPUT FORMAT:
You MUST respond with a single valid JSON object strictly adhering to this structure:
{
  "module_title": "${moduleTitle}",
  "cards": [
    {
      "concept_group": "TOPIC_NAME",
      "question": "Clear test question?",
      "explanation": "Brief crystal-clear answer explanation.",
      "points": [
        {
          "letter": "A",
          "keyword": "AcronymKeyword",
          "explanation": "Brief explanation of this component"
        }
      ],
      "memory_code": "OPTIONAL_ACRONYM"
    }
  ]
}

Module Title: ${moduleTitle}

Source Module Content:
${moduleContent}
`.trim();
}

const responseSchema = {
  type: 'OBJECT',
  properties: {
    module_title: { type: 'STRING' },
    cards: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          concept_group: { type: 'STRING' },
          question: { type: 'STRING' },
          explanation: { type: 'STRING' },
          points: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                letter: { type: 'STRING' },
                keyword: { type: 'STRING' },
                explanation: { type: 'STRING' },
              },
              required: ['letter', 'keyword', 'explanation'],
            },
          },
          memory_code: { type: 'STRING' },
        },
        required: ['concept_group', 'question', 'explanation'],
      },
    },
  },
  required: ['module_title', 'cards'],
};

/**
 * 1. Google Gemini API Call with gemini-3.6-flash primary and fallback chain
 */
async function callGemini(
  apiKey: string,
  prompt: string,
  customModel?: string
): Promise<{ parsed: ModuleFlashcardsResponse; promptTokens: number; candidateTokens: number; totalTokens: number }> {
  const modelsToTry = customModel
    ? [customModel]
    : [
        'gemini-3.6-flash',
        'gemini-3.7-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-flash',
        'gemini-pro',
      ];

  let lastError = '';

  for (const model of modelsToTry) {
    for (const ver of ['v1beta', 'v1']) {
      try {
        const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${apiKey.trim()}`;

        // Attempt with response_schema first, fallback if rejected
        const isLegacy = model === 'gemini-pro';
        const generationConfig: any = {
          temperature: 0.2,
        };

        if (!isLegacy) {
          generationConfig.response_mime_type = 'application/json';
          generationConfig.response_schema = responseSchema;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig,
          }),
        });

        // If 404 (model not found on this version), silently try next
        if (res.status === 404) {
          continue;
        }

        // If non-404 error (e.g. 400 invalid key, 403 forbidden, 429 quota), extract and throw
        if (!res.ok) {
          const errText = await res.text();
          let parsedMsg = errText;
          try {
            const errObj = JSON.parse(errText);
            parsedMsg = errObj.error?.message || errText;
          } catch {}

          if (res.status === 429 || parsedMsg.toLowerCase().includes('quota')) {
            throw new Error('Gemini Quota Exceeded: Please try again later or check your Gemini API plan.');
          }

          if (res.status === 400 && parsedMsg.includes('API key not valid')) {
            throw new Error('Invalid Gemini API Key: Please check your key in Settings.');
          }

          lastError = `Gemini (${res.status}): ${parsedMsg}`;
          // If schema error, try without schema
          continue;
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const textOutput = candidate?.content?.parts?.[0]?.text;

        if (!textOutput) {
          continue;
        }

        const parsed = extractAndParseJson<ModuleFlashcardsResponse>(textOutput);
        const usage = data.usageMetadata;
        const promptTokens = usage?.promptTokenCount || 0;
        const candidateTokens = usage?.candidatesTokenCount || 0;
        const totalTokens = usage?.totalTokenCount || (promptTokens + candidateTokens);

        return { parsed, promptTokens, candidateTokens, totalTokens };
      } catch (e: any) {
        if (e.message?.includes('Quota') || e.message?.includes('Invalid Gemini API Key')) {
          throw e;
        }
        lastError = e.message;
      }
    }
  }

  throw new Error(`Gemini Error: ${lastError || 'Could not connect to Gemini. Please check your API key and network.'}`);
}

/**
 * 2. OpenRouter API Call with multi-model fallback chain
 */
async function callOpenRouter(
  apiKey: string,
  prompt: string,
  customModel?: string
): Promise<{ parsed: ModuleFlashcardsResponse; promptTokens: number; candidateTokens: number; totalTokens: number }> {
  const modelsToTry = customModel
    ? [customModel]
    : [
        'openrouter/auto',
        'google/gemini-3.6-flash',
        'google/gemini-3.7-flash',
        'meta-llama/llama-3.3-70b-instruct',
        'deepseek/deepseek-chat',
        'google/gemini-2.0-flash-exp:free',
      ];

  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
          'HTTP-Referer': 'https://flased.app',
          'X-Title': 'FLASED Flashcards',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are the master flashcard generator for FLASED. Return ONLY a valid JSON object matching the requested schema. Do not write any conversational text or markdown code fences.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (res.status === 404) {
        lastError = `OpenRouter model '${model}' was not found.`;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        let parsedMsg = errText;
        try {
          const errObj = JSON.parse(errText);
          parsedMsg = errObj.error?.message || errText;
        } catch {}

        if (res.status === 401 || res.status === 403) {
          throw new Error('OpenRouter Error: API key is invalid or unauthorized.');
        }
        if (res.status === 402) {
          throw new Error('OpenRouter Error: Account credits depleted. Please top up your OpenRouter balance.');
        }
        if (res.status === 429) {
          throw new Error('OpenRouter Error: Rate limit exceeded. Please wait a moment.');
        }

        lastError = `OpenRouter (${res.status}): ${parsedMsg}`;
        continue;
      }

      const data = await res.json();
      const textOutput = data.choices?.[0]?.message?.content;

      if (!textOutput) {
        continue;
      }

      const parsed = extractAndParseJson<ModuleFlashcardsResponse>(textOutput);
      const promptTokens = data.usage?.prompt_tokens || 0;
      const candidateTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || (promptTokens + candidateTokens);

      return { parsed, promptTokens, candidateTokens, totalTokens };
    } catch (e: any) {
      if (
        e.message?.includes('invalid or unauthorized') ||
        e.message?.includes('credits depleted') ||
        e.message?.includes('Rate limit exceeded')
      ) {
        throw e;
      }
      lastError = e.message;
    }
  }

  throw new Error(`OpenRouter Error: ${lastError || 'Could not connect to OpenRouter endpoints.'}`);
}

/**
 * 3. Anthropic / Cline API Call
 */
async function callAnthropic(
  apiKey: string,
  prompt: string,
  customModel?: string
): Promise<{ parsed: ModuleFlashcardsResponse; promptTokens: number; candidateTokens: number; totalTokens: number }> {
  const modelsToTry = customModel
    ? [customModel]
    : [
        'claude-3-5-haiku-20241022',
        'claude-3-haiku-20240307',
        'claude-3-5-sonnet-20241022',
      ];

  let lastError = '';

  for (const model of modelsToTry) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system:
            'You are the master flashcard generator for FLASED. Return ONLY pure raw JSON adhering to the specified schema. Do not write any markdown code fences or conversational text outside the JSON.',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (res.status === 404) {
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        let parsedMsg = errText;
        try {
          const errObj = JSON.parse(errText);
          parsedMsg = errObj.error?.message || errText;
        } catch {}

        if (res.status === 401 || res.status === 403) {
          throw new Error('Anthropic Error: API key is invalid or unauthorized.');
        }
        if (res.status === 429) {
          throw new Error('Anthropic Error: Rate limit or quota exceeded. Please try again later.');
        }

        lastError = `Anthropic (${res.status}): ${parsedMsg}`;
        continue;
      }

      const data = await res.json();
      const textOutput = data.content?.[0]?.text;

      if (!textOutput) {
        continue;
      }

      const parsed = extractAndParseJson<ModuleFlashcardsResponse>(textOutput);
      const promptTokens = data.usage?.input_tokens || 0;
      const candidateTokens = data.usage?.output_tokens || 0;
      const totalTokens = promptTokens + candidateTokens;

      return { parsed, promptTokens, candidateTokens, totalTokens };
    } catch (e: any) {
      if (e.message?.includes('invalid or unauthorized') || e.message?.includes('Rate limit or quota')) {
        throw e;
      }
      lastError = e.message;
    }
  }

  throw new Error(`Anthropic Error: ${lastError || 'Could not connect to Anthropic API.'}`);
}

/**
 * 4. DeepSeek / OpenAI / Groq Compatible API Call
 */
async function callOpenAICompatible(
  apiKey: string,
  prompt: string,
  baseUrl: string,
  candidateModels: string[],
  providerLabel: string,
  customModel?: string
): Promise<{ parsed: ModuleFlashcardsResponse; promptTokens: number; candidateTokens: number; totalTokens: number }> {
  const models = customModel ? [customModel] : candidateModels;
  let lastError = '';

  for (const model of models) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are the master flashcard generator for FLASED. Output ONLY a single valid JSON object according to the requested format. No surrounding conversational markdown.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.2,
        }),
      });

      if (res.status === 404) {
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        let parsedMsg = errText;
        try {
          const errObj = JSON.parse(errText);
          parsedMsg = errObj.error?.message || errText;
        } catch {}

        if (res.status === 401 || res.status === 403) {
          throw new Error(`${providerLabel} Error: API key is invalid or unauthorized.`);
        }
        if (res.status === 429) {
          throw new Error(`${providerLabel} Error: Rate limit exceeded. Please try again shortly.`);
        }

        lastError = `${providerLabel} (${res.status}): ${parsedMsg}`;
        continue;
      }

      const data = await res.json();
      const textOutput = data.choices?.[0]?.message?.content;

      if (!textOutput) {
        continue;
      }

      const parsed = extractAndParseJson<ModuleFlashcardsResponse>(textOutput);
      const promptTokens = data.usage?.prompt_tokens || 0;
      const candidateTokens = data.usage?.completion_tokens || 0;
      const totalTokens = data.usage?.total_tokens || (promptTokens + candidateTokens);

      return { parsed, promptTokens, candidateTokens, totalTokens };
    } catch (e: any) {
      if (e.message?.includes('invalid or unauthorized') || e.message?.includes('Rate limit exceeded')) {
        throw e;
      }
      lastError = e.message;
    }
  }

  throw new Error(`${providerLabel} Error: ${lastError || 'Could not connect to model.'}`);
}

/**
 * Primary multi-provider generation entry point
 */
export async function generateFlashcardsForModule(
  moduleTitle: string,
  moduleContent: string,
  customApiKey?: string
): Promise<ModuleFlashcardsResponse> {
  const storedKey = await getApiKey();
  const apiKey = customApiKey || storedKey;

  if (!apiKey || !apiKey.trim()) {
    throw new Error('No API Key configured. Please paste your API key in Settings.');
  }

  const storedProvider = await getApiProvider();
  const storedModel = await getApiModel();

  // Strictly resolve provider by key format first so cross-routing bugs never happen
  const provider = resolveProvider(apiKey, storedProvider);

  const prompt = buildPrompt(moduleTitle, moduleContent);

  try {
    let result: { parsed: ModuleFlashcardsResponse; promptTokens: number; candidateTokens: number; totalTokens: number };

    switch (provider) {
      case 'openrouter':
        result = await callOpenRouter(apiKey, prompt, storedModel || undefined);
        break;

      case 'anthropic':
        result = await callAnthropic(apiKey, prompt, storedModel || undefined);
        break;

      case 'deepseek':
        result = await callOpenAICompatible(
          apiKey,
          prompt,
          'https://api.deepseek.com',
          ['deepseek-chat', 'deepseek-reasoner'],
          'DeepSeek',
          storedModel || undefined
        );
        break;

      case 'groq':
        result = await callOpenAICompatible(
          apiKey,
          prompt,
          'https://api.groq.com/openai/v1',
          ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
          'Groq',
          storedModel || undefined
        );
        break;

      case 'openai':
        result = await callOpenAICompatible(
          apiKey,
          prompt,
          'https://api.openai.com/v1',
          ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo'],
          'OpenAI',
          storedModel || undefined
        );
        break;

      case 'gemini':
      default:
        result = await callGemini(apiKey, prompt, storedModel || undefined);
        break;
    }

    // Log token usage to database
    await logApiUsage(result.promptTokens, result.candidateTokens, result.totalTokens, 'success');

    return result.parsed;
  } catch (error: any) {
    if (error.message && (error.message.includes('Quota') || error.message.includes('Rate limit'))) {
      await logApiUsage(0, 0, 0, 'quota_exceeded');
    }
    throw error;
  }
}
