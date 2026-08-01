import { SendHorizontal } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { SpringReveal } from "@/components/motion/react-spring-reveal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const prompts = [
  "What changed this week?",
  "Which work blocks the release?",
  "What did Guilherme work on?",
  "What decisions were made in Slack and Notion?",
];

export default function WorkspaceChatPage() {
  return (
    <SpringReveal className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-5xl flex-col">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspace Chat</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ask questions over normalized events from GitHub, Slack, Linear, Jira, Trello, Notion, and Calendar.</p>
      </div>
      <Card className="mt-6 flex flex-1 flex-col p-5">
        <div className="flex-1 space-y-4">
          <div className="max-w-2xl rounded-lg bg-muted p-4 text-sm leading-6 text-muted-foreground">
            Mobile beta 0.8 is blocked by the OAuth PR in GitHub, a matching Linear issue in the current cycle, and a Slack decision to hold release scope until backfill risk is resolved.
          </div>
          <AnimeStagger className="grid gap-2 sm:grid-cols-2">
            {prompts.map((prompt) => (
              <button key={prompt} className="rounded-md border border-border p-3 text-left text-sm transition-colors hover:bg-accent">
                {prompt}
              </button>
            ))}
          </AnimeStagger>
        </div>
        <div className="mt-5 flex gap-2 border-t border-border pt-4">
          <Input
            className="h-10 flex-1"
            placeholder="Ask about PRs, tickets, decisions, blockers, docs, meetings, or releases"
          />
          <Button size="icon" aria-label="Send message">
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </SpringReveal>
  );
}
