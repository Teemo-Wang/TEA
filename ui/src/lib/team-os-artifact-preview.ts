import type { CompanyArtifact } from "@/api/artifacts";

const PREVIEW_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

export function isHtmlArtifact(artifact: Pick<CompanyArtifact, "contentType" | "title">): boolean {
  return artifact.contentType?.toLowerCase().includes("text/html") === true
    || /\.html?$/i.test(artifact.title);
}

export function isMarkdownArtifact(artifact: Pick<CompanyArtifact, "contentType" | "title">): boolean {
  const type = artifact.contentType?.toLowerCase() ?? "";
  return type.includes("markdown") || /\.(md|markdown)$/i.test(artifact.title);
}

export function buildSandboxedArtifactHtml(source: string): string {
  const escapedCsp = PREVIEW_CSP.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const safetyHead = [
    `<meta http-equiv="Content-Security-Policy" content="${escapedCsp}">`,
    '<meta name="referrer" content="no-referrer">',
  ].join("");

  if (typeof DOMParser === "undefined") {
    return `<!doctype html><html><head>${safetyHead}</head><body>${source}</body></html>`;
  }

  const document = new DOMParser().parseFromString(source, "text/html");
  document.head.insertAdjacentHTML("afterbegin", safetyHead);
  return `<!doctype html>${document.documentElement.outerHTML}`;
}
