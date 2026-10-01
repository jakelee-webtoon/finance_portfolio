import 'server-only';

import type { AgentMessage, AssistantToolCall } from '@/lib/assistantTools';

export type GeminiReply = { content: string | null; tool_calls?: AssistantToolCall[] };

const DEFAULT_MODEL = 'gemini-3.8-flash';

export function seoulDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}+09:00`;
}

export class GeminiError extends Error {
  constructor(message: string, public detail = '') {
    super(message);
  }
}

function transcriptToText(messages: AgentMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') return `tool_result(${message.tool_call_id ?? 'unknown'}): ${message.content ?? ''}`;
    if (message.role === 'assistant') {
      const calls = message.tool_calls?.map((call) => `${call.function.name}(${call.function.arguments})`).join(', ');
      return `assistant: ${message.content ?? ''}${calls ? `\ntool_calls: ${calls}` : ''}`;
    }
    return `${message.role}: ${message.content ?? ''}`;
  }).join('\n\n');
}

function stripCodeFence(value: string) {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function normalizeReply(text: string): GeminiReply {
  try {
    const parsed = JSON.parse(stripCodeFence(text)) as { content?: unknown; tool_calls?: unknown };
    const content = typeof parsed.content === 'string' && parsed.content.trim() ? parsed.content.trim() : null;
    const rawCalls = Array.isArray(parsed.tool_calls) ? parsed.tool_calls.slice(0, 8) : [];
    const toolCalls = rawCalls.flatMap((call, index): AssistantToolCall[] => {
      if (!call || typeof call !== 'object' || Array.isArray(call)) return [];
      const record = call as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name : '';
      const args = record.arguments && typeof record.arguments === 'object' && !Array.isArray(record.arguments)
        ? record.arguments
        : {};
      if (!name) return [];
      return [{
        id: `gemini-call-${Date.now()}-${index}`,
        type: 'function',
        function: { name, arguments: JSON.stringify(args) },
      }];
    });
    if (content || toolCalls.length) return { content, tool_calls: toolCalls.length ? toolCalls : undefined };
  } catch {
    // Fall through to safe text fallback.
  }
  return {
    content: text.trim()
      ? text.trim().slice(0, 900)
      : '응답을 정리하지 못했습니다. 질문을 조금 더 구체적으로 다시 말씀해 주세요.',
  };
}

function geminiErrorResponseText(body: string) {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message?.slice(0, 180) ?? body.slice(0, 180);
  } catch {
    return body.slice(0, 180);
  }
}

export async function callGemini(messages: AgentMessage[], options: { system: string; snapshot: string; maxTokens?: number; temperature?: number }): Promise<GeminiReply> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY_MISSING');
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    `currentDateTime=${seoulDateTime()}`,
    'financeData:',
    options.snapshot || '(비어 있음)',
    'conversation:',
    transcriptToText(messages),
  ].join('\n\n');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1800,
        responseMimeType: 'application/json',
      },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const detail = geminiErrorResponseText(await response.text());
    if (response.status === 429) throw new GeminiError('GEMINI_RATE_LIMIT', detail);
    throw new GeminiError('GEMINI_FAILED', `${response.status} ${detail}`);
  }

  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }> };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? '';
  if (!text) throw new GeminiError('GEMINI_EMPTY', data.candidates?.[0]?.finishReason ?? '');
  return normalizeReply(text);
}

export function geminiErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const detail = error instanceof GeminiError && error.detail ? ` (${error.detail})` : '';
  if (message === 'UNAUTHORIZED') return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (message === 'GEMINI_API_KEY_MISSING') return Response.json({ error: 'Vercel에 GEMINI_API_KEY를 설정해 주세요.' }, { status: 503 });
  if (message === 'GEMINI_RATE_LIMIT') return Response.json({ error: 'AI 사용량 한도에 잠시 걸렸어요. 잠시 후 다시 시도해 주세요.' }, { status: 429 });
  if (message === 'GEMINI_EMPTY') return Response.json({ error: 'Gemini 응답이 비어 있습니다. 질문을 조금 더 짧게 다시 시도해 주세요.' }, { status: 502 });
  if (message === 'GEMINI_FAILED') return Response.json({ error: `Gemini 응답을 받지 못했습니다.${detail}` }, { status: 502 });
  return null;
}
