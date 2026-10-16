// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Agent, Project } from "@paperclipai/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TeamOsCreateTaskDialog } from "./TeamOsCreateTaskDialog";

let root: Root;

const project = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "现有项目",
} as Project;

const agent = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Codex 测试员",
  status: "active",
} as Agent;

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

async function enter(label: string, value: string) {
  const field = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  await act(async () => {
    const prototype = field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Team OS task creation", () => {
  it("defaults to an existing project and active agent", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(
      <TeamOsCreateTaskDialog
        projects={[project]}
        agents={[agent]}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    ));

    await enter("任务名称", "创建验收页");
    await enter("具体要求", "交付一个 HTML 文件");
    await act(async () => button("创建并派活").click());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectMode: "existing",
      projectId: project.id,
      projectName: "",
      title: "创建验收页",
      description: "交付一个 HTML 文件",
      agentId: agent.id,
    }));
  });

  it("collects a new project and task in one submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    await act(async () => root.render(
      <TeamOsCreateTaskDialog
        projects={[project]}
        agents={[agent]}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    ));

    await act(async () => button("新建项目").click());
    await enter("项目名称", "首页试验");
    await enter("任务名称", "制作状态页");
    await act(async () => button("创建并派活").click());

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectMode: "new",
      projectId: null,
      projectName: "首页试验",
      title: "制作状态页",
      agentId: agent.id,
    }));
  });
});
