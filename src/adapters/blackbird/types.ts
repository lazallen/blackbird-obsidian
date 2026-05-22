/**
 * Core types for the Blackbird adapter.
 *
 * Task format inherited from the Obsidian Tasks plugin:
 *   - [ ] open task
 *   - [x] completed task
 *   - [-] cancelled task
 *   - [/] in-progress task
 *   (any character between brackets is valid — Blackbird reads all states)
 *
 * Blackbird two-tier task model:
 *   Tier 1: A task line with no [[wikilink]] — self-contained, prompt = line text.
 *   Tier 2: A task line with a [[wikilink]] to a task page — prompt = page contents.
 *
 * Tags: #pinned (today's focus), #next / #ready (ready to work on).
 * Only tasks with these tags appear in the Blackbird dashboard.
 *
 * Note sessions: arbitrary vault notes opened into work mode via command.
 */

export type BlackbirdTier = 1 | 2;
export type BlackbirdState = "pinned" | "next" | "note-session";

/** Metadata stored on WorkItem.metadata for task-line items. */
export interface BlackbirdTaskMetadata extends Record<string, unknown> {
  isNoteSession: false;
  tier: BlackbirdTier;
  rawLine: string;
  /** The character inside the checkbox brackets: ' ', 'x', '-', '/', etc. */
  checkboxState: string;
  /** Vault-relative path to the file containing the task line. */
  sourceFilePath: string;
  lineNumber: number;
  tags: string[];
  hasPage: boolean;
  /** Vault-relative path to the task page (Tier 2 only). */
  taskPagePath?: string;
  /** Full text sent to the agent as opening context. */
  agentContext: string;
}

/** Metadata for note-session items (arbitrary notes opened in work mode). */
export interface NoteSessionMetadata extends Record<string, unknown> {
  isNoteSession: true;
  /** Vault-relative path to the note. */
  notePath: string;
  createdAt: string;
}

export type BlackbirdMetadata = BlackbirdTaskMetadata | NoteSessionMetadata;

/** Stored note-session entry in plugin data. */
export interface NoteSessionEntry {
  id: string;
  notePath: string;
  createdAt: string;
}
