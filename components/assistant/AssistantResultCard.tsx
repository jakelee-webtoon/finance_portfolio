import type { AssistantResult } from '@/lib/assistantCommand';

const kindMark: Record<AssistantResult['kind'], string> = {
  summary: 'Σ',
  list: '≡',
  budget: '₩',
  account: '◆',
  cashflow: '↕',
  report: '▤',
  navigation: '↗',
  warning: '!',
  info: 'i',
};

export default function AssistantResultCard({
  result,
  openTarget,
}: {
  result: AssistantResult;
  openTarget: (target: NonNullable<AssistantResult['target']>) => void;
}) {
  return (
    <article className="assistant-result">
      <div className="assistant-result-title">
        <span aria-hidden="true" className="assistant-result-mark">{kindMark[result.kind]}</span>
        <div>
          <strong>{result.title}</strong>
          {result.detail && <span>{result.detail}</span>}
        </div>
      </div>
      {result.items?.length ? (
        <div className="assistant-result-list">
          {result.items.slice(0, 8).map((item, index) => (
            <div key={`${item.title}-${index}`}>
              <strong>{item.title}</strong>
              {item.detail && <span>{item.detail}</span>}
            </div>
          ))}
        </div>
      ) : null}
      {result.source && <small>{result.source}</small>}
      {result.target && <button type="button" onClick={() => openTarget(result.target!)}>열기 →</button>}
    </article>
  );
}
