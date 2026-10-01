import type { DetailedHTMLProps, HTMLAttributes } from 'react';
import type { AgentRobotAvatar, AgentRobotAvatarMotion, AgentRobotAvatarWakeOn } from 'agent-robot-avatar';

type AgentRobotAvatarAttributes = DetailedHTMLProps<HTMLAttributes<AgentRobotAvatar>, AgentRobotAvatar> & {
  size?: string;
  color?: string;
  'auto-sleep'?: string;
  'wake-on'?: AgentRobotAvatarWakeOn;
  motion?: AgentRobotAvatarMotion;
};

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'agent-robot-avatar': AgentRobotAvatarAttributes;
    }
  }
}
