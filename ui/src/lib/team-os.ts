import type { HeartbeatRun, Issue } from "@paperclipai/shared";

export type TeamOsTaskState =
  | "ready"
  | "working"
  | "awaiting_review"
  | "completed"
  | "blocked"
  | "stopped"
  | "stopped_unconfirmed"
  | "failed"
  | "cancelled"
  | "needs_attention";

export interface TeamOsTaskProjection {
  state: TeamOsTaskState;
  label: string;
  description: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
}

export type TeamOsRun = Pick<
  HeartbeatRun,
  | "id"
  | "status"
  | "startedAt"
  | "finishedAt"
  | "createdAt"
  | "error"
  | "errorCode"
  | "resultJson"
  | "retryOfRunId"
  | "scheduledRetryAttempt"
  | "execution"
>;

export interface TeamOsAttempt {
  id: string;
  number: number;
  status: HeartbeatRun["status"];
  label: string;
  detail: string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  isRetry: boolean;
}

const ACTIVE_RUN_STATUSES = new Set<HeartbeatRun["status"]>([
  "queued",
  "scheduled_retry",
  "running",
]);

function timestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestRun(runs: TeamOsRun[]): TeamOsRun | null {
  return [...runs].sort((left, right) => (
    timestamp(right.startedAt ?? right.createdAt) - timestamp(left.startedAt ?? left.createdAt)
  ))[0] ?? null;
}

export function latestActiveTeamOsRun(runs: TeamOsRun[]): TeamOsRun | null {
  return latestRun(runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)));
}

export function shouldReopenTeamOsReply(status: Issue["status"]): boolean {
  return status === "blocked";
}

export function shouldPromptTeamOsFreshInstruction(
  issue: Pick<Issue, "status">,
  latest: TeamOsRun | null,
): boolean {
  return latest?.status === "interrupted"
    && !["done", "cancelled", "in_review"].includes(issue.status);
}

function cancellationState(run: TeamOsRun | null): string | null {
  const cancellation = run?.resultJson?.executionCancellation;
  if (!cancellation || typeof cancellation !== "object" || Array.isArray(cancellation)) return null;
  const state = (cancellation as Record<string, unknown>).state;
  return typeof state === "string" ? state : null;
}

export function projectTeamOsTaskState(
  issue: Pick<Issue, "status">,
  runs: TeamOsRun[],
): TeamOsTaskProjection {
  if (issue.status === "done") {
    return {
      state: "completed",
      label: "已完成",
      description: "任务已经完成，可以在右侧查看并验收成果。",
      badgeVariant: "secondary",
    };
  }

  if (issue.status === "cancelled") {
    return {
      state: "cancelled",
      label: "已取消",
      description: "任务已取消，不会继续执行。",
      badgeVariant: "outline",
    };
  }

  // The task workflow is the authority once a result has entered review. A
  // handoff can legitimately cancel the worker run while preserving its
  // deliverable, so that cancellation must not hide the pending decision.
  if (issue.status === "in_review") {
    return {
      state: "awaiting_review",
      label: "等待验收",
      description: "Agent 已提交本次结果，等待你确认完成或提出返工意见。",
      badgeVariant: "secondary",
    };
  }

  const latest = latestRun(runs);
  if (latest?.status === "cancelled") {
    if (
      cancellationState(latest) === "requested"
      || (issue.status === "in_progress" && cancellationState(latest) === null)
    ) {
      return {
        state: "stopped_unconfirmed",
        label: "已停止，确认未闭环",
        description: "执行进程已经停止，但底座尚未完成停止确认。可以查看任务详情后决定是否重试。",
        badgeVariant: "destructive",
      };
    }
    return {
      state: "stopped",
      label: "已停止",
      description: "最近一次执行已经停止，可以打开任务继续或重新派发。",
      badgeVariant: "outline",
    };
  }

  if (runs.some((run) => ACTIVE_RUN_STATUSES.has(run.status))) {
    return {
      state: "working",
      label: "正在执行",
      description: "Agent 正在处理任务，完成后成果会出现在右侧。",
      badgeVariant: "default",
    };
  }

  if (issue.status === "blocked") {
    const timedOut = latest?.status === "timed_out";
    const failed = latest && ["failed", "interrupted"].includes(latest.status);
    return {
      state: "blocked",
      label: timedOut ? "超时待处理" : failed ? "异常待处理" : "需要处理",
      description: timedOut
        ? "最近一次尝试超过执行时限，任务已暂停。检查范围后可以直接重新尝试。"
        : failed
          ? "最近一次尝试异常结束，任务已暂停。查看错误后可以直接重新尝试。"
          : "任务当前被阻塞，请查看原因并使用下方恢复操作。",
      badgeVariant: "destructive",
    };
  }

  if (latest && ["failed", "interrupted", "timed_out"].includes(latest.status)) {
    const timedOut = latest.status === "timed_out";
    return {
      state: "failed",
      label: timedOut ? "执行超时" : "执行异常",
      description: timedOut
        ? "最近一次尝试超过了执行时限，请检查任务范围后重试。"
        : "最近一次尝试没有正常完成，请打开任务查看原因和恢复操作。",
      badgeVariant: "destructive",
    };
  }

  if (issue.status === "backlog" || issue.status === "todo") {
    return {
      state: "ready",
      label: "等待开始",
      description: "任务已经建立，等待 Agent 开始处理。",
      badgeVariant: "outline",
    };
  }

  return {
    state: "needs_attention",
    label: "需要确认",
    description: "任务显示为进行中，但当前没有活跃执行。请打开详情确认是否需要重试。",
    badgeVariant: "destructive",
  };
}

const RUN_LABELS: Record<HeartbeatRun["status"], string> = {
  queued: "等待执行",
  scheduled_retry: "等待重试",
  running: "正在执行",
  succeeded: "执行成功",
  interrupted: "执行中断",
  failed: "执行失败",
  cancelled: "执行停止",
  timed_out: "执行超时",
};

function attemptDetail(run: TeamOsRun): string {
  if (run.error?.trim()) return run.error.trim();
  if (run.execution?.nextAction?.trim()) return run.execution.nextAction.trim();
  if (run.status === "succeeded") return "本次尝试已正常完成。";
  if (run.status === "running") return "Agent 正在处理任务。";
  if (run.status === "queued" || run.status === "scheduled_retry") return "等待执行资源。";
  return "打开任务详情可以查看完整执行记录。";
}

export function buildTeamOsAttempts(runs: TeamOsRun[]): TeamOsAttempt[] {
  const oldestFirst = [...runs].sort((left, right) => (
    timestamp(left.startedAt ?? left.createdAt) - timestamp(right.startedAt ?? right.createdAt)
  ));

  return oldestFirst.map((run, index) => {
    return {
      id: run.id,
      // Backend attempt counters restart for a new recovery chain. The workbench
      // shows the task's complete history, so its numbering must stay monotonic.
      number: index + 1,
      status: run.status,
      label: RUN_LABELS[run.status],
      detail: attemptDetail(run),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      isRetry: Boolean(run.retryOfRunId) || (run.scheduledRetryAttempt ?? 0) > 0,
    };
  }).reverse();
}
