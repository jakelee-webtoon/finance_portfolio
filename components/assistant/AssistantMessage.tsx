export default function AssistantMessage({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  return <div className={`assistant-message ${role}`}>{children}</div>;
}
