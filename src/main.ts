import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import { CalendarView, CalendarViewType } from "./calendar-view";
import {
  DEFAULT_PRIORITY_COLOR_MAP,
  DEFAULT_STATUS_STYLE_MAP,
  parseStyleMapping,
} from "./utils";
import { CalendarPluginBridge } from "./plugin-interface";

const PRIORITY_KEYS = ["low", "normal", "medium", "high"];
const STATUS_KEYS = ["open", "complete", "wont-do", "working", "blocked"];
const TEXT_STYLE_OPTIONS: Record<string, string> = {
  normal: "Normal",
  bold: "Bold",
  italic: "Italic",
  strikethrough: "Strikethrough",
};

interface CalendarPluginSettings {
  priorityColors: Record<string, string>;
  statusStyles: Record<string, string>;
  sidebarBasePath: string;
}


export default class ObsidianCalendarPlugin
  extends Plugin
  implements CalendarPluginBridge
{
  settings: CalendarPluginSettings = {
    priorityColors: { ...DEFAULT_PRIORITY_COLOR_MAP },
    statusStyles: { ...DEFAULT_STATUS_STYLE_MAP },
    sidebarBasePath: "",
  };

  async onload() {
    await this.loadSettings();
    this.registerBasesView(CalendarViewType, {
      name: "Calendar",
      icon: "lucide-calendar",
      factory: (controller, containerEl) =>
        new CalendarView(controller, containerEl, this),
      options: CalendarView.getViewOptions,
    });
    this.addSettingTab(new CalendarPluginSettingsTab(this.app, this));

    this.addCommand({
      id: "open-default-calendar-base-sidebar",
      name: "Open default calendar base in right sidebar",
      callback: () => this.openDefaultBaseInSidebar(),
    });

    this.addRibbonIcon("calendar", "Open default calendar base", async () => {
      await this.openDefaultBaseInSidebar();
    });
  }

  onunload() {}

  async loadSettings() {
    const stored = await this.loadData();
    const priorityColors = parseStyleMapping(
      stored?.priorityColors ?? stored?.priorityColorMap ?? "",
      DEFAULT_PRIORITY_COLOR_MAP,
    );
    const statusStyles = parseStyleMapping(
      stored?.statusStyles ?? stored?.statusStyleMap ?? "",
      DEFAULT_STATUS_STYLE_MAP,
    );
    this.settings = {
      priorityColors,
      statusStyles,
      sidebarBasePath: stored?.sidebarBasePath ?? "",
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshCalendarViews();
  }

  getPriorityColorMap(): Record<string, string> {
    return parseStyleMapping(
      this.settings.priorityColors,
      DEFAULT_PRIORITY_COLOR_MAP,
    );
  }

  getStatusStyleMap(): Record<string, string> {
    return parseStyleMapping(
      this.settings.statusStyles,
      DEFAULT_STATUS_STYLE_MAP,
    );
  }

  refreshCalendarViews() {
    this.app.workspace.iterateLeaves((leaf) => {
      if (leaf.view?.type === CalendarViewType) {
        (
          leaf.view as CalendarView
        ).refreshFromPluginSettings();
      }
    });
  }

  async openDefaultBaseInSidebar(): Promise<void> {
    const path = this.settings.sidebarBasePath?.trim();
    if (!path) {
      new Notice("Set a default calendar base path in settings first.");
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice(`File not found: ${path}`);
      return;
    }
    if (!(file as any).extension) {
      new Notice("Default calendar base must be a file.");
      return;
    }
    let leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(true);
    }
    if (!leaf) {
      new Notice("Could not open right sidebar.");
      return;
    }
    await (leaf as any).openFile(file, { active: false });
    this.app.workspace.revealLeaf(leaf);
  }
}

class CalendarPluginSettingsTab extends PluginSettingTab {
  plugin: ObsidianCalendarPlugin;

  constructor(app: Plugin["app"], plugin: ObsidianCalendarPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Calendar styling" });

    containerEl.createEl("h3", { text: "Priority colors" });
    const priorityKeys = Array.from(
      new Set([
        ...PRIORITY_KEYS,
        ...Object.keys(this.plugin.settings.priorityColors),
      ]),
    );
    priorityKeys.forEach((priority) => {
      new Setting(containerEl)
        .setName(`Priority color (${priority})`)
        .setDesc("Pick the color used for entries with this priority.")
        .addColorPicker((colorPicker) =>
          colorPicker
            .setValue(
              this.plugin.settings.priorityColors[priority] ??
                DEFAULT_PRIORITY_COLOR_MAP[priority] ??
                "#ffffff",
            )
            .onChange(async (value) => {
              this.plugin.settings.priorityColors[priority] = value;
              await this.plugin.saveSettings();
            }),
        );
    });

    containerEl.createEl("h3", { text: "Status styles" });
    const statusKeys = Array.from(
      new Set([
        ...STATUS_KEYS,
        ...Object.keys(this.plugin.settings.statusStyles),
      ]),
    );
    statusKeys.forEach((status) => {
      new Setting(containerEl)
        .setName(`Status style (${status})`)
        .setDesc("Select the text style applied to entries with this status.")
        .addDropdown((dropdown) =>
          dropdown
            .addOptions(TEXT_STYLE_OPTIONS)
            .setValue(
              this.plugin.settings.statusStyles[status] ??
                DEFAULT_STATUS_STYLE_MAP[status] ??
                "normal",
            )
            .onChange(async (value) => {
              this.plugin.settings.statusStyles[status] = value;
              await this.plugin.saveSettings();
            }),
        );
    });

    containerEl.createEl("h3", { text: "Sidebar default base" });
    new Setting(containerEl)
      .setName("Default calendar base path")
      .setDesc("Path to the base file to open in the right sidebar via command/ribbon.")
      .addText((text) =>
        text
          .setPlaceholder("01 Action Items/Events/Calendar.md")
          .setValue(this.plugin.settings.sidebarBasePath ?? "")
          .onChange(async (value) => {
            this.plugin.settings.sidebarBasePath = value.trim();
            await this.plugin.saveSettings();
          }),
      );
  }
}
