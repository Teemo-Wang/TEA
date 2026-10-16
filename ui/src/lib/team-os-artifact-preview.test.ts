// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildSandboxedArtifactHtml,
  isHtmlArtifact,
  isMarkdownArtifact,
} from "./team-os-artifact-preview";

describe("Team OS artifact preview", () => {
  it("adds a restrictive policy before artifact scripts", () => {
    const html = buildSandboxedArtifactHtml("<script>window.previewRan = true</script><h1>Demo</h1>");
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("window.previewRan"));
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain("form-action 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain('name="referrer" content="no-referrer"');
  });

  it("recognizes HTML and Markdown from type or filename", () => {
    expect(isHtmlArtifact({ contentType: "text/html", title: "result" })).toBe(true);
    expect(isHtmlArtifact({ contentType: null, title: "result.HTML" })).toBe(true);
    expect(isMarkdownArtifact({ contentType: "text/markdown", title: "notes" })).toBe(true);
    expect(isMarkdownArtifact({ contentType: null, title: "notes.md" })).toBe(true);
    expect(isHtmlArtifact({ contentType: "text/plain", title: "notes.txt" })).toBe(false);
  });
});
