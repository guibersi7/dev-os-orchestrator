"use server";

import { sendAgentChatMessage } from "@/lib/api-client";
import type { ChatMessage, ChatState } from "./chat-state";

export async function sendChatMessage(previousState: ChatState, formData: FormData): Promise<ChatState> {
  const message = String(formData.get("message") ?? "").trim();
  if (!message) {
    return { ...previousState, error: "Ask a question before sending." };
  }

  const userMessage: ChatMessage = {
    id: `user-${Date.now().toString(36)}`,
    role: "user",
    content: message,
  };

  const response = await sendAgentChatMessage(message);
  if (response.error || !response.data) {
    return {
      messages: [...previousState.messages, userMessage],
      error: response.error ?? "The workspace agent is unavailable.",
    };
  }

  const agent = response.data.agent;
  return {
    messages: [
      ...previousState.messages,
      userMessage,
      {
        id: `assistant-${Date.now().toString(36)}`,
        role: "assistant",
        content: agent.answer,
        citations: agent.citations,
        suggestedActions: agent.suggestedActions,
        confidence: agent.confidence,
        model: agent.model,
      },
    ],
    error: null,
  };
}
