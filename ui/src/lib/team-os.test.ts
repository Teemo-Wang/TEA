import { describe, expect, it } from "vitest";
import type { HeartbeatRun } from "@paperclipai/shared";
import {
  buildTeamOsAttempts,
  latestActiveTeamOsRun,
  projectTeamOsTaskState,
  shouldPromptTeamOsFreshInstruction,
  shouldReopenTeamOsReply,
  type TeamOsRun,
} from "./team-os";

function run(overrides: Partial<TeamOsRun>): TeamOsRun {
  return {
    id: "run-1",
    status: "succeeded",
    startedAt: new Date("2026-10-15T08:00:00.000Z"),
    finishedAt: new Date("2026-10-15T08:01:00.000Z"),
    createdAt: new Date("2026-10-15T08:00:00.000Z"),
    error: null,
    errorCode: null,
    resultJson: null,
    retryOfRunId: null,
    scheduledRetryAttempt: 0,
    execution: null,
    ...overrides,
  };
}

describe("projectTeamOsTaskState", () => {
  it("shows an active run as working", () => {
    expect(projectTeamOsTaskState({ status: "in_progress" }, [run({ status: "running" })]).state)
      .toBe("working");
  });

  it("does not show an unacknowledged cancellation as working or successful", () => {
    const projection = projectTeamOsTaskState(
      { status: "in_progress" },
      [run({
        status: "cancelled",
        resultJson: { executionCancellation: { state: "requested" } },
      })],
    );

    expect(projection.state).toBe("stopped_unconfirmed");
    expect(projection.label).toBe("已停止，确认未闭环");
  });

  it("treats missing cancellation detail conservatively while the task stays in progress", () => {
    expect(projectTeamOsTaskState(
      { status: "in_progress" },
      [run({ status: "cancelled", resultJson: { summary: "stopped" } })],
    ).state).toBe("stopped_unconfirmed");
  });

  it("shows review as authoritative after the worker is stopped for handoff", () => {
    expect(projectTeamOsTaskState(
      { status: "in_review" },
      [run({
        status: "cancelled",
        errorCode: "issue_reassigned",
        resultJson: { executionCancellation: { state: "requested" } },
      })],
    ).state).toBe("awaiting_review");
  });

  it("requires attention when a task says in progress without a live run", () => {
    expect(projectTeamOsTaskState({ status: "in_progress" }, [run({ status: "succeeded" })]).state)
      .toBe("needs_attention");
  });

  it("names the terminal cause when a timed-out task is blocked", () => {
    const projection = projectTeamOsTaskState(
      { status: "blocked" },
      [run({ status: "timed_out", error: "Timed out after 20s" })],
    );

    expect(projection).toMatchObject({ state: "blocked", label: "超时待处理" });
    expect(projection.description).toContain("直接重新尝试");
  });

  it("names the terminal cause when a failed task is blocked", () => {
    expect(projectTeamOsTaskState(
      { status: "blocked" },
      [run({ status: "failed", error: "Process exited with code 7" })],
    )).toMatchObject({ state: "blocked", label: "异常待处理" });
  });

  it("keeps completed tasks terminal even when older runs failed", () => {
    expect(projectTeamOsTaskState({ status: "done" }, [run({ status: "failed" })]).state)
      .toBe("completed");
  });
});

describe("latestActiveTeamOsRun", () => {
  it("selects the newest live run and ignores terminal runs", () => {
    const older = run({ id: "older", status: "running", startedAt: new Date("2026-10-15T10:00:00.000Z") });
    const newer = run({ id: "newer", status: "queued", startedAt: new Date("2026-10-15T11:00:00.000Z") });
    const terminal = run({ id: "terminal", status: "succeeded", startedAt: new Date("2026-10-15T12:00:00.000Z") });
    expect(latestActiveTeamOsRun([older, terminal, newer])?.id).toBe("newer");
  });
});

describe("shouldReopenTeamOsReply", () => {
  it("reopens blocked work when the user replies with recovery instructions", () => {
    expect(shouldReopenTeamOsReply("blocked")).toBe(true);
    expect(shouldReopenTeamOsReply("in_progress")).toBe(false);
    expect(shouldReopenTeamOsReply("in_review")).toBe(false);
  });
});

describe("shouldPromptTeamOsFreshInstruction", () => {
  it("asks for a new instruction after a strong-restart interruption", () => {
    expect(shouldPromptTeamOsFreshInstruction(
      { status: "in_progress" },
      run({ status: "interrupted" }),
    )).toBe(true);
  });

  it("does not imply that ordinary failures need restart reconciliation", () => {
    expect(shouldPromptTeamOsFreshInstruction({ status: "in_progress" }, run({ status: "failed" })))
      .toBe(false);
  });
});

describe("buildTeamOsAttempts", () => {
  it("orders the newest attempt first and keeps retry identity", () => {
    const attempts = buildTeamOsAttempts([
      run({ id: "first", status: "interrupted" }),
      run({
        id: "second",
        status: "succeeded",
        startedAt: new Date("2026-10-15T08:02:00.000Z"),
        createdAt: new Date("2026-10-15T08:02:00.000Z"),
        retryOfRunId: "first",
        execution: { attempt: 2 } as HeartbeatRun["execution"],
      }),
    ]);

    expect(attempts.map((attempt) => attempt.id)).toEqual(["second", "first"]);
    expect(attempts[0]).toMatchObject({ number: 2, isRetry: true, label: "执行成功" });
  });

  it("keeps workbench numbering monotonic when a recovery chain restarts its counter", () => {
    const attempts = buildTeamOsAttempts([
      run({ id: "old-chain", status: "failed", execution: { attempt: 3 } as HeartbeatRun["execution"] }),
      run({
        id: "new-chain",
        status: "running",
        startedAt: new Date("2026-10-15T08:02:00.000Z"),
        createdAt: new Date("2026-10-15T08:02:00.000Z"),
        execution: { attempt: 1 } as HeartbeatRun["execution"],
      }),
    ]);

    expect(attempts.map((attempt) => [attempt.id, attempt.number])).toEqual([
      ["new-chain", 2],
      ["old-chain", 1],
    ]);
  });
});
