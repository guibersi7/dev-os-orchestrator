import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { ChatClient } from "./chat-client";
import { initialChatState } from "./chat-state";

export default function WorkspaceChatPage() {
  return (
    <SpringReveal className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask questions over normalized events from GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar.</p>
      </div>
      <ChatClient initialState={initialChatState} />
    </SpringReveal>
  );
}
