import { useState } from "react";
import type { Agent, Project } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type TeamOsTaskDraft = {
  requestId: string;
  projectMode: "existing" | "new";
  projectId: string | null;
  projectName: string;
  title: string;
  description: string;
  agentId: string;
};

export function TeamOsCreateTaskDialog({
  projects,
  agents,
  onCancel,
  onSubmit,
}: {
  projects: Project[];
  agents: Agent[];
  onCancel: () => void;
  onSubmit: (draft: TeamOsTaskDraft) => Promise<unknown>;
}) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [projectMode, setProjectMode] = useState<"existing" | "new">(
    projects.length > 0 ? "existing" : "new",
  );
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [projectName, setProjectName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectIsValid = projectMode === "new" ? Boolean(projectName.trim()) : Boolean(projectId);
  const canSubmit = projectIsValid && Boolean(title.trim()) && Boolean(agentId) && !pending;

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        requestId,
        projectMode,
        projectId: projectMode === "existing" ? projectId : null,
        projectName: projectMode === "new" ? projectName.trim() : "",
        title: title.trim(),
        description: description.trim(),
        agentId,
      });
      onCancel();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "创建失败，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建试验任务</DialogTitle>
          <DialogDescription>
            选择现有项目，或同时新建项目。提交后任务会直接交给所选 Agent。
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={projectMode === "existing" ? "secondary" : "outline"}
              aria-pressed={projectMode === "existing"}
              disabled={projects.length === 0 || pending}
              onClick={() => setProjectMode("existing")}
            >
              选择现有项目
            </Button>
            <Button
              type="button"
              variant={projectMode === "new" ? "secondary" : "outline"}
              aria-pressed={projectMode === "new"}
              disabled={pending}
              onClick={() => setProjectMode("new")}
            >
              新建项目
            </Button>
          </div>

          {projectMode === "existing" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-os-project">项目</Label>
              <NativeSelect
                id="team-os-project"
                aria-label="项目"
                value={projectId}
                disabled={pending}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="team-os-project-name">项目名称</Label>
              <Input
                id="team-os-project-name"
                aria-label="项目名称"
                placeholder="例如：产品首页试验"
                value={projectName}
                disabled={pending}
                onChange={(event) => setProjectName(event.target.value)}
              />
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="team-os-task-title">任务名称</Label>
            <Input
              id="team-os-task-title"
              aria-label="任务名称"
              placeholder="清楚说明要交付什么"
              value={title}
              disabled={pending}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="team-os-task-description">具体要求</Label>
            <Textarea
              id="team-os-task-description"
              aria-label="具体要求"
              placeholder="补充范围、验收标准和期望格式…"
              value={description}
              disabled={pending}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="team-os-task-agent">执行成员</Label>
            <NativeSelect
              id="team-os-task-agent"
              aria-label="执行成员"
              value={agentId}
              disabled={pending}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </NativeSelect>
          </div>

          {agents.length === 0 ? (
            <p role="alert" className="text-sm text-destructive">当前没有可用 Agent，暂时不能派活。</p>
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>取消</Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "正在创建…" : "创建并派活"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
