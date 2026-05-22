import type { PluginConfig } from "../../core/interfaces";

export const BLACKBIRD_CONFIG: PluginConfig = {
  columns: [
    { id: "pinned", label: "📌 Pinned" },
    { id: "next", label: "▶ Next" },
    { id: "note-sessions", label: "📝 Note Sessions" },
  ],
  creationColumns: [],
  settingsSchema: [
    {
      key: "adapter.taskFolderPath",
      name: "Task folder",
      description: "Vault-relative folder for promoted task pages",
      type: "text",
      default: "tasks",
    },
    {
      key: "adapter.meetingFolderPath",
      name: "Meeting notes folder",
      description: "Vault-relative folder for meeting notes",
      type: "text",
      default: "meetings",
    },
  ],
  defaultSettings: {
    "adapter.taskFolderPath": "tasks",
    "adapter.meetingFolderPath": "meetings",
  },
  itemName: "task",
  terminalStates: [],
};
