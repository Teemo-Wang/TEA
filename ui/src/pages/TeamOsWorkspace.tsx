import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HeartbeatRun, Issue } from "@paperclipai/shared";
import type { CompanyArtifact } from "@/api/artifacts";
import {
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  FileOutput,
  LayoutPanelLeft,
  Plus,
  RotateCcw,
  Send,
  Square,
  Undo2,
  UserRound,
} from "lucide-react";
import { agentsApi } from "@/api/agents";
import { artifactsApi } from "@/api/artifacts";
import { heartbeatsApi } from "@/api/heartbeats";
import { issuesApi } from "@/api/issues";
import { projectsApi } from "@/api/projects";
import { ArtifactCard } from "@/components/artifacts/ArtifactCard";
import { EmptyState } from "@/components/EmptyState";
import { TeamOsArtifactPreviewDialog } from "@/components/TeamOsArtifactPreviewDialog";
import {
  TeamOsCreateTaskDialog,
  type TeamOsTaskDraft,
} from "@/components/TeamOsCreateTaskDialog";
import { TeamOsDecisionDialog, type TeamOsDecision } from "@/components/TeamOsDecisionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToastActions } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import { Link, useSearchParams } from "@/lib/router";
import {
  buildTeamOsAttempts,
  latestActiveTeamOsRun,
  projectTeamOsTaskState,
  shouldPromptTeamOsFreshInstruction,
  shouldReopenTeamOsReply,
} from "@/lib/team-os";
import { cn } from "@/lib/utils";
import { waitForStoppedRuns } from "@/lib/wait-for-stopped-runs";

function issueTime(issue: Issue): number {
  const parsed = new Date(issue.updatedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "时间未知";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function runsForIssue(runs: HeartbeatRun[], issueId: string): HeartbeatRun[] {
  return runs.filter((run) => run.issueId === issueId);
}

function latestRunId(runs: HeartbeatRun[]): string | null {
  const latest = [...runs].sort((left, right) => {
    const leftTime = new Date(left.startedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.startedAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  })[0];
  return latest?.id ?? null;
}

export function TeamOsWorkspace() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reply, setReply] = useState("");
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<CompanyArtifact | null>(null);
  const [reviewAction, setReviewAction] = useState<{
    decision: TeamOsDecision;
    issueId: string;
    stageId: string | null;
  } | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"tasks" | "execution" | "artifacts">(
    searchParams.get("task") ? "execution" : "tasks",
  );

  useEffect(() => {
    setBreadcrumbs([{ label: "Team OS 工作台" }]);
  }, [setBreadcrumbs]);

  const issuesQuery = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!, { limit: 100, sortField: "updated", sortDir: "desc" }),
    enabled: Boolean(selectedCompanyId),
  });
  const runsQuery = useQuery({
    queryKey: queryKeys.heartbeats(selectedCompanyId!),
    queryFn: () => heartbeatsApi.list(selectedCompanyId!, undefined, 200),
    enabled: Boolean(selectedCompanyId),
  });
  const agentsQuery = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });
  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const issues = useMemo(
    () => [...(issuesQuery.data ?? [])].sort((left, right) => issueTime(right) - issueTime(left)),
    [issuesQuery.data],
  );
  const runs = runsQuery.data ?? [];
  const requestedIssueId = searchParams.get("task");
  const selectedIssueSummary = issues.find((issue) => issue.id === requestedIssueId) ?? issues[0] ?? null;
  const selectedIssueDetailQuery = useQuery({
    queryKey: queryKeys.issues.detail(selectedIssueSummary?.id ?? ""),
    queryFn: () => issuesApi.get(selectedIssueSummary!.id),
    enabled: Boolean(selectedIssueSummary),
  });
  // List rows intentionally omit workflow details such as executionState. All
  // decisions use the selected task's full snapshot so stage guards are real.
  const selectedIssue = selectedIssueDetailQuery.data ?? selectedIssueSummary;
  const selectedRunSummaries = selectedIssue ? runsForIssue(runs, selectedIssue.id) : [];
  const selectedLatestRunId = latestRunId(selectedRunSummaries);
  const latestRunDetailQuery = useQuery({
    queryKey: queryKeys.runDetail(selectedLatestRunId!),
    queryFn: () => heartbeatsApi.get(selectedLatestRunId!),
    enabled: Boolean(selectedLatestRunId),
  });
  const selectedRuns = useMemo(() => {
    const detail = latestRunDetailQuery.data;
    if (!detail) return selectedRunSummaries;
    return selectedRunSummaries.map((run) => run.id === detail.id ? detail : run);
  }, [latestRunDetailQuery.data, selectedRunSummaries]);
  const selectedProjection = selectedIssue
    ? projectTeamOsTaskState(selectedIssue, selectedRuns)
    : null;
  const attempts = buildTeamOsAttempts(selectedRuns);
  const activeRun = latestActiveTeamOsRun(selectedRuns);
  const selectedLatestRun = selectedLatestRunId
    ? selectedRuns.find((run) => run.id === selectedLatestRunId) ?? null
    : null;
  const freshInstructionRequired = selectedIssue
    ? shouldPromptTeamOsFreshInstruction(selectedIssue, selectedLatestRun)
    : false;
  const attemptsByRunId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const selectedAgent = selectedIssue?.assigneeAgentId
    ? agentsQuery.data?.find((agent) => agent.id === selectedIssue.assigneeAgentId) ?? null
    : null;
  const defaultAgent = agentsQuery.data?.find((agent) => agent.status !== "terminated") ?? null;
  const availableAgents = agentsQuery.data?.filter((agent) => agent.status !== "terminated") ?? [];
  const projects = projectsQuery.data ?? [];

  const artifactsQuery = useQuery({
    queryKey: queryKeys.artifacts.list(
      selectedCompanyId!,
      "all",
      "",
      "task",
      selectedIssue?.id,
    ),
    queryFn: () => artifactsApi.list(selectedCompanyId!, {
      groupBy: "task",
      groupIssueId: selectedIssue!.id,
      limit: 12,
    }),
    enabled: Boolean(selectedCompanyId && selectedIssue),
  });
  const artifacts = artifactsQuery.data?.artifacts ?? [];
  const hasLoadError = issuesQuery.isError || runsQuery.isError || agentsQuery.isError || projectsQuery.isError;
  const attemptLabelForArtifact = (artifact: CompanyArtifact) => {
    const attempt = artifact.createdByRunId ? attemptsByRunId.get(artifact.createdByRunId) : null;
    return attempt ? `尝试 ${attempt.number}${attempt.isRetry ? "（重试）" : ""}` : "尝试未归属";
  };

  const refreshWorkspace = async (issueId?: string) => {
    if (!selectedCompanyId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(selectedCompanyId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.heartbeats(selectedCompanyId) }),
      ...(issueId
        ? [
            queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) }),
            queryClient.invalidateQueries({ queryKey: queryKeys.issues.comments(issueId) }),
          ]
        : []),
    ]);
  };

  const replyMutation = useMutation({
    mutationFn: async ({ issueId, body }: { issueId: string; body: string; recovering: boolean }) => {
      const current = await issuesApi.get(issueId);
      return issuesApi.addComment(issueId, body, shouldReopenTeamOsReply(current.status));
    },
    onSuccess: async (_comment, variables) => {
      setReply("");
      await refreshWorkspace(variables.issueId);
      pushToast({
        title: variables.recovering ? "恢复指令已发送" : "回复已发送",
        body: variables.recovering
          ? "将开始新的尝试；中断前的记录仍会保留。"
          : "Agent 会在原任务上下文中收到这条消息。",
        tone: "success",
      });
    },
    onError: (failure) => pushToast({
      title: "回复发送失败",
      body: failure instanceof Error ? failure.message : "请稍后重试。",
      tone: "error",
    }),
  });

  const stopMutation = useMutation({
    mutationFn: async ({ issueId, runId }: { issueId: string; runId: string }) => {
      await heartbeatsApi.cancel(runId);
      await waitForStoppedRuns([runId]);
      return issueId;
    },
    onSuccess: async (issueId) => {
      await refreshWorkspace(issueId);
      pushToast({ title: "执行已停止", body: "停止确认已完成，任务和历史记录仍保留。", tone: "success" });
    },
    onError: async (failure, variables) => {
      await refreshWorkspace(variables.issueId);
      pushToast({
        title: "停止结果待确认",
        body: failure instanceof Error
          ? "已发出停止请求，但底层尚未完成确认。请稍后刷新；若仍显示执行中，再次点击停止。"
          : "底层尚未返回停止确认，请稍后刷新。",
        tone: "warn",
      });
    },
  });

  const retryBlockedMutation = useMutation({
    mutationFn: async ({ issueId, actionId }: { issueId: string; actionId: string }) => {
      const current = await issuesApi.get(issueId);
      if (current.status !== "blocked" || current.activeRecoveryAction?.id !== actionId) {
        throw new Error("任务状态已变化，请刷新后重试。");
      }
      if (!current.assigneeAgentId) {
        throw new Error("任务没有可恢复的执行成员，请先重新分配。");
      }
      // A blocked recovery commonly follows an expired or poisoned provider
      // session. Clear only this task's saved session before waking the same
      // assignee; issue history and workspace state remain intact.
      await agentsApi.resetSession(current.assigneeAgentId, current.id, current.companyId);
      const result = await issuesApi.resolveRecoveryAction(issueId, {
        actionId,
        outcome: "restored",
        sourceIssueStatus: "todo",
      });
      if (
        result.issue.status !== "todo"
        || result.issue.assigneeAgentId !== result.recoveryAction.returnOwnerAgentId
      ) {
        throw new Error("任务没有恢复到可执行状态，请打开完整记录检查。");
      }
      return result.issue;
    },
    onSuccess: async (issue) => {
      await refreshWorkspace(issue.id);
      pushToast({
        title: "任务已恢复",
        body: "已交回原执行成员，新的尝试会保留此前记录。",
        tone: "success",
      });
    },
    onError: async (failure, variables) => {
      await refreshWorkspace(variables.issueId);
      pushToast({
        title: "恢复失败",
        body: failure instanceof Error ? failure.message : "请打开完整任务记录检查恢复条件。",
        tone: "error",
      });
    },
  });

  const retryFailedRunMutation = useMutation({
    mutationFn: async ({
      issueId,
      agentId,
      runId,
    }: {
      issueId: string;
      agentId: string;
      runId: string;
    }) => {
      const current = await issuesApi.get(issueId);
      if (["done", "cancelled", "in_review"].includes(current.status)) {
        throw new Error("任务状态已变化，请刷新后重试。");
      }
      if (current.assigneeAgentId !== agentId) {
        throw new Error("执行成员已变化，请刷新后重试。");
      }
      await agentsApi.retryFailedRun(agentId, runId, current.companyId);
      return issueId;
    },
    onSuccess: async (issueId) => {
      await refreshWorkspace(issueId);
      pushToast({
        title: "已开始重新尝试",
        body: "新的尝试会保留此前的错误记录和成果。",
        tone: "success",
      });
    },
    onError: async (failure, variables) => {
      await refreshWorkspace(variables.issueId);
      pushToast({
        title: "重新尝试失败",
        body: failure instanceof Error ? failure.message : "请打开完整任务记录检查当前状态。",
        tone: "error",
      });
    },
  });

  const submitExistingArtifactMutation = useMutation({
    mutationFn: async (issueId: string) => {
      const current = await issuesApi.get(issueId);
      if (["done", "cancelled", "in_review"].includes(current.status)) {
        throw new Error("任务状态已变化，请刷新后重试。");
      }
      if (!current.workProducts?.some((product) => product.status === "ready_for_review")) {
        throw new Error("当前没有可提交验收的成果。");
      }
      return issuesApi.update(issueId, {
        status: "in_review",
        comment: "已保留当前交付成果，提交人工验收。",
      });
    },
    onSuccess: async (issue) => {
      await refreshWorkspace(issue.id);
      pushToast({
        title: "成果已提交验收",
        body: "现在可以预览成果，并选择接受或提出返工。",
        tone: "success",
      });
    },
    onError: async (failure, issueId) => {
      await refreshWorkspace(issueId);
      pushToast({
        title: "提交验收失败",
        body: failure instanceof Error ? failure.message : "请打开完整任务记录检查当前状态。",
        tone: "error",
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({
      decision,
      issueId,
      stageId,
      comment,
    }: {
      decision: TeamOsDecision;
      issueId: string;
      stageId: string | null;
      comment: string;
    }) => {
      const current = await issuesApi.get(issueId);
      if (current.status !== "in_review") {
        throw new Error("任务状态已变化，请刷新后重试。");
      }
      const currentStageId = current.executionState?.status === "pending"
        ? current.executionState.currentStageId ?? null
        : null;
      if (currentStageId !== stageId) {
        throw new Error("验收阶段已变化，请刷新后重新操作。");
      }
      return issuesApi.update(issueId, {
        status: decision === "accept" ? "done" : "in_progress",
        comment,
      });
    },
    onSuccess: async (_issue, variables) => {
      await refreshWorkspace(variables.issueId);
      pushToast({
        title: variables.decision === "accept" ? "成果已接受" : "返工要求已提交",
        body: variables.decision === "accept"
          ? "本次意见和验收结果已保存。"
          : "任务已交回执行成员，旧成果仍保留。",
        tone: "success",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (draft: TeamOsTaskDraft) => {
      let projectId = draft.projectId;
      if (draft.projectMode === "new") {
        const project = await projectsApi.create(selectedCompanyId!, {
          idempotencyKey: `team-os-project-${draft.requestId}`,
          name: draft.projectName,
          description: "由 Team OS 工作台创建的托管试验项目。",
          status: "planned",
        });
        projectId = project.id;
      }
      if (!projectId) throw new Error("请选择项目，或填写新项目名称。");
      return issuesApi.create(selectedCompanyId!, {
        idempotencyKey: `team-os-task-${draft.requestId}`,
        projectId,
        title: draft.title,
        description: draft.description || null,
        status: "todo",
        priority: "medium",
        assigneeAgentId: draft.agentId,
      });
    },
    onSuccess: async (issue) => {
      await Promise.all([
        refreshWorkspace(issue.id),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(selectedCompanyId!) }),
      ]);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("task", issue.id);
        return next;
      });
      setMobilePanel("execution");
      pushToast({
        title: "任务已创建并派出",
        body: "工作台会持续显示真实执行状态和交付成果。",
        tone: "success",
      });
    },
  });

  const selectIssue = (issueId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("task", issueId);
      return next;
    });
    setReply("");
    setMobilePanel("execution");
  };

  if (!selectedCompanyId) {
    return <EmptyState icon={LayoutPanelLeft} message="请先选择一个项目空间。" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">Team OS 工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">选择任务，查看真实执行状态、尝试记录和交付成果。</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/dashboard">高级管理</Link>
          </Button>
          <Button onClick={() => setCreateTaskOpen(true)} disabled={!defaultAgent}>
            <Plus className="h-4 w-4" />
            {defaultAgent ? "新建试验任务" : "没有可用 Agent"}
          </Button>
        </div>
      </header>

      {hasLoadError ? (
        <div className="m-4 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">工作台数据加载失败</p>
            <p className="mt-1 text-destructive/80">请刷新页面；如果仍失败，进入高级管理查看服务状态。</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-3 border-b border-border bg-background p-2 xl:hidden" role="tablist" aria-label="工作台视图">
        {([
          ["tasks", "任务"],
          ["execution", "执行"],
          ["artifacts", "成果"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mobilePanel === value}
            onClick={() => setMobilePanel(value)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mobilePanel === value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-auto p-4 xl:grid-cols-3">
        <Card className={cn("min-h-0 gap-0 py-0", mobilePanel !== "tasks" && "hidden xl:flex")}>
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>任务</span>
              <Badge variant="outline">{issues.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
            {issuesQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">正在读取任务…</p>
            ) : issues.length === 0 ? (
              <EmptyState
                icon={Bot}
                message="还没有任务"
                action={defaultAgent ? "创建第一个任务" : undefined}
                onAction={defaultAgent ? () => setCreateTaskOpen(true) : undefined}
              />
            ) : (
              issues.map((issue) => {
                const projection = projectTeamOsTaskState(issue, runsForIssue(runs, issue.id));
                const active = selectedIssue?.id === issue.id;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => selectIssue(issue.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:border-foreground/20 hover:bg-accent/30",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-(length:--text-micro) text-muted-foreground">
                          {issue.identifier ?? `#${issue.issueNumber ?? "-"}`}
                        </span>
                        <Badge variant={projection.badgeVariant}>{projection.label}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">{issue.title}</p>
                      <p className="mt-1 text-(length:--text-micro) text-muted-foreground">更新于 {formatTime(issue.updatedAt)}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className={cn("min-h-0 gap-0 py-0", mobilePanel !== "execution" && "hidden xl:flex")}>
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="text-base">执行与验收</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 overflow-y-auto p-4">
            {!selectedIssue || !selectedProjection ? (
              <EmptyState icon={Bot} message="选择一个任务查看执行情况。" />
            ) : (
              <div className="flex flex-col gap-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedProjection.badgeVariant}>{selectedProjection.label}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{selectedIssue.identifier}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-foreground">{selectedIssue.title}</h2>
                  {selectedIssue.description ? (
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                      {selectedIssue.description}
                    </p>
                  ) : null}
                  <p className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-foreground/80">
                    {selectedProjection.description}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <UserRound className="h-4 w-4" />
                      执行成员
                    </div>
                    <p className="mt-2 truncate text-sm font-medium">{selectedAgent?.name ?? "尚未分配"}</p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <RotateCcw className="h-4 w-4" />
                      尝试次数
                    </div>
                    <p className="mt-2 text-sm font-medium">{attempts.length} 次</p>
                  </div>
                </div>

                {selectedProjection.state === "awaiting_review" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      onClick={() => setReviewAction({
                        decision: "accept",
                        issueId: selectedIssue.id,
                        stageId: selectedIssue.executionState?.status === "pending"
                          ? selectedIssue.executionState.currentStageId ?? null
                          : null,
                      })}
                    >
                      <Check className="h-4 w-4" />
                      接受成果
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setReviewAction({
                        decision: "rework",
                        issueId: selectedIssue.id,
                        stageId: selectedIssue.executionState?.status === "pending"
                          ? selectedIssue.executionState.currentStageId ?? null
                          : null,
                      })}
                    >
                      <Undo2 className="h-4 w-4" />
                      提出返工
                    </Button>
                  </div>
                ) : null}

                {activeRun ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={stopMutation.isPending}
                    onClick={() => stopMutation.mutate({ issueId: selectedIssue.id, runId: activeRun.id })}
                  >
                    <Square className="h-4 w-4" />
                    {stopMutation.isPending ? "正在停止…" : "停止执行"}
                  </Button>
                ) : null}

                {selectedIssue.status === "blocked" && selectedIssue.activeRecoveryAction ? (
                  <Button
                    className="w-full"
                    disabled={retryBlockedMutation.isPending}
                    onClick={() => retryBlockedMutation.mutate({
                      issueId: selectedIssue.id,
                      actionId: selectedIssue.activeRecoveryAction!.id,
                    })}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {retryBlockedMutation.isPending ? "正在恢复…" : "修复后重新尝试"}
                  </Button>
                ) : null}

                {!activeRun
                  && !selectedIssue.activeRecoveryAction
                  && selectedAgent
                  && selectedLatestRun
                  && ["failed", "timed_out"].includes(selectedLatestRun.status)
                  && !(["done", "cancelled", "in_review"] as Issue["status"][]).includes(selectedIssue.status) ? (
                    <Button
                      className="w-full"
                      disabled={retryFailedRunMutation.isPending}
                      onClick={() => retryFailedRunMutation.mutate({
                        issueId: selectedIssue.id,
                        agentId: selectedAgent.id,
                        runId: selectedLatestRun.id,
                      })}
                    >
                      <RotateCcw className="h-4 w-4" />
                      {retryFailedRunMutation.isPending ? "正在重新尝试…" : "重新尝试"}
                    </Button>
                  ) : null}

                {!activeRun
                  && artifacts.length > 0
                  && !(["done", "cancelled", "in_review"] as Issue["status"][]).includes(selectedIssue.status) ? (
                    <Button
                      className="w-full"
                      variant="secondary"
                      disabled={submitExistingArtifactMutation.isPending}
                      onClick={() => submitExistingArtifactMutation.mutate(selectedIssue.id)}
                    >
                      <Check className="h-4 w-4" />
                      {submitExistingArtifactMutation.isPending ? "正在提交…" : "将现有成果提交验收"}
                    </Button>
                  ) : null}

                {!(["done", "cancelled"] as Issue["status"][]).includes(selectedIssue.status) ? (
                  <section className="rounded-lg border border-border p-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {freshInstructionRequired ? "确认下一步并恢复" : "回复 Agent"}
                    </h3>
                    {freshInstructionRequired ? (
                      <p className="mt-2 rounded-md bg-destructive/5 p-3 text-xs text-foreground/80">
                        服务重启后，旧执行已结束。为避免重复外部操作，请说明下一步；新回复会开始一次新的尝试，中断记录仍会保留。
                      </p>
                    ) : null}
                    <Textarea
                      className="mt-3"
                      aria-label="回复 Agent"
                      placeholder={freshInstructionRequired
                        ? "例如：已确认旧进程退出，请从头重新执行这个任务。"
                        : "补充要求、回答问题或说明下一步…"}
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      disabled={replyMutation.isPending}
                    />
                    <Button
                      className="mt-3 w-full"
                      variant="secondary"
                      disabled={!reply.trim() || replyMutation.isPending}
                      onClick={() => replyMutation.mutate({
                        issueId: selectedIssue.id,
                        body: reply.trim(),
                        recovering: freshInstructionRequired,
                      })}
                    >
                      <Send className="h-4 w-4" />
                      {replyMutation.isPending
                        ? "正在发送…"
                        : freshInstructionRequired
                          ? "发送并开始新尝试"
                          : "发送回复"}
                    </Button>
                  </section>
                ) : null}

                <Button asChild variant="ghost" className="w-full">
                  <Link to={`/issues/${selectedIssue.identifier ?? selectedIssue.id}`}>
                    查看完整任务记录
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </Button>

                <section>
                  <h3 className="text-sm font-semibold text-foreground">尝试记录</h3>
                  <div className="mt-3 flex flex-col gap-2">
                    {attempts.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                        还没有执行记录。
                      </p>
                    ) : (
                      attempts.map((attempt) => (
                        <div key={attempt.id} className="rounded-lg border border-border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">尝试 {attempt.number}</span>
                              {attempt.isRetry ? <Badge variant="outline">重试</Badge> : null}
                            </div>
                            <span className="text-xs font-medium text-foreground">{attempt.label}</span>
                          </div>
                          <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">{attempt.detail}</p>
                          <p className="mt-2 text-(length:--text-micro) text-muted-foreground/70">
                            {formatTime(attempt.finishedAt ?? attempt.startedAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={cn("min-h-0 gap-0 py-0", mobilePanel !== "artifacts" && "hidden xl:flex")}>
          <CardHeader className="border-b border-border py-4">
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span>成果</span>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/artifacts">全部成果</Link>
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 overflow-y-auto p-3">
            {!selectedIssue ? (
              <EmptyState icon={FileOutput} message="选择任务后查看成果。" />
            ) : artifactsQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">正在读取成果…</p>
            ) : artifactsQuery.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                成果加载失败，请打开任务详情重试。
              </div>
            ) : artifacts.length === 0 ? (
              <EmptyState
                icon={FileOutput}
                message="这个任务还没有可查看的成果"
                description="Agent 上传文件或登记成果后，会出现在这里。"
              />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {artifacts.map((artifact) => (
                  <ArtifactCard
                    key={`${artifact.source}:${artifact.id}`}
                    artifact={artifact}
                    contextLabel={attemptLabelForArtifact(artifact)}
                    onOpen={() => setPreviewArtifact(artifact)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {reviewAction ? (
        <TeamOsDecisionDialog
          key={`${reviewAction.issueId}:${reviewAction.stageId ?? "plain"}:${reviewAction.decision}`}
          decision={reviewAction.decision}
          onCancel={() => setReviewAction(null)}
          onSubmit={(comment) => reviewMutation.mutateAsync({ ...reviewAction, comment })}
        />
      ) : null}

      {previewArtifact ? (
        <TeamOsArtifactPreviewDialog
          key={`${previewArtifact.id}:${previewArtifact.updatedAt}`}
          artifact={previewArtifact}
          attemptLabel={attemptLabelForArtifact(previewArtifact)}
          onClose={() => setPreviewArtifact(null)}
        />
      ) : null}

      {createTaskOpen ? (
        <TeamOsCreateTaskDialog
          projects={projects}
          agents={availableAgents}
          onCancel={() => setCreateTaskOpen(false)}
          onSubmit={(draft) => createTaskMutation.mutateAsync(draft)}
        />
      ) : null}
    </div>
  );
}
