import { executeAssistantStep } from '@/lib/assistantExecutor';
import type { AssistantOutcome, AssistantStep } from '@/lib/assistantCommand';

function step(action: AssistantStep['action'], payload: Record<string, unknown> = {}): AssistantStep {
  return { action, payload };
}

export function getLocalAssistantFallbackStep(message: string): AssistantStep | null {
  const text = message.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  if (/월간\s*(요약|리포트|브리핑)|이번\s*달\s*(요약|리포트|브리핑)|요약|리포트|브리핑|심플|전체|전반|종합/i.test(text)) {
    return step('get_monthly_report');
  }
  if (/자산\s*구성|자산구성|포트폴리오|리밸런싱|보강|개선|분산|비중/i.test(text)) {
    return step('get_asset_review');
  }
  if (/재무\s*상태|건강|점검|위험|신호|문제|괜찮|괜찬|상태/i.test(text)) {
    return step('get_finance_summary');
  }
  if (/지출|소비|많이\s*썼|카테고리|왜\s*이렇게|아끼|줄여|절감/i.test(text)) {
    return step('summarize_spending');
  }
  if (/현금흐름|캐시플로|cash\s*flow|저축률|고정비|월급|남은\s*돈|runway|런웨이/i.test(text)) {
    return step('query_cashflow');
  }
  if (/예산|월간플랜|초과/i.test(text)) {
    return step('query_budget');
  }
  if (/거래|내역|최근/i.test(text)) {
    return step('query_transactions', { limit: 10 });
  }
  return null;
}

export async function runLocalAssistantFallback(message: string): Promise<AssistantOutcome | null> {
  const fallbackStep = getLocalAssistantFallbackStep(message);
  if (!fallbackStep) return null;
  return executeAssistantStep(fallbackStep);
}
