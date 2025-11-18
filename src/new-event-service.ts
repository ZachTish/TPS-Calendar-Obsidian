import {
  App,
  BasesPropertyId,
  Modal,
  TFile,
  normalizePath,
  parsePropertyId,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { formatDateTimeForFrontmatter } from "./utils";

export interface NewEventServiceConfig {
  app: App;
  startProperty?: BasesPropertyId | null;
  endProperty?: BasesPropertyId | null;
  allDayProperty?: BasesPropertyId | null;
  folderPath?: string | null;
  templatePath?: string | null;
}

export class NewEventService {
  private config: NewEventServiceConfig;
  private modalInput: HTMLInputElement | null = null;
  private focusInterval: number | null = null;

  constructor(config: NewEventServiceConfig) {
    this.config = config;
  }

  updateConfig(config: NewEventServiceConfig) {
    this.config = { ...this.config, ...config };
  }

  async createEvent(start: Date, end: Date): Promise<TFile | null> {
    const title = await this.promptForTitle();
    if (!title || !title.trim()) return null;
    const safeTitle = title.trim();
    const folderPath = this.resolveFolderPath();
    const path = this.buildUniquePath(folderPath, safeTitle, start);
    const template = await this.loadTemplate(this.config.templatePath);
    const frontmatter = this.buildFrontmatter(safeTitle, start, end);
    const content = this.buildNoteContent(template, frontmatter);
    const file = await this.config.app.vault.create(path, content);
    return file;
  }

  ensureFocus() {
    if (!this.modalInput) return;
    this.applyFocus();
  }

  private resolveFolderPath(): string {
    const folder = this.config.folderPath?.trim();
    if (folder) {
      return normalizePath(folder);
    }
    return this.config.app.vault.getRoot().path;
  }

  private async promptForTitle(): Promise<string | undefined> {
    const service = this;
    return new Promise((resolve) => {
      const modal = new (class extends Modal {
        constructor(app: App) {
          super(app);
        }
        onOpen() {
          const { contentEl } = this;
          contentEl.empty();
          const form = contentEl.createEl("form", {
            attr: { autocomplete: "off" },
          });
          form.createEl("h2", { text: "New calendar event" });
          const input = form.createEl("input", {
            type: "text",
            attr: { autocomplete: "off", autocorrect: "off" },
          });
          let resolved = false;
          let focusLoop: number | null = null;
          const finish = (value: string | undefined) => {
            if (resolved) return;
            resolved = true;
            if (focusLoop !== null) {
              window.clearInterval(focusLoop);
            }
            service.modalInput = null;
            resolve(value);
            this.close();
          };
          const maintain = () => {
            service.applyFocus();
            input.focus({ preventScroll: true });
          };
          this.scope.register([], "Enter", (evt) => {
            evt.preventDefault();
            finish(input.value.trim() || undefined);
          });
          this.scope.register([], "Escape", (evt) => {
            evt.preventDefault();
            finish(undefined);
          });
          ["keyup", "keydown", "keypress"].forEach((evtName) =>
            input.addEventListener(evtName, (evt) => evt.stopPropagation(), true),
          );
          setTimeout(maintain, 0);
          focusLoop = window.setInterval(maintain, 250);
          service.modalInput = input;
          form.addEventListener("submit", (evt) => {
            evt.preventDefault();
            finish(input.value.trim() || undefined);
          });
          const buttons = form.createDiv({ cls: "modal-button-container" });
          buttons.createEl("button", { text: "Create", type: "submit" });
          buttons
            .createEl("button", { text: "Cancel", type: "button" })
            .addEventListener("click", () => finish(undefined));
          this.onClose = () => {
            if (!resolved) {
              finish(undefined);
            }
            this.contentEl.empty();
          };
        }
      })(this.config.app);
      modal.open();
    });
  }

  private applyFocus() {
    if (!this.modalInput) return;
    try {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      document.body?.classList?.remove("tps-context-hidden-for-keyboard");
    } catch {
      /* ignore */
    }
  }

  private buildFrontmatter(
    title: string,
    start: Date,
    end: Date,
  ): Record<string, string> {
    const result: Record<string, string> = {
      title,
    };
    const startField = this.noteField(this.config.startProperty);
    const endField = this.noteField(this.config.endProperty);
    if (startField) {
      result[startField] = formatDateTimeForFrontmatter(start);
    }
    if (endField) {
      result[endField] = formatDateTimeForFrontmatter(end);
    }
    const allDayField = this.noteField(this.config.allDayProperty) ?? "allDay";
    result[allDayField] = this.isAllDay(start, end) ? "true" : "false";
    return result;
  }

  private noteField(propId?: BasesPropertyId | null): string | null {
    if (!propId) return null;
    const parsed = parsePropertyId(propId);
    if (parsed.type === "note") {
      return parsed.property;
    }
    return propId;
  }

  private isAllDay(start: Date, end: Date): boolean {
    return (
      start.getHours() === 0 &&
      start.getMinutes() === 0 &&
      end.getHours() === 0 &&
      end.getMinutes() === 0
    );
  }

  private buildNoteContent(
    templateContent: string | null,
    fields: Record<string, string>,
  ): string {
    const tpl = templateContent ?? "";
    const trimmed = tpl.trimStart();
    if (trimmed.startsWith("---")) {
      const end = trimmed.indexOf("---", 3);
      if (end !== -1) {
        const fmRaw = trimmed.slice(3, end).trim();
        const body = trimmed.slice(end + 3).trimStart();
        const fmObj = fmRaw ? (parseYaml(fmRaw) as Record<string, unknown>) : {};
        Object.assign(fmObj, fields);
        return `---\n${stringifyYaml(fmObj)}---\n\n${body}`;
      }
    }
    return `---\n${stringifyYaml(fields)}---\n\n${tpl}`;
  }

  private async loadTemplate(path?: string | null): Promise<string | null> {
    if (!path) return null;
    try {
      const file = this.config.app.vault.getAbstractFileByPath(
        normalizePath(path),
      );
      if (file && file instanceof TFile) {
        return await this.config.app.vault.read(file);
      }
    } catch (error) {
      console.warn("[Weekly Calendar] Failed to load template", error);
    }
    return null;
  }

  private buildUniquePath(folderPath: string, title: string, date: Date): string {
    const baseTitle = `${title}.md`;
    let path = normalizePath(`${folderPath}/${baseTitle}`);
    if (!this.config.app.vault.getAbstractFileByPath(path)) {
      return path;
    }
    const dateSuffix = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(date.getDate()).padStart(2, "0")}`;
    path = normalizePath(`${folderPath}/${title} ${dateSuffix}.md`);
    let counter = 1;
    while (this.config.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folderPath}/${title} ${dateSuffix} ${counter}.md`);
      counter++;
    }
    return path;
  }
}
