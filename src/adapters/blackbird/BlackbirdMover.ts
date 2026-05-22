/**
 * BlackbirdMover — no-op mover for Blackbird tasks.
 *
 * Blackbird tasks are tagged lines in arbitrary files, not standalone task
 * files. "Moving" between columns means changing tags in the source line,
 * which is not supported in v1. Drag-drop is disabled via empty creationColumns.
 */
import type { App, TFile } from "obsidian";
import type { WorkItemMover } from "../../core/interfaces";

export class BlackbirdMover implements WorkItemMover {
  constructor(private _app: App) {}

  async move(_file: TFile, _targetColumnId: string): Promise<boolean> {
    return false;
  }
}
