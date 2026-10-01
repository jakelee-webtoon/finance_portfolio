'use client';

import 'agent-robot-avatar';
import { useEffect, useRef } from 'react';
import type { AgentRobotAvatar } from 'agent-robot-avatar';

export type AssistantState = 'idle' | 'input' | 'send' | 'waiting' | 'inspect' | 'success' | 'failure' | 'blocked' | 'error' | 'warning';

export default function AssistantCharacter({ state }: { state: AssistantState }) {
  const avatarRef = useRef<AgentRobotAvatar | null>(null);

  useEffect(() => {
    const avatar = avatarRef.current;
    if (!avatar) return;
    if (state === 'idle') {
      avatar.reset();
      return;
    }
    if (state === 'input') {
      void avatar.input(true);
      return;
    }
    if (state === 'waiting') {
      void avatar.startWaiting();
      return;
    }
    void avatar.play(state);
  }, [state]);

  return (
    <agent-robot-avatar
      ref={avatarRef}
      size="96"
      color="#2563eb"
      auto-sleep="30000"
      wake-on="activity"
      motion="auto"
    />
  );
}
