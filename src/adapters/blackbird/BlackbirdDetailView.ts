/**
 * BlackbirdDetailView — opens the bound note/task page alongside the terminal.
 *
 * When a task or note session is selected, this view opens the corresponding
 * file in a split leaf to the left of the terminal panel. This is the core
 * UX primitive: note + agent terminal in one bound workspace.
 */
import type { App, TFile, WorkspaceLeaf } from "obsidian";
import { VIEW_TYPE } from "../../framework/PluginBase";
import type { WorkItem } from "../../core/interfaces";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";

export class BlackbirdDetailView {
  private editorLeaf: WorkspaceLeaf | null = null;
  private lastItemId: string | null = null;
  private openedPaths = new Set<string>();

  constructor(private app: App) {}

  async show(item: WorkItem, ownerLeaf: WorkspaceLeaf): Promise<void> {
    const meta = item.metadata as BlackbirdTaskMetadata | NoteSessionMetadata;
    const notePath = meta.isNoteSession ? meta.notePath : item.path;

    if (!notePath) return;

    const file = this.app.vault.getAbstractFileByPath(notePath) as TFile | null;
    if (!file) return;

    // Detach stale leaf when switching to a different item
    if (this.lastItemId && this.lastItemId !== item.id && this.editorLeaf) {
      await this.detachLeaf();
    }
    this.lastItemId = item.id;

    if (this.editorLeaf && this.openedPaths.has(notePath)) {
      // Leaf is already showing the right file — just reveal it
      this.app.workspace.revealLeaf(this.editorLeaf);
      return;
    }

    // Find or create the split leaf to the left of the work terminal
    const targetLeaf = this.findOrCreateSplitLeaf(ownerLeaf);
    if (!targetLeaf) return;

    this.editorLeaf = targetLeaf;
    this.openedPaths.add(notePath);
    await targetLeaf.openFile(file);
  }

  detach(): void {
    void this.detachLeaf();
  }

  rekeyPath(oldPath: string, newPath: string): void {
    if (this.openedPaths.has(oldPath)) {
      this.openedPaths.delete(oldPath);
      this.openedPaths.add(newPath);
    }
  }

  private async detachLeaf(): Promise<void> {
    if (!this.editorLeaf) return;
    const leaf = this.editorLeaf;
    this.editorLeaf = null;
    // Don't detach the leaf if the user has navigated it to something else
    // — only close it if we opened it and it's still showing one of our files.
    const currentPath = (leaf.view as any)?.file?.path as string | undefined;
    if (currentPath && this.openedPaths.has(currentPath)) {
      leaf.detach();
    }
  }

  private findOrCreateSplitLeaf(ownerLeaf: WorkspaceLeaf): WorkspaceLeaf | null {
    // Try to find an existing non-terminal leaf in the same split group
    const { workspace } = this.app;
    const ownerParent = (ownerLeaf as any).parent;

    if (ownerParent) {
      for (const leaf of workspace.getLeavesOfType("markdown")) {
        if ((leaf as any).parent === ownerParent && leaf !== ownerLeaf) {
          return leaf;
        }
      }
    }

    // Create a new split leaf to the left of the terminal
    const workTerminalLeaves = workspace.getLeavesOfType(VIEW_TYPE);
    const targetLeaf = workTerminalLeaves[0] ?? ownerLeaf;
    return workspace.createLeafBySplit(targetLeaf, "vertical", true);
  }
}
