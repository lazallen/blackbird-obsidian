/**
 * BlackbirdTaskCard — renders Blackbird task cards with tier badge, agent
 * state icon, tag pills, and a "Create task page" action for Tier-1 tasks.
 */
import { setIcon, type MenuItem } from "obsidian";
import type {
  WorkItem,
  CardRenderer,
  CardActionContext,
  CardDisplayMode,
} from "../../core/interfaces";
import type { BlackbirdTaskMetadata, NoteSessionMetadata } from "./types";

export class BlackbirdTaskCard implements CardRenderer {
  /** Callback wired by adapter for task promotion. */
  onPromoteTask?: (item: WorkItem) => void;

  render(item: WorkItem, ctx: CardActionContext, _displayMode?: CardDisplayMode): HTMLElement {
    const meta = item.metadata as BlackbirdTaskMetadata | NoteSessionMetadata;
    const card = document.createElement("div");
    card.className = "bb-card";
    card.setAttribute("data-item-id", item.id);

    if (meta.isNoteSession) {
      this.renderNoteSession(card, item, meta);
    } else {
      this.renderTask(card, item, meta, ctx);
    }

    return card;
  }

  getContextMenuItems(_item: WorkItem, _ctx: CardActionContext): MenuItem[] {
    return [];
  }

  private renderTask(
    card: HTMLElement,
    item: WorkItem,
    meta: BlackbirdTaskMetadata,
    ctx: CardActionContext,
  ): void {
    // Tier badge
    const tierBadge = card.createSpan({ cls: `bb-tier-badge bb-tier-${meta.tier}` });
    tierBadge.textContent = `T${meta.tier}`;

    // Title
    const title = card.createDiv({ cls: "bb-card-title" });
    title.textContent = item.title;

    // Tags
    if (meta.tags.length > 0) {
      const tagRow = card.createDiv({ cls: "bb-tag-row" });
      for (const tag of meta.tags) {
        const pill = tagRow.createSpan({ cls: "bb-tag-pill" });
        pill.textContent = tag;
      }
    }

    // Source file indicator
    const source = card.createDiv({ cls: "bb-card-source" });
    const fileIcon = source.createSpan({ cls: "bb-source-icon" });
    setIcon(fileIcon, "file-text");
    source.createSpan({ cls: "bb-source-path", text: meta.sourceFilePath.split("/").pop() ?? "" });

    // Promote button (Tier-1 only)
    if (meta.tier === 1 && this.onPromoteTask) {
      const promoteBtn = card.createEl("button", {
        cls: "bb-promote-btn",
        text: "Create task page",
        attr: { type: "button" },
      });
      promoteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.onPromoteTask?.(item);
      });
    }

    // Open terminal button
    const openBtn = card.createEl("button", {
      cls: "bb-open-btn",
      attr: { type: "button", title: "Open Claude session" },
    });
    setIcon(openBtn, "terminal");
    openBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      ctx.onSelect();
    });
  }

  private renderNoteSession(card: HTMLElement, item: WorkItem, meta: NoteSessionMetadata): void {
    card.addClass("bb-card-note-session");

    const icon = card.createSpan({ cls: "bb-note-icon" });
    setIcon(icon, "file-edit");

    const title = card.createDiv({ cls: "bb-card-title" });
    title.textContent = item.title;

    const path = card.createDiv({ cls: "bb-card-source" });
    path.createSpan({ cls: "bb-source-path", text: meta.notePath });
  }
}
