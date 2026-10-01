export const assistantActions = [
  'get_finance_summary',
  'query_transactions',
  'summarize_spending',
  'query_budget',
  'create_budget',
  'update_budget',
  'delete_budget',
  'categorize_transaction',
  'add_transaction_memo',
  'query_accounts',
  'query_cashflow',
  'get_monthly_report',
  'open_view',
  'chat',
] as const;

export const assistantDestructiveActions = [
  'update_budget',
  'delete_budget',
  'categorize_transaction',
] as const;

export const assistantViews = [
  'dashboard',
  'portfolio',
  'monthly-plan',
  'cash',
  'income',
  'ledger',
  'stocks',
  'isa',
  'rsu',
  'apartment',
  'salary',
  'other',
] as const;

export const assistantPeriods = ['current_month', 'previous_month', 'this_year', 'all'] as const;
export const assistantOwners = ['combined', 'husband', 'wife', 'joint'] as const;

export type AssistantAction = typeof assistantActions[number];
export type AssistantStepAction = Exclude<AssistantAction, 'chat'>;
export type AssistantView = typeof assistantViews[number];
export type AssistantPeriod = typeof assistantPeriods[number];

export type AssistantStep = {
  action: AssistantStepAction;
  payload: Record<string, unknown>;
};

export type AssistantResult = {
  kind: 'summary' | 'list' | 'budget' | 'account' | 'cashflow' | 'report' | 'navigation' | 'warning' | 'info';
  title: string;
  detail?: string;
  source?: string;
  items?: Array<{ title: string; detail?: string }>;
  target?: AssistantView;
};

export type AssistantOutcome = {
  message: string;
  results?: AssistantResult[];
  navigated?: boolean;
};

const actions = new Set<string>(assistantActions);
const destructive = new Set<string>(assistantDestructiveActions);
const periods = new Set<string>(assistantPeriods);
const views = new Set<string>(assistantViews);
const owners = new Set<string>(assistantOwners);
const MONTH = /^\d{4}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isDestructiveAssistantAction(action: string) {
  return destructive.has(action);
}

export function assistantPayloadString(payload: Record<string, unknown>, key: string, required = true) {
  const value = typeof payload[key] === 'string' ? payload[key].trim() : '';
  if (required && !value) throw new Error(`${key} 값이 필요합니다.`);
  return value;
}

function optionalMonth(payload: Record<string, unknown>, key = 'month') {
  const value = assistantPayloadString(payload, key, false);
  if (value && !MONTH.test(value)) throw new Error(`${key}는 YYYY-MM 형식이어야 합니다.`);
  return value;
}

function requireEnum(payload: Record<string, unknown>, key: string, values: Set<string>, required = false) {
  const value = payload[key];
  if (value === undefined && !required) return undefined;
  if (typeof value !== 'string' || !values.has(value)) throw new Error(`${key} 값이 올바르지 않습니다.`);
  return value;
}

function optionalLimit(payload: Record<string, unknown>) {
  const value = payload.limit;
  if (value === undefined) return;
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 50) {
    throw new Error('limit은 1부터 50까지 가능합니다.');
  }
}

function optionalAmount(payload: Record<string, unknown>, key: string, required = false) {
  const value = payload[key];
  if (value === undefined && !required) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${key} 금액이 올바르지 않습니다.`);
  }
}

function validatePayload(action: AssistantAction, payload: Record<string, unknown>) {
  switch (action) {
    case 'query_transactions':
    case 'get_finance_summary':
      requireEnum(payload, 'period', periods);
      optionalMonth(payload);
      optionalLimit(payload);
      return;
    case 'summarize_spending':
      requireEnum(payload, 'period', periods);
      optionalMonth(payload);
      return;
    case 'query_budget':
      optionalMonth(payload);
      requireEnum(payload, 'owner', owners);
      return;
    case 'create_budget':
      optionalMonth(payload);
      assistantPayloadString(payload, 'title');
      optionalAmount(payload, 'targetAmount', true);
      requireEnum(payload, 'owner', owners);
      return;
    case 'update_budget':
      assistantPayloadString(payload, 'id', false);
      assistantPayloadString(payload, 'title', false);
      optionalMonth(payload);
      optionalAmount(payload, 'targetAmount');
      optionalAmount(payload, 'actualAmount');
      if (!payload.id && !payload.title) throw new Error('수정할 예산 id 또는 title이 필요합니다.');
      if (payload.targetAmount === undefined && payload.actualAmount === undefined && payload.completed === undefined) {
        throw new Error('바꿀 예산 값이 필요합니다.');
      }
      if (payload.completed !== undefined && typeof payload.completed !== 'boolean') throw new Error('completed 값이 올바르지 않습니다.');
      return;
    case 'delete_budget':
      assistantPayloadString(payload, 'id', false);
      assistantPayloadString(payload, 'title', false);
      optionalMonth(payload);
      if (!payload.id && !payload.title) throw new Error('삭제할 예산 id 또는 title이 필요합니다.');
      return;
    case 'categorize_transaction':
      assistantPayloadString(payload, 'id');
      assistantPayloadString(payload, 'category');
      return;
    case 'add_transaction_memo':
      assistantPayloadString(payload, 'id');
      assistantPayloadString(payload, 'memo');
      return;
    case 'query_accounts':
      requireEnum(payload, 'owner', owners);
      return;
    case 'query_cashflow':
      requireEnum(payload, 'period', periods);
      optionalMonth(payload);
      return;
    case 'get_monthly_report':
      optionalMonth(payload);
      return;
    case 'open_view':
      requireEnum(payload, 'view', views, true);
      return;
    case 'chat':
      return;
  }
}

export function parseAssistantStep(action: string, payload: unknown): AssistantStep {
  if (!actions.has(action) || action === 'chat') throw new Error(`지원하지 않는 액션입니다: ${action}`);
  if (!isObject(payload)) throw new Error('payload가 올바르지 않습니다.');
  validatePayload(action as AssistantAction, payload);
  return { action: action as AssistantStepAction, payload };
}

export function commandRequiresConfirmation(step: AssistantStep) {
  return isDestructiveAssistantAction(step.action);
}
