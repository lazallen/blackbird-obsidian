/**
 * NoteSessionBinder — persists note-path → session-id bindings in plugin data.
 *
 * Note sessions are arbitrary vault notes the user has explicitly opened in
 * work mode via the "Blackbird: Open work session for current note" command.
 * They are stored in data.json so they survive Obsidian restarts.
 */
import type { NoteSessionEntry } from "./types";
import { mergeAndSavePluginData, type PluginDataStore } from "../../core/PluginDataStore";

const DATA_KEY = "blackbirdNoteSessions";

/** Simple 8-char hex hash sufficient for stable WorkItem IDs. */
function fnv1aHex(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export function noteSessionId(notePath: string): string {
  return "ns:" + fnv1aHex(notePath);
}

export class NoteSessionBinder {
  private sessions: Map<string, NoteSessionEntry> = new Map();
  private loaded = false;

  constructor(private plugin: PluginDataStore) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    const data = (await this.plugin.loadData()) || {};
    const raw: unknown = data[DATA_KEY];
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as NoteSessionEntry).id === "string" &&
          typeof (entry as NoteSessionEntry).notePath === "string"
        ) {
          const e = entry as NoteSessionEntry;
          this.sessions.set(e.notePath, e);
        }
      }
    }
    this.loaded = true;
  }

  getAll(): NoteSessionEntry[] {
    return [...this.sessions.values()];
  }

  has(notePath: string): boolean {
    return this.sessions.has(notePath);
  }

  getIdForPath(notePath: string): string | null {
    return this.sessions.get(notePath)?.id ?? null;
  }

  async register(notePath: string): Promise<NoteSessionEntry> {
    const existing = this.sessions.get(notePath);
    if (existing) return existing;

    const entry: NoteSessionEntry = {
      id: noteSessionId(notePath),
      notePath,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(notePath, entry);
    await this.persist();
    return entry;
  }

  async remove(notePath: string): Promise<void> {
    if (!this.sessions.has(notePath)) return;
    this.sessions.delete(notePath);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const snapshot = [...this.sessions.values()];
    await mergeAndSavePluginData(this.plugin, (data) => {
      data[DATA_KEY] = snapshot;
    });
  }
}
