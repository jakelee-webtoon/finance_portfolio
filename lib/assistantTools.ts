import { assistantOwners, assistantPeriods, assistantViews, parseAssistantStep, type AssistantStep } from '@/lib/assistantCommand';

export const ASSISTANT_SESSION_KEY = 'finance-assistant-session-v1';

export type AssistantToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type AgentMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
};

type Schema = Record<string, unknown>;

const s = (description?: string): Schema => (description ? { type: 'string', description } : { type: 'string' });
const n = (description?: string): Schema => ({ type: 'number', ...(description ? { description } : {}) });
const b: Schema = { type: 'boolean' };
const i: Schema = { type: 'integer' };
const e = (values: readonly string[], description?: string): Schema => ({ type: 'string', enum: [...values], ...(description ? { description } : {}) });

function tool(name: string, description: string, properties: Record<string, Schema>, required: string[] = []) {
  return {
    name,
    description,
    parameters: { type: 'object', properties, required },
  };
}

export const assistantToolDefinitions = [
  tool('get_finance_summary', '코드가 계산한 재무상태 점검 snapshot을 조회합니다.', { period: e(assistantPeriods), month: s('YYYY-MM') }),
  tool('query_transactions', '최근/기간별 가계부 거래를 조회합니다.', { period: e(assistantPeriods), month: s('YYYY-MM'), category: s(), owner: e(assistantOwners), limit: i }),
  tool('summarize_spending', '지출 합계와 카테고리별 지출을 요약합니다.', { period: e(assistantPeriods), month: s('YYYY-MM'), owner: e(assistantOwners) }),
  tool('query_budget', '월간플랜 예산/실행 현황을 조회합니다.', { month: s('YYYY-MM'), owner: e(assistantOwners) }),
  tool('create_budget', '월간플랜 항목을 추가합니다.', { month: s('YYYY-MM'), title: s(), targetAmount: n('KRW'), owner: e(assistantOwners), category: s() }, ['title', 'targetAmount']),
  tool('update_budget', '월간플랜 항목의 목표/실적/완료 여부를 수정합니다.', { id: s(), title: s(), month: s('YYYY-MM'), targetAmount: n('KRW'), actualAmount: n('KRW'), completed: b }),
  tool('delete_budget', '월간플랜 항목을 삭제합니다. 확인이 필요합니다.', { id: s(), title: s(), month: s('YYYY-MM') }),
  tool('categorize_transaction', '거래 카테고리를 변경합니다. 확인이 필요합니다.', { id: s(), category: s() }, ['id', 'category']),
  tool('add_transaction_memo', '거래에 메모를 추가합니다.', { id: s(), memo: s() }, ['id', 'memo']),
  tool('query_accounts', '자산/부채/투자 계정 요약을 조회합니다.', { owner: e(assistantOwners) }),
  tool('query_cashflow', '수입과 지출 흐름을 조회합니다.', { period: e(assistantPeriods), month: s('YYYY-MM') }),
  tool('get_monthly_report', '월간 리포트를 생성합니다.', { month: s('YYYY-MM') }),
  tool('open_view', '앱 화면을 엽니다.', { view: e(assistantViews) }, ['view']),
];

export function parseAssistantToolCall(name: string, rawArguments: string): AssistantStep {
  let parsed: unknown = {};
  if (rawArguments.trim()) {
    try {
      parsed = JSON.parse(rawArguments);
    } catch {
      throw new Error('도구 인자가 올바른 JSON이 아닙니다.');
    }
  }
  return parseAssistantStep(name, parsed);
}

export function trimAgentTranscript(messages: AgentMessage[], limit = 16) {
  let trimmed = messages.slice(-limit);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed = trimmed.slice(1);
  return trimmed;
}
