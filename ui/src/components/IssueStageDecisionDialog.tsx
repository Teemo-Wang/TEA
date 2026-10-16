import { useState } from "react";
import type { Issue } from "@paperclipai/shared";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

export function needsStageDecisionComment(
  issue: Pick<Issue, "status" | "executionState"> | undefined,
  update: Record<string, unknown>,
): boolean {
  const state = issue?.executionState;
  return update.status === "done"
    && !(typeof update.comment === "string" && update.comment.trim())
    && issue?.status === "in_review"
    && state?.status === "pending"
    && Boolean(state.currentStageId)
    && (state.currentStageType === "review" || state.currentStageType === "approval");
}

export function IssueStageDecisionDialog({ onCancel, onSubmit }: {
  onCancel: () => void;
  onSubmit: (comment: string) => Promise<unknown>;
}) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (pending || !comment.trim()) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(comment.trim());
      onCancel();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not record the decision. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve task</DialogTitle>
          <DialogDescription>This review stage requires a decision comment. The comment and approval will be saved together.</DialogDescription>
        </DialogHeader>
        <Textarea aria-label="Decision comment" placeholder="What did you verify, and why do you accept this result?" value={comment} onChange={(event) => setComment(event.target.value)} disabled={pending} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={pending || !comment.trim()}>{pending ? "Saving decision…" : "Approve task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
