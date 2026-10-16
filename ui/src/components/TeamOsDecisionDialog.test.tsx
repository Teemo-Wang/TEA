// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamOsDecisionDialog } from "./TeamOsDecisionDialog";

let root: Root;

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

describe("Team OS review decision", () => {
  it("requires an explicit acceptance comment", async () => {
    const onSubmit = vi.fn();
    await act(async () => root.render(
      <TeamOsDecisionDialog decision="accept" onSubmit={onSubmit} onCancel={vi.fn()} />,
    ));
    expect(button("确认接受").disabled).toBe(true);
    await enterComment("  已核对页面和交互。  ");
    await act(async () => button("确认接受").click());
    expect(onSubmit).toHaveBeenCalledWith("已核对页面和交互。");
  });

  it("keeps the rework note when the update fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("任务状态已变化，请刷新后重试。"));
    await act(async () => root.render(
      <TeamOsDecisionDialog decision="rework" onSubmit={onSubmit} onCancel={vi.fn()} />,
    ));
    await enterComment("主标题再放大");
    await act(async () => button("提交返工").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("状态已变化");
    expect(document.querySelector("textarea")?.value).toBe("主标题再放大");
  });
});
