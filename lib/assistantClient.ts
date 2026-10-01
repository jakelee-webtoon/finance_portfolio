import type { AgentMessage } from '@/lib/assistantTools';
import { auth } from '@/lib/firebase';

export type AgentReply = { content: string | null; tool_calls?: AgentMessage['tool_calls'] };

export async function runAgentTurn(messages: AgentMessage[], finance: string): Promise<AgentReply> {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error('Google 로그인이 필요합니다.');
  const response = await fetch('/api/assistant/agent', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, finance }),
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`AI 비서 서버 오류예요 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`);
  }
  const data = await response.json() as { message?: AgentReply; error?: string };
  if (!response.ok || !data.message) throw new Error(data.error || 'AI 비서 요청에 실패했습니다.');
  return data.message;
}
