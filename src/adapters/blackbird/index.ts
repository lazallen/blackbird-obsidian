/**
 * BlackbirdAdapter — wires the Blackbird task/note-session model into the
 * obsidian-work-terminal framework.
 *
 * Replace Tom's TaskAgentAdapter with this in main.ts to get Blackbird
 * semantics: [*] task lines, two-tier context, note-session binding,
 * task promotion, and a split note+terminal detail view.
 */
import type { App, WorkspaceLeaf } from "obsidian";
import { Notice } from "obsidian";
import {
  BaseAdapter,
  type WorkItem,
  type WorkItemParser,
  type WorkItemMover,
  type CardRenderer,
  type WorkItemPromptBuilder,
  type PluginConfig,
} from "../../core/interfaces";
import { BLACKBIRD_CONFIG } from "./BlackbirdConfig";
import { BlackbirdParser } from "./BlackbirdParser";
import { BlackbirdMover } from "./BlackbirdMover";
import { BlackbirdTaskCard } from "./BlackbirdTaskCard";
import { BlackbirdPromptBuilder } from "./BlackbirdPromptBuilder";
import { BlackbirdDetailView } from "./BlackbirdDetailView";
import { NoteSessionBinder } from "./NoteSessionBinder";
import type { BlackbirdTaskMetadata } from "./types";
import { electronRequire } from "../../core/utils";

export class BlackbirdAdapter extends BaseAdapter {
  config: PluginConfig = { ...BLACKBIRD_CONFIG };
  // Set by the framework after construction; declared here so promoteTask() can call it.
  requestRefresh?: () => void;

  private _app: App | null = null;
  private _settings: Record<string, unknown> = {};
  private _noteSessions: NoteSessionBinder | null = null;
  private _detailView: BlackbirdDetailView | null = null;
  private _cardRenderer: BlackbirdTaskCard | null = null;

  /** Called once by main.ts after plugin loads to inject the binder. */
  setNoteSessions(binder: NoteSessionBinder): void {
    this._noteSessions = binder;
  }

  async onLoad(app: App, settings: Record<string, unknown>): Promise<void> {
    this._app = app;
    this._settings = settings;
    if (this._noteSessions) {
      await this._noteSessions.load();
    }
  }

  createParser(app: App, basePath: string, settings?: Record<string, unknown>): WorkItemParser {
    this._app = app;
    this._settings = settings ?? {};
    if (!this._noteSessions) {
      throw new Error("BlackbirdAdapter: NoteSessionBinder not set before createParser");
    }
    return new BlackbirdParser(app, basePath, this._noteSessions);
  }

  createMover(app: App, _basePath: string, _settings?: Record<string, unknown>): WorkItemMover {
    return new BlackbirdMover(app);
  }

  createCardRenderer(): CardRenderer {
    const card = new BlackbirdTaskCard();
    card.onPromoteTask = (item) => void this.promoteTask(item);
    this._cardRenderer = card;
    return card;
  }

  createPromptBuilder(): WorkItemPromptBuilder {
    return new BlackbirdPromptBuilder();
  }

  createDetailView(
    item: WorkItem,
    app: App,
    ownerLeaf: WorkspaceLeaf,
    _embeddedHost?: HTMLElement | null,
    _previewHost?: HTMLElement | null,
  ): void {
    this._app = app;
    if (!this._detailView) {
      this._detailView = new BlackbirdDetailView(app);
    }
    void this._detailView.show(item, ownerLeaf);
  }

  detachDetailView(): void {
    this._detailView?.detach();
    this._detailView = null;
  }

  rekeyDetailPath(oldPath: string, newPath: string): void {
    this._detailView?.rekeyPath(oldPath, newPath);
  }

  /**
   * Optional callback set by BlackbirdDashboardView so it can re-render
   * when the item list changes.
   */
  onDashboardRefresh?: () => void;

  /**
   * Returns all current WorkItems for the dashboard to render.
   * Bypasses the framework list refresh cycle by calling the parser directly.
   */
  async getDashboardItems(): Promise<WorkItem[]> {
    if (!this._app || !this._noteSessions) return [];
    const basePath = ((this._app as any).vault?.adapter?.basePath as string | undefined) ?? "";
    const parser = this.createParser(this._app, basePath, this._settings);
    return parser.loadAll();
  }

  getStyles(): string {
    return `
/* Blackbird card styles */
.bb-card {
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--background-secondary);
  margin-bottom: 6px;
  cursor: pointer;
  position: relative;
}
.bb-card:hover {
  background: var(--background-modifier-hover);
}
.bb-tier-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  margin-bottom: 4px;
  letter-spacing: 0.05em;
}
.bb-tier-1 {
  background: var(--color-blue);
  color: white;
}
.bb-tier-2 {
  background: var(--color-purple);
  color: white;
}
.bb-card-title {
  font-size: 13px;
  font-weight: 500;
  margin: 4px 0;
  line-height: 1.4;
}
.bb-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}
.bb-tag-pill {
  font-size: 10px;
  background: var(--tag-background);
  color: var(--tag-color);
  border-radius: 10px;
  padding: 1px 6px;
}
.bb-card-source {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}
.bb-source-icon {
  display: flex;
  align-items: center;
}
.bb-source-icon svg {
  width: 12px;
  height: 12px;
}
.bb-promote-btn {
  margin-top: 6px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  cursor: pointer;
  display: block;
}
.bb-promote-btn:hover {
  background: var(--interactive-accent-hover);
}
.bb-open-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
}
.bb-open-btn:hover {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}
.bb-open-btn svg {
  width: 14px;
  height: 14px;
}
.bb-card-note-session {
  border-left: 3px solid var(--color-green);
}
.bb-note-icon {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}
.bb-note-icon svg {
  width: 14px;
  height: 14px;
  color: var(--color-green);
}

/* ---- Dashboard styles ---- */
.blackbird-dashboard {
  padding: 8px 10px;
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
}
.bb-dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.bb-dashboard-title {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.03em;
}
.bb-dashboard-refresh {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
  padding: 2px 4px;
  border-radius: 4px;
}
.bb-dashboard-refresh:hover {
  color: var(--text-normal);
  background: var(--background-modifier-hover);
}
.bb-dashboard-section {
  margin-bottom: 14px;
}
.bb-dashboard-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.bb-dashboard-empty {
  font-size: 12px;
  color: var(--text-faint);
  padding: 2px 0;
}
.bb-dashboard-error {
  font-size: 12px;
  color: var(--text-error);
}
.bb-dashboard-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 5px;
  cursor: pointer;
  margin-bottom: 3px;
  background: var(--background-secondary);
  overflow: hidden;
}
.bb-dashboard-item:hover {
  background: var(--background-modifier-hover);
}
.bb-dashboard-item-icon {
  flex-shrink: 0;
  font-size: 13px;
}
.bb-dashboard-tier {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  letter-spacing: 0.05em;
}
.bb-dashboard-item-label {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bb-dashboard-item-source {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
}
.bb-manager-section {
  border-top: 1px solid var(--background-modifier-border);
  padding-top: 10px;
}
.bb-dashboard-manager-btn {
  width: 100%;
  padding: 7px 10px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  text-align: left;
}
.bb-dashboard-manager-btn:hover {
  background: var(--interactive-accent-hover);
}
    `.trim();
  }

  // ---------------------------------------------------------------------------
  // Task promotion
  // ---------------------------------------------------------------------------

  private async promoteTask(item: WorkItem): Promise<void> {
    if (!this._app) return;
    const meta = item.metadata as BlackbirdTaskMetadata;
    if (meta.isNoteSession || meta.tier !== 1) return;

    const { app } = this;
    if (!app) return;

    const taskFolderPath = (this._settings["adapter.taskFolderPath"] as string) || "tasks";
    const slug = this.slugify(item.title);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const taskId = `TASK-${dateStr}-${slug}`;
    const taskFileName = `${taskId}.md`;
    const taskPagePath = `${taskFolderPath}/${taskFileName}`;
    const createdDate = new Date().toISOString().slice(0, 10);
    const sourceRef = meta.sourceFilePath.replace(/\.md$/, "");

    const pageContent = `---
task-id: ${taskId}
status: active
created: ${createdDate}
source: [[${sourceRef}]]
claudeSessionId:
---

# ${item.title}

## Context

## Notes

## Sub-tasks
`;

    try {
      // Ensure folder exists
      const folder = this._app.vault.getAbstractFileByPath(taskFolderPath);
      if (!folder) {
        await this._app.vault.createFolder(taskFolderPath);
      }

      // Create the task page
      await this._app.vault.create(taskPagePath, pageContent);

      // Append wikilink to the source task line
      const sourceFile = this._app.vault.getAbstractFileByPath(meta.sourceFilePath) as
        | import("obsidian").TFile
        | null;
      if (sourceFile) {
        const content = await this._app.vault.read(sourceFile);
        const lines = content.split("\n");
        const lineIdx = meta.lineNumber;
        if (lineIdx < lines.length) {
          const wikilink = `[[${taskFolderPath}/${taskId}]]`;
          if (!lines[lineIdx].includes("[[")) {
            lines[lineIdx] = lines[lineIdx].trimEnd() + ` ${wikilink}`;
            await this._app.vault.modify(sourceFile, lines.join("\n"));
          }
        }
      }

      new Notice(`Blackbird: Created task page ${taskPagePath}`);
      this.requestRefresh?.();
      this.onDashboardRefresh?.();
    } catch (err) {
      console.error("[blackbird] Failed to promote task:", err);
      new Notice(
        `Blackbird: Failed to create task page — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private get app(): App | null {
    return this._app;
  }

  private slugify(text: string): string {
    const path = electronRequire("path") as typeof import("path");
    void path; // Not using path here, just showing node is available
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 50)
      .replace(/^-|-$/g, "");
  }
}
