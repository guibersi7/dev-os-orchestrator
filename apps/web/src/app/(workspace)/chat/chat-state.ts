import type { AgentCitation, AgentSuggestedAction } from "@/lib/api-client";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: AgentCitation[];
  suggestedActions?: AgentSuggestedAction[];
  confidence?: string;
  model?: string;
};

export type ChatState = {
  messages: ChatMessage[];
  error: string | null;
};

const initialAssistantMessage: ChatMessage = {
  id: "assistant-initial",
  role: "assistant",
  content:
    "Ask about PRs, tickets, decisions, blockers, docs, meetings, or releases. Answers cite the synced workspace context they use.",
  citations: [],
  suggestedActions: [],
  confidence: "low",
  model: "workspace-chat",
};

export const initialChatState: ChatState = {
  messages: [initialAssistantMessage],
  error: null,
};
