import { assistantAgentPrompt } from '@/lib/server/assistantAgentPrompt';
import { authorizeAssistantRequest } from '@/lib/server/firebaseAuth';
import { callGemini, geminiErrorResponse } from '@/lib/server/gemini';
import type { AgentMessage, AssistantToolCall } from '@/lib/assistantTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_MESSAGES = 80;
const MAX_CONTENT = 7000;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseToolCalls(value: unknown): AssistantToolCall[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8) throw new Error('INVALID_TRANSCRIPT');
  return value.map((call) => {
    if (!isObject(call) || typeof call.id !== 'string' || !isObject(call.function) || typeof call.function.name !== 'string' || typeof call.function.arguments !== 'string' || call.function.arguments.length > 4000) {
      throw new Error('INVALID_TRANSCRIPT');
    }
    return { id: call.id, type: 'function' as const, function: { name: call.function.name, arguments: call.function.arguments } };
  });
}

function parseTranscript(value: unknown): AgentMessage[] {
  if (!Array.isArray(value) || !value.length || value.length > MAX_MESSAGES) throw new Error('INVALID_TRANSCRIPT');
  return value.map((entry) => {
    if (!isObject(entry)) throw new Error('INVALID_TRANSCRIPT');
    const { role, content } = entry;
    if (role !== 'user' && role !== 'assistant' && role !== 'tool') throw new Error('INVALID_TRANSCRIPT');
    if (content !== null && (typeof content !== 'string' || content.length > MAX_CONTENT)) throw new Error('INVALID_TRANSCRIPT');
    const message: AgentMessage = { role, content: typeof content === 'string' ? content : null };
    if (role === 'assistant') message.tool_calls = parseToolCalls(entry.tool_calls);
    if (role === 'tool') {
      if (typeof entry.tool_call_id !== 'string') throw new Error('INVALID_TRANSCRIPT');
      message.tool_call_id = entry.tool_call_id;
    }
    return message;
  });
}

export async function POST(request: Request) {
  try {
    await authorizeAssistantRequest(request);
    const body = await request.json() as { messages?: unknown; finance?: unknown };
    const transcript = parseTranscript(body.messages);
    const finance = typeof body.finance === 'string' ? body.finance.slice(0, 9000) : '';
    const last = transcript[transcript.length - 1];
    if (last.role === 'user' && !last.content?.trim()) return Response.json({ error: '메시지를 입력해 주세요.' }, { status: 400 });

    const message = await callGemini(transcript, {
      system: assistantAgentPrompt,
      snapshot: finance,
      maxTokens: 1800,
      temperature: 0.2,
    });
    return Response.json({ message });
  } catch (error) {
    const known = geminiErrorResponse(error);
    if (known) return known;
    if (error instanceof Error && error.message === 'INVALID_TRANSCRIPT') {
      return Response.json({ error: '대화 내용이 올바르지 않습니다. 새 대화로 다시 시작해 주세요.' }, { status: 400 });
    }
    console.error('Assistant agent request failed', error);
    return Response.json({ error: 'AI 비서 요청에 실패했습니다.' }, { status: 400 });
  }
}
