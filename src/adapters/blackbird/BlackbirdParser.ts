/**
 * BlackbirdParser — scans all vault markdown files for [*] task lines and
 * includes registered note sessions from NoteSessionBinder.
 *
 * Task format:
 *   [*] Task text [[tasks/TASK-slug]] #tag1 #tag2
 *
 * Only tasks tagged #pinned OR (#next OR #ready) are included.
 * Tasks with a [[wikilink]] are Tier 2; others are Tier 1.
 */
import type { App, TFile } from "obsidian";
import type { WorkItem, WorkItemParser } from "../../core/interfaces";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";
import type { NoteSessionBinder } from "./NoteSessionBinder";

/** [*] line regex: captures text after [*], then optionally a [[wikilink]]. */
const TASK_LINE_RE = /^\[\*\]\s+(.+)$/;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const TAG_RE = /#[\w/]+/g;
const DATE_RE = /\s*(📅|⏳|✅)\s*\d{4}-\d{2}-\d{2}/gu;

/** Simple 8-char hex hash for stable WorkItem IDs. */
function fnv1aHex(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function taskId(filePath: string, lineNumber: number): string {
  return "bt:" + fnv1aHex(`${filePath}:${lineNumber}`);
}

function stripWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "").trim();
}

function stripTags(text: string): string {
  return text.replace(TAG_RE, "").trim();
}

function stripDates(text: string): string {
  return text.replace(DATE_RE, "").trim();
}

function extractTags(line: string): string[] {
  return [...line.matchAll(TAG_RE)].map((m) => m[0]);
}

function extractWikilinks(line: string): string[] {
  return [...line.matchAll(new RegExp(WIKILINK_RE.source, "g"))].map((m) => m[1]);
}

function cleanTaskText(raw: string): string {
  let t = raw;
  t = stripWikilinks(t);
  t = stripDates(t);
  t = stripTags(t);
  return t.replace(/\s+/g, " ").trim();
}

function determineState(tags: string[]): "pinned" | "next" | null {
  if (tags.includes("#pinned")) return "pinned";
  if (tags.includes("#next") || tags.includes("#ready")) return "next";
  return null;
}

export class BlackbirdParser implements WorkItemParser {
  basePath: string;

  constructor(
    private app: App,
    basePath: string,
    private noteSessions: NoteSessionBinder,
  ) {
    this.basePath = basePath;
  }

  /** Returns the first task from a file (used by framework for rename tracking). */
  parse(file: TFile): WorkItem | null {
    const cache = this.app.metadataCache.getFileCache(file);
    if (!cache) return null;
    // We can't synchronously read the file here, so return null and rely on loadAll()
    return null;
  }

  isItemFile(path: string): boolean {
    return path.endsWith(".md");
  }

  async loadAll(): Promise<WorkItem[]> {
    const items: WorkItem[] = [];
    const files = this.app.vault.getMarkdownFiles();

    for (const file of files) {
      const fileItems = await this.parseFile(file);
      items.push(...fileItems);
    }

    // Add note sessions
    for (const entry of this.noteSessions.getAll()) {
      const meta: NoteSessionMetadata = {
        isNoteSession: true,
        notePath: entry.notePath,
        createdAt: entry.createdAt,
      };
      const basename = entry.notePath.split("/").pop()?.replace(/\.md$/, "") ?? entry.notePath;
      items.push({
        id: entry.id,
        path: entry.notePath,
        title: basename,
        state: "note-session",
        metadata: meta,
      });
    }

    return items;
  }

  groupByColumn(items: WorkItem[]): Record<string, WorkItem[]> {
    const groups: Record<string, WorkItem[]> = {
      pinned: [],
      next: [],
      "note-sessions": [],
    };
    for (const item of items) {
      const col = this.stateToColumn(item.state);
      if (!groups[col]) groups[col] = [];
      groups[col].push(item);
    }
    return groups;
  }

  private stateToColumn(state: string): string {
    if (state === "pinned") return "pinned";
    if (state === "next") return "next";
    if (state === "note-session") return "note-sessions";
    return "next";
  }

  private async parseFile(file: TFile): Promise<WorkItem[]> {
    let content: string;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch {
      return [];
    }

    const lines = content.split("\n");
    const items: WorkItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(TASK_LINE_RE);
      if (!match) continue;

      const rawContent = match[1];
      const tags = extractTags(rawContent);
      const state = determineState(tags);
      if (!state) continue;

      const wikilinks = extractWikilinks(rawContent);
      const hasPage = wikilinks.length > 0;
      const taskPagePath = hasPage
        ? wikilinks[0] + (wikilinks[0].endsWith(".md") ? "" : ".md")
        : undefined;

      const text = cleanTaskText(rawContent);
      const id = taskId(file.path, i);

      let agentContext = text;
      if (hasPage && taskPagePath) {
        const pageFile =
          (this.app.vault.getAbstractFileByPath(taskPagePath) as TFile | null) ??
          (this.app.vault.getAbstractFileByPath(wikilinks[0]) as TFile | null);
        if (pageFile) {
          try {
            agentContext = await this.app.vault.cachedRead(pageFile);
          } catch {
            agentContext = text;
          }
        }
      }

      const meta: BlackbirdTaskMetadata = {
        isNoteSession: false,
        tier: hasPage ? 2 : 1,
        rawLine: line,
        sourceFilePath: file.path,
        lineNumber: i,
        tags,
        hasPage,
        taskPagePath,
        agentContext,
      };

      items.push({
        id,
        path: hasPage && taskPagePath ? taskPagePath : file.path,
        title: text,
        state,
        metadata: meta,
      });
    }

    return items;
  }
}
