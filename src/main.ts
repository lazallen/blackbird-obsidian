/**
 * Blackbird plugin entry point.
 *
 * Wires the BlackbirdAdapter into the obsidian-work-terminal framework and
 * registers Blackbird-specific commands:
 *   - "Open work session for current note" — binds any markdown note to a
 *     Claude agent session and opens both in a split workspace.
 *   - "Open Blackbird manager" — opens the main Blackbird panel.
 *   - "Open Blackbird dashboard" — reveals the sidebar dashboard view.
 */
import { Notice, type App, type PluginManifest, MarkdownView } from "obsidian";
import { PluginBase, VIEW_TYPE } from "./framework/PluginBase";
import { BlackbirdAdapter } from "./adapters/blackbird";
import { NoteSessionBinder } from "./adapters/blackbird/NoteSessionBinder";
import {
  BlackbirdDashboardView,
  DASHBOARD_VIEW_TYPE,
} from "./adapters/blackbird/BlackbirdDashboardView";

export default class BlackbirdPlugin extends PluginBase {
  private _adapter: BlackbirdAdapter;
  private noteSessions: NoteSessionBinder;
  private statusBar: HTMLElement | null = null;
  private statusBarTimer: ReturnType<typeof setInterval> | null = null;

  constructor(app: App, manifest: PluginManifest) {
    const adapter = new BlackbirdAdapter();
    super(app, manifest, adapter);
    this._adapter = adapter;
    this.noteSessions = new NoteSessionBinder(this);
    this._adapter.setNoteSessions(this.noteSessions);
  }

  async onload(): Promise<void> {
    await super.onload();

    // Register the sidebar dashboard view
    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => {
      return new BlackbirdDashboardView(leaf, this._adapter, (itemId) =>
        this.openItemInMainPanel(itemId),
      );
    });

    // Command: open any currently-active note as a bound work session
    this.addCommand({
      id: "open-work-session-for-note",
      name: "Open work session for current note",
      callback: () => void this.openWorkSessionForCurrentNote(),
    });

    // Command: open Blackbird panel (alias for the panel already added by PluginBase)
    this.addCommand({
      id: "open-blackbird-manager",
      name: "Open Blackbird manager",
      callback: () => void this.activateView(),
    });

    // Command: open the sidebar dashboard
    this.addCommand({
      id: "open-blackbird-dashboard",
      name: "Open Blackbird dashboard",
      callback: () => void this.activateDashboard(),
    });

    // Ribbon icon for the dashboard
    this.addRibbonIcon("bird", "Blackbird dashboard", () => void this.activateDashboard());

    // Status bar item — shows "🐦 N waiting" when agent sessions need input
    this.statusBar = this.addStatusBarItem();
    this.updateStatusBar();
    this.statusBarTimer = setInterval(() => this.updateStatusBar(), 5000);

    // Also update status bar on dashboard refresh
    this._adapter.onDashboardRefresh = () => this.updateStatusBar();
  }

  onunload(): void {
    if (this.statusBarTimer !== null) {
      clearInterval(this.statusBarTimer);
      this.statusBarTimer = null;
    }
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
    super.onunload?.();
  }

  private updateStatusBar(): void {
    if (!this.statusBar) return;
    const waiting = this.countWaitingSessions();
    if (waiting > 0) {
      this.statusBar.setText(`🐦 ${waiting} waiting`);
      this.statusBar.setAttribute(
        "aria-label",
        `Blackbird: ${waiting} session${waiting === 1 ? "" : "s"} waiting for input`,
      );
    } else {
      this.statusBar.setText("🐦");
      this.statusBar.setAttribute("aria-label", "Blackbird: no sessions waiting");
    }
  }

  /** Count terminal sessions in "waiting" state across all Blackbird panel leaves. */
  private countWaitingSessions(): number {
    let count = 0;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const terminalPanel = (leaf.view as any)?.terminalPanel;
      if (!terminalPanel) continue;
      const sessions: Map<string, any[]> = (terminalPanel.tabManager as any)?.sessions;
      if (!sessions) continue;
      for (const tabs of sessions.values()) {
        for (const tab of tabs) {
          if ((tab as any)?.agentStateDetector?.state === "waiting") {
            count++;
          }
        }
      }
    }
    return count;
  }

  private async activateDashboard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  /**
   * Opens a task item as a split workspace: note file on the left, terminal
   * on the right. The framework's list panel is hidden via CSS since the
   * sidebar dashboard is the task list for Blackbird.
   */
  private async openItemInMainPanel(itemId: string): Promise<void> {
    // Load items to find the note path for this item
    const items = await this._adapter.getDashboardItems(this.app);
    const item = items.find((i) => i.id === itemId);

    // Step 1: open the note file in the main area
    if (item?.path) {
      const file = this.app.vault.getAbstractFileByPath(item.path) as
        | import("obsidian").TFile
        | null;
      if (file) {
        // Use the active leaf (or a new tab) for the note
        const noteLeaf = this.app.workspace.getMostRecentLeaf() ?? this.app.workspace.getLeaf(true);
        await noteLeaf.openFile(file);
      }
    }

    // Step 2: ensure the work-terminal view exists as a split to the right
    let terminalLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0] ?? null;
    if (!terminalLeaf) {
      // Get the note leaf and split right from it
      const activeLeaf = this.app.workspace.getMostRecentLeaf();
      const newLeaf = activeLeaf
        ? this.app.workspace.createLeafBySplit(activeLeaf, "vertical")
        : this.app.workspace.getLeaf(true);
      await newLeaf.setViewState({ type: VIEW_TYPE, active: false });
      terminalLeaf = newLeaf;
    } else {
      this.app.workspace.revealLeaf(terminalLeaf);
    }

    // Step 3: select the item and auto-launch Claude after the view initialises
    setTimeout(() => {
      const mainView = terminalLeaf?.view as any;
      mainView?.listPanel?.selectById(itemId);
      if (item) {
        const prompt = this._adapter.createPromptBuilder().buildPrompt(item, item.path ?? "");
        void mainView?.terminalPanel?.spawnClaudeWithPrompt(prompt, "Task");
      }
    }, 400);
  }

  private async openWorkSessionForCurrentNote(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView?.file) {
      new Notice("Blackbird: No active note — open a markdown file first");
      return;
    }

    const notePath = activeView.file.path;
    await this.noteSessions.load();

    // Register the note session (idempotent — returns existing entry if present)
    const entry = await this.noteSessions.register(notePath);

    // Trigger a list refresh so the new note-session WorkItem appears
    this._adapter.requestRefresh?.();
    this._adapter.onDashboardRefresh?.();

    // Open the Blackbird panel if it isn't already open
    await this.activateView();

    // After a short delay (to let loadAll() complete), select the note-session item
    setTimeout(() => {
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
      if (leaves.length > 0) {
        const mainView = leaves[0].view as any;
        mainView?.listPanel?.selectById(entry.id);
      }
    }, 300);

    new Notice(`Blackbird: Opened work session for "${activeView.file.basename}"`);
  }
}
