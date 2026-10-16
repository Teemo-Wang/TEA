import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export type TeamOsDecision = "accept" | "rework";

const COPY: Record<TeamOsDecision, {
  title: string;
  description: string;
  placeholder: string;
  submit: string;
  pending: string;
}> = {
  accept: {
    title: "接受本次成果",
    description: "写下你核对过的内容。意见和接受结果会一起保存。",
    placeholder: "例如：页面结构和交互已检查，可以作为本次成果。",
    submit: "确认接受",
    pending: "正在保存…",
  },
  rework: {
    title: "提出返工",
    description: "明确说明需要修改的地方。任务会交回原执行成员，旧成果仍会保留。",
    placeholder: "例如：主标题再放大，并把整体色调改为暖色。",
    submit: "提交返工",
    pending: "正在提交…",
  },
};

export function TeamOsDecisionDialog({
  decision,
  onCancel,
  onSubmit,
}: {
  decision: TeamOsDecision;
  onCancel: () => void;
  onSubmit: (comment: string) => Promise<unknown>;
}) {
  const copy = COPY[decision];
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = comment.trim();
    if (!trimmed || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onCancel();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "操作失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="验收意见"
          placeholder={copy.placeholder}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={pending}
        />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
          <Button onClick={() => void submit()} disabled={pending || !comment.trim()}>
            {pending ? copy.pending : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
