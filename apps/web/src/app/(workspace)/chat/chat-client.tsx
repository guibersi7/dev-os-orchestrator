"use client";

import { useActionState, useEffect, useRef } from "react";
import { FileText, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { AnimeStagger } from "@/components/motion/anime-stagger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sendChatMessage } from "./actions";
import type { ChatState } from "./chat-state";

const prompts = [
  "What changed this week?",
  "Which work blocks the release?",
  "What did Guilherme work on?",
  "What decisions were made in Slack and Notion?",
];

export function ChatClient({ initialState }: { initialState: ChatState }) {
  const [state, formAction, pending] = useActionState(sendChatMessage, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const messageCount = state.messages.length;

  useEffect(() => {
    formRef.current?.reset();
  }, [messageCount]);

  return (
    <Card className="mt-6 flex min-h-[620px] flex-1 flex-col p-5">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {state.messages.map((message) => (
          <div key={message.id} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                message.role === "user"
                  ? "max-w-2xl rounded-lg bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground"
                  : "max-w-3xl rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground"
              }
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {message.model ? <Badge tone="blue">{message.model}</Badge> : null}
                    {message.confidence ? <Badge tone="neutral">Confidence {message.confidence}</Badge> : null}
                  </div>
                  {message.citations?.length ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      {message.citations.map((citation) => {
                        const citationContent = (
                          <>
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--standup-accent-text)]" />
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-foreground">{citation.title}</span>
                              <span className="block text-[11px] uppercase tracking-normal text-muted-foreground">
                                {citation.service} · {citation.type.replace("_", " ")}
                              </span>
                            </span>
                          </>
                        );
                        const className =
                          "flex items-start gap-2 rounded-md border border-border bg-background/40 p-2 text-left transition-colors";

                        return citation.url ? (
                          <a key={`${citation.type}-${citation.id}`} className={`${className} hover:bg-accent`} href={citation.url}>
                            {citationContent}
                          </a>
                        ) : (
                          <div key={`${citation.type}-${citation.id}`} className={className}>
                            {citationContent}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {message.suggestedActions?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {message.suggestedActions.map((action) => (
                        <Badge key={`${action.kind}-${action.label}`} tone="amber">
                          {action.label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
        {pending ? (
          <div className="flex justify-start">
            <div className="inline-flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading workspace context
            </div>
          </div>
        ) : null}
        {state.error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {state.error}
          </div>
        ) : null}
      </div>

      <AnimeStagger className="mt-5 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
        {prompts.map((prompt) => (
          <form key={prompt} action={formAction}>
            <input type="hidden" name="message" value={prompt} />
            <button
              type="submit"
              disabled={pending}
              className="h-full w-full rounded-md border border-border p-3 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
            >
              {prompt}
            </button>
          </form>
        ))}
      </AnimeStagger>

      <form ref={formRef} action={formAction} className="mt-3 flex gap-2">
        <Input
          className="h-10 flex-1"
          name="message"
          placeholder="Ask about PRs, tickets, decisions, blockers, docs, meetings, or releases"
          disabled={pending}
          autoComplete="off"
        />
        <SubmitButton pending={pending} />
      </form>
    </Card>
  );
}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button size="icon" aria-label="Send message" disabled={pending}>
      {pending ? <Sparkles className="h-4 w-4" /> : <SendHorizontal className="h-4 w-4" />}
    </Button>
  );
}
