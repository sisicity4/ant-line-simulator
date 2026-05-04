import type { MapPreset, SimulationStats, ToolDefinition, ToolKind } from "../simulation/types";

interface HudOptions {
  tools: ToolDefinition[];
  maps: MapPreset[];
  onToolSelect: (tool: ToolKind) => void;
  onMapSelect: (mapId: string) => void;
  onReset: () => void;
}

export class HudController {
  private readonly root: HTMLDivElement;
  private options?: HudOptions;
  private stats?: SimulationStats;

  constructor(root: HTMLDivElement) {
    this.root = root;
  }

  mount(options: HudOptions): void {
    this.options = options;
    this.render();
  }

  update(stats: SimulationStats): void {
    this.stats = stats;
    this.renderStats();
    this.syncTools();
  }

  private render(): void {
    if (!this.options) return;
    this.root.innerHTML = `
      <div class="hud hud-top">
        <div class="meter-group">
          <span class="meter-label">行列安定度</span>
          <span class="meter"><span class="meter-fill" data-meter></span></span>
          <strong data-integrity>0%</strong>
        </div>
        <div class="score-grid">
          <span>スコア <strong data-score>0</strong></span>
          <span>運んだかけら <strong data-food>0</strong></span>
          <span>アリ <strong data-ants>0</strong></span>
        </div>
      </div>
      <div class="hud map-dock" role="toolbar" aria-label="マップ">
        ${this.options.maps
          .map(
            (map) => `
              <button class="map-button" data-map="${map.id}" title="${map.description}" aria-label="${map.name}">
                ${map.name}
              </button>
            `
          )
          .join("")}
      </div>
      <div class="hud tool-dock" role="toolbar" aria-label="道具">
        ${this.options.tools
          .map(
            (tool) => `
              <button class="tool-button" data-tool="${tool.kind}" title="${tool.label}" aria-label="${tool.label}">
                <span class="tool-icon">${tool.icon}</span>
                <span>${tool.label}</span>
              </button>
            `
          )
          .join("")}
      </div>
      <button class="reset-button" type="button" data-reset>リセット</button>
      <details class="research-note">
        <summary>研究メモ</summary>
        <p>フェロモン濃度差への旋回、ランダム探索、蒸発、経路記憶を簡略化したモデルです。</p>
      </details>
    `;

    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      button.addEventListener("click", () => {
        const tool = button.dataset.tool as ToolKind;
        this.options?.onToolSelect(tool);
      });
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-map]")) {
      button.addEventListener("click", () => {
        const mapId = button.dataset.map;
        if (mapId) this.options?.onMapSelect(mapId);
      });
    }
    this.root.querySelector<HTMLButtonElement>("[data-reset]")?.addEventListener("click", () => this.options?.onReset());
  }

  private renderStats(): void {
    if (!this.stats) return;
    this.setText("[data-score]", this.stats.score.toString());
    this.setText("[data-food]", this.stats.deliveredFood.toString());
    this.setText("[data-ants]", this.stats.activeAnts.toString());
    this.setText("[data-integrity]", `${this.stats.trailIntegrity}%`);
    const meter = this.root.querySelector<HTMLSpanElement>("[data-meter]");
    if (meter) meter.style.width = `${this.stats.trailIntegrity}%`;
  }

  private syncTools(): void {
    if (!this.stats) return;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
      button.classList.toggle("is-active", button.dataset.tool === this.stats.selectedTool);
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-map]")) {
      button.classList.toggle("is-active", button.textContent?.trim() === this.stats.mapName);
    }
  }

  private setText(selector: string, text: string): void {
    const element = this.root.querySelector(selector);
    if (element) element.textContent = text;
  }
}
