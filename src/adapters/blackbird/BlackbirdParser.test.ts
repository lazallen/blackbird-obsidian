/**
 * Unit tests for BlackbirdParser.
 *
 * Mocks the Obsidian App/Vault API so tests run in Node (no Obsidian needed).
 */
import { describe, expect, it } from "vitest";
import type { App, TFile } from "obsidian";
import type { NoteSessionBinder } from "./NoteSessionBinder";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";

// ---- Minimal TFile factory ----
function makeTFile(path: string): TFile {
  return { path, basename: path.split("/").pop()!.replace(/\.md$/, ""), extension: "md" } as TFile;
}

// ---- App mock builder ----
function makeApp(files: Record<string, string>): App {
  const tfiles = Object.keys(files).map(makeTFile);
  return {
    vault: {
      getMarkdownFiles: () => tfiles,
      cachedRead: async (file: TFile) => {
        const content = files[file.path];
        if (content === undefined) throw new Error(`File not found: ${file.path}`);
        return content;
      },
      getAbstractFileByPath: (path: string) => {
        const key = Object.keys(files).find((k) => k === path || k === path + ".md");
        return key ? makeTFile(key) : null;
      },
    },
    metadataCache: { getFileCache: () => null },
  } as unknown as App;
}

// ---- NoteSessionBinder mock ----
function makeSessionBinder(
  entries: Array<{ id: string; notePath: string; createdAt: string }> = [],
): NoteSessionBinder {
  return {
    getAll: () => entries,
    load: async () => {},
    register: async (path: string) => ({
      id: "ns:test",
      notePath: path,
      createdAt: new Date().toISOString(),
    }),
  } as unknown as NoteSessionBinder;
}

// Lazy import after mocks are set up
const { BlackbirdParser } = await import("./BlackbirdParser");

// ---- Tests ----

describe("BlackbirdParser", () => {
  const binder = makeSessionBinder();

  describe("isItemFile", () => {
    it("returns true for .md files", () => {
      const parser = new BlackbirdParser(makeApp({}), "", binder);
      expect(parser.isItemFile("Journal/2026-05-01.md")).toBe(true);
    });

    it("returns false for non-md files", () => {
      const parser = new BlackbirdParser(makeApp({}), "", binder);
      expect(parser.isItemFile("image.png")).toBe(false);
      expect(parser.isItemFile("data.csv")).toBe(false);
    });
  });

  describe("loadAll — task parsing", () => {
    it("returns empty array when no task lines exist", async () => {
      const app = makeApp({ "notes/empty.md": "# Just a note\nNo tasks here." });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(0);
    });

    it("ignores task lines without #pinned/#next/#ready", async () => {
      const app = makeApp({
        "notes/work.md": "- [ ] Untagged task\n- [ ] Also untagged #someothertag\n",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(0);
    });

    it("parses a #pinned task as Tier 1 with state=pinned", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Fix the dashboard bug #pinned\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.state).toBe("pinned");
      expect(item.title).toBe("Fix the dashboard bug");
      const meta = item.metadata as BlackbirdTaskMetadata;
      expect(meta.tier).toBe(1);
      expect(meta.hasPage).toBe(false);
      expect(meta.tags).toContain("#pinned");
      expect(meta.isNoteSession).toBe(false);
    });

    it("parses a #next task as Tier 1 with state=next", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Write tests #next\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(1);
      expect(items[0].state).toBe("next");
    });

    it("parses a #ready task as state=next", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Deploy to prod #ready\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(1);
      expect(items[0].state).toBe("next");
    });

    it("ignores completed [x] tasks even with #next tag", async () => {
      const app = makeApp({ "notes/work.md": "- [x] Done task #next ✅ 2026-05-01\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(0);
    });

    it("ignores cancelled [-] tasks even with #pinned tag", async () => {
      const app = makeApp({ "notes/work.md": "- [-] Cancelled task #pinned\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(0);
    });

    it("includes in-progress [/] tasks", async () => {
      const app = makeApp({ "notes/work.md": "- [/] In-progress task #next\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(1);
    });

    it("captures checkboxState for open and in-progress tasks", async () => {
      const app = makeApp({
        "notes/work.md":
          ["- [ ] Open task #next", "- [/] In-progress task #next"].join("\n") + "\n",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(2);
      const states = items.map((i) => (i.metadata as BlackbirdTaskMetadata).checkboxState);
      expect(states).toEqual([" ", "/"]);
    });

    it("detects [[wikilink]] as Tier 2 and sets path to task page", async () => {
      const app = makeApp({
        "notes/work.md": "- [ ] Big project [[tasks/big-project]] #pinned\n",
        "tasks/big-project.md": "# Big project\n## Context\nDo the thing.",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(1);
      const meta = items[0].metadata as BlackbirdTaskMetadata;
      expect(meta.tier).toBe(2);
      expect(meta.hasPage).toBe(true);
      expect(meta.taskPagePath).toBe("tasks/big-project.md");
      // path should point to the task page, not the source file
      expect(items[0].path).toBe("tasks/big-project.md");
    });

    it("loads task page content as agentContext for Tier 2 tasks", async () => {
      const pageContent = "# Big project\n## Context\nDo the thing.";
      const app = makeApp({
        "notes/work.md": "- [ ] Big project [[tasks/big-project]] #pinned\n",
        "tasks/big-project.md": pageContent,
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      const meta = items[0].metadata as BlackbirdTaskMetadata;
      expect(meta.agentContext).toBe(pageContent);
    });

    it("falls back to task text as agentContext when task page not found", async () => {
      const app = makeApp({
        "notes/work.md": "- [ ] Missing page task [[tasks/missing]] #pinned\n",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      const meta = items[0].metadata as BlackbirdTaskMetadata;
      expect(meta.tier).toBe(2);
      expect(meta.agentContext).toBe("Missing page task");
    });

    it("strips wikilinks from task title", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Do the thing [[tasks/the-thing]] #next\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items[0].title).toBe("Do the thing");
    });

    it("strips tags from task title", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] My task #pinned #work\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items[0].title).toBe("My task");
    });

    it("strips date emojis from task title", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] My task #next 📅 2026-05-22\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items[0].title).toBe("My task");
    });

    it("parses multiple tasks from the same file", async () => {
      const app = makeApp({
        "notes/work.md":
          "- [ ] First task #pinned\n- [ ] Second task #next\n- [ ] Untagged — skip\n",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(2);
      expect(items[0].title).toBe("First task");
      expect(items[1].title).toBe("Second task");
    });

    it("parses tasks across multiple files", async () => {
      const app = makeApp({
        "journal/today.md": "- [ ] Journal task #pinned\n",
        "inbox/work.md": "- [ ] Inbox task #next\n",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items).toHaveLength(2);
    });

    it("records sourceFilePath and lineNumber in metadata", async () => {
      const app = makeApp({ "notes/work.md": "# Header\n\n- [ ] Line 3 task #pinned\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      const meta = items[0].metadata as BlackbirdTaskMetadata;
      expect(meta.sourceFilePath).toBe("notes/work.md");
      expect(meta.lineNumber).toBe(2); // 0-indexed, line 3
    });

    it("generates stable IDs (same file+line → same id)", async () => {
      const content = "- [ ] Stable task #pinned\n";
      const app1 = makeApp({ "notes/work.md": content });
      const app2 = makeApp({ "notes/work.md": content });
      const parser1 = new BlackbirdParser(app1, "", binder);
      const parser2 = new BlackbirdParser(app2, "", binder);
      const items1 = await parser1.loadAll();
      const items2 = await parser2.loadAll();
      expect(items1[0].id).toBe(items2[0].id);
    });

    it("generates different IDs for different file paths", async () => {
      const app = makeApp({
        "notes/file-a.md": "- [ ] Same text #pinned\n",
        "notes/file-b.md": "- [ ] Same text #pinned\n",
      });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items[0].id).not.toBe(items[1].id);
    });

    it("IDs are prefixed with bt:", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Task #pinned\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      expect(items[0].id).toMatch(/^bt:/);
    });
  });

  describe("loadAll — note sessions", () => {
    it("includes note session entries from the binder", async () => {
      const sessionBinder = makeSessionBinder([
        { id: "ns:abc123", notePath: "notes/my-note.md", createdAt: "2026-05-22T10:00:00Z" },
      ]);
      const app = makeApp({ "notes/my-note.md": "# My Note\nSome content." });
      const parser = new BlackbirdParser(app, "", sessionBinder);
      const items = await parser.loadAll();
      const session = items.find((i) => (i.metadata as NoteSessionMetadata).isNoteSession);
      expect(session).toBeDefined();
      expect(session!.id).toBe("ns:abc123");
      expect(session!.state).toBe("note-session");
      expect(session!.title).toBe("my-note");
      const meta = session!.metadata as NoteSessionMetadata;
      expect(meta.notePath).toBe("notes/my-note.md");
    });

    it("note session and task items coexist", async () => {
      const sessionBinder = makeSessionBinder([
        { id: "ns:abc", notePath: "notes/session.md", createdAt: "2026-05-22T10:00:00Z" },
      ]);
      const app = makeApp({
        "notes/tasks.md": "- [ ] A task #pinned\n",
        "notes/session.md": "# Session Note",
      });
      const parser = new BlackbirdParser(app, "", sessionBinder);
      const items = await parser.loadAll();
      const tasks = items.filter((i) => !(i.metadata as NoteSessionMetadata).isNoteSession);
      const sessions = items.filter((i) => (i.metadata as NoteSessionMetadata).isNoteSession);
      expect(tasks).toHaveLength(1);
      expect(sessions).toHaveLength(1);
    });
  });

  describe("groupByColumn", () => {
    it("groups pinned items into pinned column", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Pinned task #pinned\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      const groups = parser.groupByColumn(items);
      expect(groups["pinned"]).toHaveLength(1);
      expect(groups["next"]).toHaveLength(0);
    });

    it("groups next/ready items into next column", async () => {
      const app = makeApp({ "notes/work.md": "- [ ] Next task #next\n- [ ] Ready task #ready\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      const groups = parser.groupByColumn(items);
      expect(groups["next"]).toHaveLength(2);
    });

    it("groups note sessions into note-sessions column", () => {
      const sessionBinder = makeSessionBinder([
        { id: "ns:abc", notePath: "notes/session.md", createdAt: "2026-05-22T10:00:00Z" },
      ]);
      const parser = new BlackbirdParser(makeApp({}), "", sessionBinder);
      const sessionItem = {
        id: "ns:abc",
        path: "notes/session.md",
        title: "session",
        state: "note-session",
        metadata: { isNoteSession: true, notePath: "notes/session.md", createdAt: "" },
      };
      const groups = parser.groupByColumn([sessionItem]);
      expect(groups["note-sessions"]).toHaveLength(1);
    });
  });

  describe("rawLine preservation", () => {
    it("stores the original unmodified line in metadata.rawLine", async () => {
      const rawLine = "- [ ] Do the thing [[tasks/the-thing]] #pinned 📅 2026-05-22";
      const app = makeApp({ "notes/work.md": rawLine + "\n" });
      const parser = new BlackbirdParser(app, "", binder);
      const items = await parser.loadAll();
      const meta = items[0].metadata as BlackbirdTaskMetadata;
      expect(meta.rawLine).toBe(rawLine);
    });
  });
});
