/**
 * BlackbirdDashboardView — Obsidian ItemView displayed in the left sidebar.
 *
 * Shows a compact summary of the workspace:
 *   - Pinned tasks (sorted by file)
 *   - Next/Ready tasks
 *   - Active note sessions (notes opened in work mode)
 *   - Manager session button (opens main Blackbird panel)
 *
 * Each entry is clickable and triggers the same action as clicking the item
 * in the main Blackbird panel (delegated back to the main view via
 * the `openItemCallback` that main.ts passes in).
 */
import { ItemView, WorkspaceLeaf, Notice } from "obsidian";
import type { BlackbirdAdapter } from "./index";
import type { WorkItem } from "../../core/interfaces";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";
import { VIEW_TYPE as MAIN_VIEW_TYPE } from "../../framework/PluginBase";

export const DASHBOARD_VIEW_TYPE = "blackbird-dashboard";

/**
 * Callback provided by main.ts to navigate to a work item in the main panel.
 * Signature matches: open Blackbird panel + select item.
 */
export type OpenItemCallback = (itemId: string) => Promise<void>;

export class BlackbirdDashboardView extends ItemView {
  private adapter: BlackbirdAdapter;
  private openItemCallback: OpenItemCallback;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, adapter: BlackbirdAdapter, openItem: OpenItemCallback) {
    super(leaf);
    this.adapter = adapter;
    this.openItemCallback = openItem;
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Blackbird";
  }

  getIcon(): string {
    return "bird";
  }

  async onOpen(): Promise<void> {
    await this.refresh();
    // Re-render whenever the adapter triggers a refresh
    this.adapter.onDashboardRefresh = () => {
      this.scheduleRefresh();
    };
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.adapter.onDashboardRefresh = undefined;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 300);
  }

  async refresh(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("blackbird-dashboard");

    // Header
    const header = container.createEl("div", { cls: "bb-dashboard-header" });
    header.createEl("span", { cls: "bb-dashboard-title", text: "Blackbird" });
    const refreshBtn = header.createEl("button", { cls: "bb-dashboard-refresh", text: "↻" });
    refreshBtn.setAttribute("aria-label", "Refresh dashboard");
    refreshBtn.onclick = () => void this.refresh();

    // Get all work items from the adapter's parser
    let items: WorkItem[] = [];
    try {
      items = await this.adapter.getDashboardItems();
    } catch (err) {
      console.error("[blackbird-dashboard] Failed to load items:", err);
      container.createEl("p", { cls: "bb-dashboard-error", text: "Failed to load items." });
      return;
    }

    const pinned = items.filter((i) => {
      const m = i.metadata as BlackbirdTaskMetadata;
      return !m.isNoteSession && m.tags?.includes("#pinned");
    });
    const next = items.filter((i) => {
      const m = i.metadata as BlackbirdTaskMetadata;
      return !m.isNoteSession && (m.tags?.includes("#next") || m.tags?.includes("#ready"));
    });
    const sessions = items.filter((i) => (i.metadata as NoteSessionMetadata).isNoteSession);

    this.renderSection(container, "Pinned", pinned);
    this.renderSection(container, "Next", next);
    this.renderSection(container, "Work sessions", sessions);
    this.renderManagerButton(container);
  }

  private renderSection(container: HTMLElement, title: string, items: WorkItem[]): void {
    const section = container.createEl("div", { cls: "bb-dashboard-section" });
    section.createEl("div", {
      cls: "bb-dashboard-section-title",
      text: `${title} (${items.length})`,
    });

    if (items.length === 0) {
      section.createEl("div", { cls: "bb-dashboard-empty", text: "—" });
      return;
    }

    for (const item of items) {
      const row = section.createEl("div", { cls: "bb-dashboard-item" });
      const isNoteSession = (item.metadata as NoteSessionMetadata).isNoteSession;

      if (isNoteSession) {
        const meta = item.metadata as NoteSessionMetadata;
        row.createEl("span", { cls: "bb-dashboard-item-icon", text: "📝" });
        row.createEl("span", { cls: "bb-dashboard-item-label", text: item.title });
        row.createEl("span", {
          cls: "bb-dashboard-item-source",
          text: meta.notePath.split("/").pop() ?? meta.notePath,
        });
      } else {
        const meta = item.metadata as BlackbirdTaskMetadata;
        const tierBadge = meta.tier === 2 ? "T2" : "T1";
        row.createEl("span", { cls: `bb-dashboard-tier bb-tier-${meta.tier}`, text: tierBadge });
        row.createEl("span", { cls: "bb-dashboard-item-label", text: item.title });
        const source = meta.sourceFilePath.split("/").pop()?.replace(/\.md$/, "") ?? "";
        row.createEl("span", { cls: "bb-dashboard-item-source", text: source });
      }

      row.onclick = () => {
        void this.openItemCallback(item.id);
      };
    }
  }

  private renderManagerButton(container: HTMLElement): void {
    const section = container.createEl("div", { cls: "bb-dashboard-section bb-manager-section" });
    const btn = section.createEl("button", {
      cls: "bb-dashboard-manager-btn",
      text: "🧠 Open Manager",
    });
    btn.onclick = () => {
      // Open main Blackbird panel; no specific item to select
      const leaves = this.app.workspace.getLeavesOfType(MAIN_VIEW_TYPE);
      if (leaves.length > 0) {
        this.app.workspace.revealLeaf(leaves[0]);
      } else {
        new Notice("Blackbird: Open the Blackbird panel first");
      }
    };
  }
}
