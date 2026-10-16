// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Issue } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IssueStageDecisionDialog, needsStageDecisionComment } from "./IssueStageDecisionDialog";

let root: Root;
const pendingReview = {
  status: "in_review",
  executionState: { status: "pending", currentStageId: "review-1", currentStageType: "approval" },
} as Pick<Issue, "status" | "executionState">;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

function button(label: string) {
  const match = [...document.querySelectorAll("button")].find((node) => node.textContent === label);
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}
async function enterComment(value: string) {
  const field = document.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("execution-stage decision", () => {
  it("collects a comment only for a pending review/approval being completed", () => {
    expect(needsStageDecisionComment(pendingReview, { status: "done" })).toBe(true);
    expect(needsStageDecisionComment(pendingReview, { status: "done", comment: " " })).toBe(true);
    expect(needsStageDecisionComment(pendingReview, { status: "done", comment: "Verified" })).toBe(false);
    expect(needsStageDecisionComment(pendingReview, { status: "cancelled" })).toBe(false);
    expect(needsStageDecisionComment(pendingReview, { priority: "high" })).toBe(false);
    expect(needsStageDecisionComment({ ...pendingReview, executionState: null }, { status: "done" })).toBe(false);
    expect(needsStageDecisionComment({ ...pendingReview, status: "done" }, { status: "done" })).toBe(false);
  });

  it("does not submit a blank decision or mutate when cancelled", async () => {
    const onSubmit = vi.fn(); const onCancel = vi.fn();
    await act(async () => root.render(<IssueStageDecisionDialog onSubmit={onSubmit} onCancel={onCancel} />));
    expect(button("Approve task").disabled).toBe(true);
    await enterComment("   ");
    expect(button("Approve task").disabled).toBe(true);
    await act(async () => button("Cancel").click());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps the comment on failure and submits the explicit opinion on retry", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("Stage changed; refresh the task")).mockResolvedValueOnce({});
    const onCancel = vi.fn();
    await act(async () => root.render(<IssueStageDecisionDialog onSubmit={onSubmit} onCancel={onCancel} />));
    await enterComment("  I verified the counter and accept the result.  ");
    await act(async () => button("Approve task").click());
    expect(onSubmit).toHaveBeenCalledWith("I verified the counter and accept the result.");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Stage changed");
    expect(document.querySelector("textarea")?.value).toContain("verified the counter");
    expect(onCancel).not.toHaveBeenCalled();
    await act(async () => button("Approve task").click());
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
