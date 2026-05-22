/**
 * BlackbirdPromptBuilder — tier-aware context prompt for agent sessions.
 *
 * Tier 1: task line text is the prompt (quick context).
 * Tier 2: task page contents are the prompt (rich context).
 * Note sessions: note title + file path so the agent knows what it's working on.
 */
import type { WorkItem, WorkItemPromptBuilder } from "../../core/interfaces";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";

export class BlackbirdPromptBuilder implements WorkItemPromptBuilder {
  buildPrompt(item: WorkItem, fullPath: string): string {
    const meta = item.metadata as BlackbirdTaskMetadata | NoteSessionMetadata;

    if (meta.isNoteSession) {
      return `Note: ${item.title}\nFile: ${fullPath}`;
    }

    if (meta.tier === 2) {
      // Rich context: page contents (already loaded by parser)
      return meta.agentContext
        ? `Task: ${item.title}\nFile: ${fullPath}\n\n${meta.agentContext}`
        : `Task: ${item.title}\nFile: ${fullPath}`;
    }

    // Tier 1: just the task line
    return `Task: ${item.title}`;
  }

  describePromptFormat(): string {
    return "Tier 1: Task: $title\nTier 2: Task: $title\nFile: $filePath\n\n$pageContents\nNote session: Note: $title\nFile: $filePath";
  }
}
