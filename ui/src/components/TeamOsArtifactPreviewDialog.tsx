import { useQuery } from "@tanstack/react-query";
import { Download, ExternalLink, FileText } from "lucide-react";
import type { CompanyArtifact } from "@/api/artifacts";
import { artifactsApi } from "@/api/artifacts";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildSandboxedArtifactHtml,
  isHtmlArtifact,
  isMarkdownArtifact,
} from "@/lib/team-os-artifact-preview";
import { Link } from "@/lib/router";

function ArtifactContent({ artifact }: { artifact: CompanyArtifact }) {
  const needsText = Boolean(artifact.contentPath) && (
    artifact.mediaKind === "text" || isHtmlArtifact(artifact) || isMarkdownArtifact(artifact)
  );
  const contentQuery = useQuery({
    queryKey: ["team-os-artifact-preview", artifact.id, artifact.updatedAt],
    queryFn: () => artifactsApi.readTextContent(artifact.contentPath!),
    enabled: needsText,
  });

  if (artifact.mediaKind === "image" && artifact.contentPath) {
    return <img src={artifact.contentPath} alt={artifact.title} className="max-h-96 w-full object-contain" />;
  }

  if (artifact.mediaKind === "video" && artifact.contentPath) {
    return <video src={artifact.contentPath} controls className="max-h-96 w-full bg-muted object-contain" />;
  }

  if (contentQuery.isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">正在读取成果…</p>;
  }

  if (contentQuery.isError) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {contentQuery.error instanceof Error ? contentQuery.error.message : "成果读取失败，请下载后查看。"}
      </div>
    );
  }

  const content = contentQuery.data;
  if (content && isHtmlArtifact(artifact)) {
    return (
      <iframe
        title={`${artifact.title} 隔离预览`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={buildSandboxedArtifactHtml(content)}
        className="aspect-video w-full rounded-lg border border-border bg-background"
      />
    );
  }

  if (content && isMarkdownArtifact(artifact)) {
    return (
      <div className="max-h-96 overflow-auto rounded-lg border border-border bg-background p-4">
        <MarkdownBody
          mediaMode="reference"
          linkIssueReferences={false}
          resolveLinkHref={() => null}
        >
          {content}
        </MarkdownBody>
      </div>
    );
  }

  if (content) {
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 text-xs text-foreground">
        {content}
      </pre>
    );
  }

  if (artifact.previewText) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground">
        {artifact.previewText}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center text-muted-foreground">
      <FileText className="h-7 w-7" />
      <p className="text-sm">这个文件暂不支持页内预览。</p>
    </div>
  );
}

export function TeamOsArtifactPreviewDialog({
  artifact,
  attemptLabel,
  onClose,
}: {
  artifact: CompanyArtifact;
  attemptLabel: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{artifact.title}</DialogTitle>
          <DialogDescription>
            来自 {artifact.issue.identifier} · {attemptLabel} · {artifact.createdByAgent?.name ?? "执行成员未知"}
          </DialogDescription>
        </DialogHeader>

        <ArtifactContent artifact={artifact} />

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={onClose}>关闭</Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {artifact.downloadPath ? (
              <Button variant="outline" asChild>
                <a href={artifact.downloadPath} download>
                  <Download className="h-4 w-4" />
                  下载文件
                </a>
              </Button>
            ) : null}
            <Button asChild>
              <Link to={artifact.href} disableIssueQuicklook>
                <ExternalLink className="h-4 w-4" />
                查看来源
              </Link>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
