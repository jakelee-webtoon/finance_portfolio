'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { buildFinanceChatContext } from '@/lib/assistantChatContext';
import { runAgentTurn } from '@/lib/assistantClient';
import { commandRequiresConfirmation, type AssistantOutcome, type AssistantResult, type AssistantStep, type AssistantView } from '@/lib/assistantCommand';
import { assistantViewPath, executeAssistantStep, previewAssistantStep } from '@/lib/assistantExecutor';
import { ASSISTANT_SESSION_KEY, parseAssistantToolCall, trimAgentTranscript, type AgentMessage, type AssistantToolCall } from '@/lib/assistantTools';
import AssistantCharacter, { type AssistantState } from '@/components/assistant/AssistantCharacter';
import AssistantInput from '@/components/assistant/AssistantInput';
import AssistantMessage from '@/components/assistant/AssistantMessage';
import AssistantResultCard from '@/components/assistant/AssistantResultCard';

type Message = { id: number; role: 'user' | 'assistant'; text?: string; results?: AssistantResult[] };

const MAX_ROUNDS = 6;
const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;

function summarizeOutcome(outcome: AssistantOutcome) {
  return JSON.stringify({
    ok: true,
    message: outcome.message,
    results: outcome.results?.map((result) => ({
      title: result.title,
      detail: result.detail?.slice(0, 120),
      items: result.items?.slice(0, 8).map((item) => ({ title: item.title, detail: item.detail?.slice(0, 80) })),
    })),
  });
}

const helpMessage = '재무 데이터를 요약하고, 지출/예산/현금흐름을 조회해 드릴게요.';
const helpResult: AssistantResult = {
  kind: 'info',
  title: '예시 질문',
  detail: '조회와 계산은 앱 데이터로 직접 확인합니다.',
  items: [
    { title: '이번 달 지출 요약해줘' },
    { title: '예산 초과 항목 알려줘' },
    { title: '고정비와 저축률 보여줘' },
    { title: '월간플랜에서 생활비 목표를 200만원으로 바꿔줘' },
  ],
};

export default function AssistantPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [state, setState] = useState<AssistantState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [slow, setSlow] = useState(false);
  const transcript = useRef<AgentMessage[]>([]);
  const lastUserMessage = useRef('');
  const restored = useRef(false);
  const confirmResolver = useRef<((approved: boolean) => void) | null>(null);
  const sequence = useRef(0);
  const messageList = useRef<HTMLDivElement | null>(null);
  const busy = state === 'send' || state === 'waiting' || state === 'inspect';
  const add = (message: Omit<Message, 'id'>) => setMessages((current) => [...current.slice(-40), { ...message, id: ++sequence.current }]);

  useEffect(() => {
    messageList.current?.scrollTo({ top: messageList.current.scrollHeight });
  }, [messages, busy, awaitingConfirmation]);

  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(ASSISTANT_SESSION_KEY);
      const parsed = saved ? JSON.parse(saved) as { messages?: Message[]; transcript?: AgentMessage[] } : null;
      if (parsed && Array.isArray(parsed.messages) && Array.isArray(parsed.transcript)) {
        transcript.current = parsed.transcript;
        sequence.current = parsed.messages.reduce((max, message) => Math.max(max, message.id), 0);
        setMessages(parsed.messages.slice(-40));
      }
    } catch {
      // Corrupt session data starts fresh.
    }
    restored.current = true;
  }, []);

  useEffect(() => {
    if (!restored.current) return;
    try {
      window.sessionStorage.setItem(ASSISTANT_SESSION_KEY, JSON.stringify({ messages: messages.slice(-40), transcript: trimAgentTranscript(transcript.current) }));
    } catch {
      // Storage can be unavailable in private mode.
    }
  }, [messages]);

  useEffect(() => {
    if (!open || !isPhone()) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const askConfirmation = (text: string) => {
    add({ role: 'assistant', text });
    setAwaitingConfirmation(true);
    setState('warning');
    return new Promise<boolean>((resolve) => { confirmResolver.current = resolve; });
  };

  const settleConfirmation = (approved: boolean) => {
    confirmResolver.current?.(approved);
    confirmResolver.current = null;
    setAwaitingConfirmation(false);
  };

  const openTarget = (target: AssistantView) => {
    router.push(assistantViewPath(target));
    if (isPhone()) setOpen(false);
  };

  const runTool = async (call: AssistantToolCall): Promise<string> => {
    try {
      const step = parseAssistantToolCall(call.function.name, call.function.arguments);
      if (commandRequiresConfirmation(step)) {
        const approved = await askConfirmation(previewAssistantStep(step));
        if (!approved) {
          add({ role: 'assistant', text: '취소했습니다.' });
          setState('blocked');
          return JSON.stringify({ cancelled: true, message: '사용자가 실행을 취소했습니다.' });
        }
      }
      setState('inspect');
      const outcome = await executeAssistantStep(step);
      if (outcome.results?.length) add({ role: 'assistant', results: outcome.results });
      const target = outcome.results?.find((item) => item.target)?.target;
      if (outcome.navigated && target) openTarget(target);
      return summarizeOutcome(outcome);
    } catch (error) {
      setState('failure');
      return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : '도구 실행에 실패했습니다.' });
    }
  };

  const converse = async () => {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      setState(round === 0 ? 'send' : 'waiting');
      if (round === 0) await new Promise((resolve) => window.setTimeout(resolve, 180));
      setState('waiting');
      const reply = await runAgentTurn(transcript.current, buildFinanceChatContext(undefined, new Date(), lastUserMessage.current));
      transcript.current = [...transcript.current, { role: 'assistant', content: reply.content, tool_calls: reply.tool_calls }];
      if (reply.content) add({ role: 'assistant', text: reply.content });
      if (!reply.tool_calls?.length) return;
      for (const call of reply.tool_calls) {
        const toolResult = await runTool(call);
        transcript.current = [...transcript.current, { role: 'tool', tool_call_id: call.id, content: toolResult }];
      }
    }
    add({ role: 'assistant', text: '작업이 길어져 여기서 멈췄습니다. 이어서 말씀해 주세요.' });
  };

  const submit = async () => {
    const value = input.trim();
    if (!value || busy || awaitingConfirmation) return;
    setInput('');
    add({ role: 'user', text: value });
    if (/^(\/help|\/도움말|help|도움말|\?)$/i.test(value)) {
      add({ role: 'assistant', text: helpMessage, results: [helpResult] });
      setState('success');
      window.setTimeout(() => setState('idle'), 1400);
      return;
    }
    lastUserMessage.current = value;
    transcript.current = trimAgentTranscript([...transcript.current, { role: 'user', content: value }]);
    try {
      await converse();
      setState('success');
      window.setTimeout(() => setState('idle'), 1400);
    } catch (error) {
      add({ role: 'assistant', text: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' });
      setState('error');
    }
  };

  const resetConversation = () => {
    if (busy || awaitingConfirmation) return;
    transcript.current = [];
    setMessages([]);
    setState('idle');
  };

  return (
    <div className={`assistant-shell ${open ? 'open' : ''}`}>
      {open && (
        <section className="assistant-panel" aria-label="Finance Assistant">
          <header>
            <div>
              <span className="assistant-header-mark" aria-hidden="true">₩</span>
              <span>
                <strong>Finance Assistant</strong>
                <small>현금흐름과 예산을 같이 봅니다</small>
              </span>
            </div>
            <div className="assistant-header-actions">
              {messages.length > 0 && <button type="button" onClick={resetConversation} aria-label="새 대화 시작" disabled={busy || awaitingConfirmation}>↺</button>}
              <button type="button" onClick={() => setOpen(false)} aria-label="AI 비서 닫기">×</button>
            </div>
          </header>
          <div className="assistant-messages" aria-live="polite" ref={messageList}>
            {messages.length ? (
              messages.map((message) => (
                <div key={message.id}>
                  {message.text && <AssistantMessage role={message.role}>{message.text}</AssistantMessage>}
                  {message.results?.map((item, index) => <AssistantResultCard result={item} openTarget={openTarget} key={`${message.id}-${index}`} />)}
                </div>
              ))
            ) : (
              <div className="assistant-welcome">
                <strong>무엇을 볼까요?</strong>
                <span>“이번 달 지출 요약해줘”</span>
                <span>“예산 초과 항목 알려줘”</span>
                <span>“고정비와 저축률 보여줘”</span>
                <span>“월간 리포트 만들어줘”</span>
                <span className="assistant-welcome-hint">/help 를 입력하면 예시를 볼 수 있어요</span>
              </div>
            )}
            {awaitingConfirmation && (
              <div className="assistant-confirm">
                <button type="button" className="assistant-confirm-primary" onClick={() => settleConfirmation(true)}>실행</button>
                <button type="button" className="assistant-confirm-secondary" onClick={() => settleConfirmation(false)}>취소</button>
              </div>
            )}
            {busy && (
              <div className="assistant-message assistant assistant-typing" role="status">
                <i /><i /><i />
                <small>{state === 'inspect' ? '데이터 확인 중' : 'Gemini 응답 대기 중'}{slow ? ' · 조금 더 걸리고 있어요' : ''}</small>
              </div>
            )}
          </div>
          <AssistantInput value={input} setValue={(value) => { setInput(value); if (!busy && !awaitingConfirmation) setState(value ? 'input' : 'idle'); }} disabled={busy || awaitingConfirmation} submit={() => void submit()} />
        </section>
      )}
      <button className="assistant-trigger" onClick={() => setOpen((value) => !value)} aria-label={open ? 'AI 비서 닫기' : 'AI 비서 열기'} aria-expanded={open}>
        <AssistantCharacter state={state} />
      </button>
    </div>
  );
}
