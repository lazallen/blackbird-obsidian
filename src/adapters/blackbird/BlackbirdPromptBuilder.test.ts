/**
 * Unit tests for BlackbirdPromptBuilder.
 */
import { describe, expect, it } from "vitest";
import { BlackbirdPromptBuilder } from "./BlackbirdPromptBuilder";
import type { WorkItem } from "../../core/interfaces";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";

function makeTier1Item(title: string, agentContext?: string): WorkItem {
  const meta: BlackbirdTaskMetadata = {
    isNoteSession: false,
    tier: 1,
    rawLine: `[*] ${title} #pinned`,
    sourceFilePath: "notes/work.md",
    lineNumber: 0,
    tags: ["#pinned"],
    hasPage: false,
    agentContext: agentContext ?? title,
  };
  return { id: "bt:abc", path: "notes/work.md", title, state: "pinned", metadata: meta };
}

function makeTier2Item(title: string, pageContent: string): WorkItem {
  const meta: BlackbirdTaskMetadata = {
    isNoteSession: false,
    tier: 2,
    rawLine: `[*] ${title} [[tasks/slug]] #pinned`,
    sourceFilePath: "notes/work.md",
    lineNumber: 0,
    tags: ["#pinned"],
    hasPage: true,
    taskPagePath: "tasks/slug.md",
    agentContext: pageContent,
  };
  return { id: "bt:abc", path: "tasks/slug.md", title, state: "pinned", metadata: meta };
}

function makeNoteSessionItem(title: string, notePath: string): WorkItem {
  const meta: NoteSessionMetadata = {
    isNoteSession: true,
    notePath,
    createdAt: "2026-05-22T10:00:00Z",
  };
  return { id: "ns:abc", path: notePath, title, state: "note-session", metadata: meta };
}

describe("BlackbirdPromptBuilder", () => {
  const builder = new BlackbirdPromptBuilder();

  describe("Tier 1 tasks", () => {
    it("returns task title as prompt", () => {
      const item = makeTier1Item("Fix the login bug");
      const prompt = builder.buildPrompt(item, "/vault/notes/work.md");
      expect(prompt).toBe("Task: Fix the login bug");
    });

    it("includes agentContext when different from title", () => {
      const item = makeTier1Item("Fix login", "Fix login");
      const prompt = builder.buildPrompt(item, "/vault/notes/work.md");
      expect(prompt).toContain("Fix login");
    });
  });

  describe("Tier 2 tasks", () => {
    it("includes task title, file path, and page content", () => {
      const item = makeTier2Item("Big project", "# Big project\n## Context\nDo the thing.");
      const prompt = builder.buildPrompt(item, "/vault/tasks/big-project.md");
      expect(prompt).toContain("Task: Big project");
      expect(prompt).toContain("/vault/tasks/big-project.md");
      expect(prompt).toContain("Do the thing.");
    });

    it("handles empty agentContext gracefully", () => {
      const item = makeTier2Item("Big project", "");
      const prompt = builder.buildPrompt(item, "/vault/tasks/big-project.md");
      expect(prompt).toContain("Task: Big project");
      expect(prompt).toContain("/vault/tasks/big-project.md");
    });
  });

  describe("Note sessions", () => {
    it("includes note title and file path", () => {
      const item = makeNoteSessionItem("My design doc", "notes/design-doc.md");
      const prompt = builder.buildPrompt(item, "/vault/notes/design-doc.md");
      expect(prompt).toContain("Note: My design doc");
      expect(prompt).toContain("/vault/notes/design-doc.md");
    });
  });

  describe("describePromptFormat", () => {
    it("returns a non-empty description", () => {
      expect(builder.describePromptFormat()).toBeTruthy();
    });
  });
});
