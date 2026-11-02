'use client';

import { useEffect, useRef, useState } from 'react';
import { discardPendingSaves, getPendingSaveBackup, hasPendingSaves, restorePendingSaveBackup, retryPendingSaves, syncFromFirebase } from '@/lib/store';

export default function SaveStatus() {
  const backupInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = (event?: Event) => {
      setPending(hasPendingSaves());
      if (event instanceof CustomEvent) setMessage(String(event.detail || ''));
    };
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (hasPendingSaves()) { event.preventDefault(); event.returnValue = ''; }
    };
    const openBackup = () => backupInput.current?.click();
    window.addEventListener('beforeunload', warnBeforeClose);
    window.addEventListener('financeRestoreBackup', openBackup);
    update();
    window.addEventListener('financeSaveStatus', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('beforeunload', warnBeforeClose);
      window.removeEventListener('financeRestoreBackup', openBackup);
      window.removeEventListener('financeSaveStatus', update);
      window.removeEventListener('storage', update);
    };
  }, []);

  return (<>
    <input ref={backupInput} type="file" accept="application/json,.json" className="hidden" aria-label="미저장 변경 백업 선택" onChange={async event => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      try {
        if (await restorePendingSaveBackup(JSON.parse(await file.text()))) window.location.reload();
      } catch { setMessage('백업 파일을 읽지 못했습니다. JSON 백업 파일을 선택해 주세요.'); }
    }} />
    {(pending || message) && (
    <div role="alert" className="fixed bottom-24 left-3 right-3 z-[9998] mx-auto max-w-xl rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg">
      <p className="font-semibold">{pending ? '서버 저장이 완료되지 않은 변경이 있습니다.' : '저장하지 못했습니다.'}</p>
      <p className="mt-1 text-xs">{message || '변경은 이 브라우저에 보관됩니다. 저장 완료 전에는 다른 기기에 반영되지 않습니다.'}</p>
      <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
        {pending && <button disabled={busy} className="rounded-lg bg-amber-900 px-3 py-2 text-white disabled:opacity-50" onClick={async () => {
          setBusy(true);
          try {
            if (await retryPendingSaves()) {
              await syncFromFirebase({ force: true });
              window.location.reload();
            }
          } finally { setBusy(false); }
        }}>{busy ? '확인 중…' : '저장 재시도'}</button>}
        {pending && <button onClick={() => {
          const data = new Blob([JSON.stringify(getPendingSaveBackup(), null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(data);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'finance-unsaved-changes.json';
          link.click();
          URL.revokeObjectURL(url);
        }}>미저장 변경 내려받기</button>}
        {pending && <button disabled={busy} onClick={async () => {
          if (!window.confirm('이 브라우저의 미저장 변경을 포기하고 서버 자료를 불러올까요? 필요한 변경은 먼저 내려받아 주세요. 서버 데이터는 변경하지 않습니다.')) return;
          setBusy(true);
          try { if (await discardPendingSaves()) window.location.reload(); }
          finally { setBusy(false); }
        }}>서버 자료로 되돌리기</button>}
        {!pending && <button onClick={() => setMessage('')}>닫기</button>}
      </div>
    </div>)}
  </>);
}
