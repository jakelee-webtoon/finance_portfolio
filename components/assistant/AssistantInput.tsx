'use client';

import { type FormEvent } from 'react';

export default function AssistantInput({
  value,
  disabled,
  setValue,
  submit,
}: {
  value: string;
  disabled: boolean;
  setValue: (value: string) => void;
  submit: () => void;
}) {
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form className="assistant-input" onSubmit={onSubmit}>
      <input
        aria-label="Finance Assistant 질문"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="이번 달 지출이나 예산을 물어보세요"
        maxLength={500}
        disabled={disabled}
      />
      <button type="submit" aria-label="질문 보내기" disabled={disabled || !value.trim()}>
        ↑
      </button>
    </form>
  );
}
