import type { MapPreset, SimulationStats, ToolDefinition, ToolKind } from "../simulation/types";

interface HudOptions {
  tools: ToolDefinition[];
  maps: MapPreset[];
  onToolSelect: (tool: ToolKind) => void;
  onToolCycle: () => void;
  onMapSelect: (mapId: string) => void;
  onReset: () => void;
  onTimeScaleToggle: () => void;
}

export class HudController {
  private readonly root: HTMLDivElement;
  private options?: HudOptions;
  private stats?: SimulationStats;
  private researchTrigger?: HTMLButtonElement;

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
          <span class="meter"><span class="meter-fill" data-meter><span class="meter-glint"></span></span></span>
          <strong data-integrity>0%</strong>
        </div>
        <div class="telemetry-grid">
          <span>運んだカケラ <strong data-pieces>0</strong></span>
          <span>大物運搬 <strong data-cargo>0</strong></span>
        </div>
        <div class="detail-grid">
          <span>活動中 <strong data-ants>0</strong></span>
          <span>総アリ <strong data-total-ants>0</strong></span>
          <span>初期 <strong data-pattern>---</strong></span>
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
      <div class="tool-switcher">
        <button class="tool-current" type="button" data-tool-cycle aria-label="おじゃまアイテムを切り替える">
          <span class="tool-icon" data-current-tool-icon>●</span>
          <span data-current-tool-label>小石</span>
        </button>
        <div class="hud tool-dock" role="toolbar" aria-label="おじゃまアイテム">
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
      </div>
      <button class="speed-button" type="button" data-speed aria-label="速度を切り替える">1倍速</button>
      <div class="speed-presets" aria-hidden="true">
        <span data-speed-preset="1">1x</span>
        <span data-speed-preset="3">3x</span>
        <span data-speed-preset="5">5x</span>
        <span data-speed-preset="10">10x</span>
        <span data-speed-preset="20">20x</span>
      </div>
      <button class="reset-button" type="button" data-reset>リセット</button>
      <button class="research-button" type="button" data-open-research>生態ノート</button>
      <section class="research-page is-hidden" aria-hidden="true" data-research-page>
        <div class="research-panel" role="dialog" aria-modal="true" aria-labelledby="research-title">
          <button class="research-close" type="button" aria-label="生態ノートを閉じる" data-close-research>×</button>
          <p class="research-kicker">Ant Notes</p>
          <h1 id="research-title">行列をつくる手がかり</h1>
          <div class="research-grid">
            <article>
              <h2>1. アリは社会性昆虫</h2>
              <p>アリは社会性昆虫で、コロニー内には繁殖や採餌などの役割があります。このゲームでは、食べ物を探して運ぶ働きアリに注目しています。</p>
            </article>
            <article>
              <h2>2. 種によって違う道しるべ</h2>
              <p>一部の種はフェロモンの道しるべを使います。アルゼンチンアリでは、個体が前方左右の局所的な濃度差に応じて曲がることが報告されています。</p>
            </article>
            <article>
              <h2>3. 記憶と混雑</h2>
              <p><i>Lasius niger</i> では経路記憶や沈着調整が研究されています。混雑した道でフェロモン沈着が減るという報告もあります。</p>
            </article>
            <article>
              <h2>4. このゲームの混合簡略モデル</h2>
              <p>異なる種の研究から局所追従、弱い経路記憶、混雑時の沈着調整を組み合わせています。水ポンプや謎は、道しるべへの外乱を遊び向けに誇張した表現です。</p>
            </article>
          </div>
          <div class="source-list">
            <span>出典</span>
            <a href="https://arxiv.org/abs/1201.5827" target="_blank" rel="noreferrer">Perna et al. 2012</a>
            <a href="https://pubmed.ncbi.nlm.nih.gov/23365196/" target="_blank" rel="noreferrer">Czaczkes et al. 2013: crowding</a>
            <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0149720" target="_blank" rel="noreferrer">Czaczkes et al. 2016: learning</a>
            <a href="https://pubs.usgs.gov/publication/70033166" target="_blank" rel="noreferrer">Suckling et al. 2008</a>
          </div>
        </div>
      </section>
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
    this.root.querySelector<HTMLButtonElement>("[data-speed]")?.addEventListener("click", () => this.options?.onTimeScaleToggle());
    this.root.querySelector<HTMLButtonElement>("[data-tool-cycle]")?.addEventListener("click", () => this.options?.onToolCycle());
    this.root.querySelector<HTMLButtonElement>("[data-open-research]")?.addEventListener("click", () => this.setResearchOpen(true));
    this.root.querySelector<HTMLButtonElement>("[data-close-research]")?.addEventListener("click", () => this.setResearchOpen(false));
    this.root.querySelector<HTMLElement>("[data-research-page]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.setResearchOpen(false);
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.setResearchOpen(false);
    });
  }

  private setResearchOpen(open: boolean): void {
    const page = this.root.querySelector<HTMLElement>("[data-research-page]");
    if (!page || page.classList.contains("is-hidden") === !open) return;
    page.classList.toggle("is-hidden", !open);
    page.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      this.researchTrigger = document.activeElement instanceof HTMLButtonElement ? document.activeElement : undefined;
      this.root.querySelector<HTMLButtonElement>("[data-close-research]")?.focus();
    } else {
      this.researchTrigger?.focus();
      this.researchTrigger = undefined;
    }
  }

  private renderStats(): void {
    if (!this.stats) return;
    this.setText("[data-pieces]", this.stats.deliveredPieces.toString());
    this.setText("[data-ants]", this.stats.activeAnts.toString());
    this.setText("[data-total-ants]", this.stats.totalAnts.toString());
    this.setText("[data-cargo]", this.stats.activeCargo.toString());
    this.setText("[data-pattern]", this.stats.patternName);
    this.setText("[data-integrity]", `${this.stats.trailIntegrity}%`);
    const meter = this.root.querySelector<HTMLSpanElement>("[data-meter]");
    if (meter) {
      meter.style.width = `${this.stats.trailIntegrity}%`;
      meter.style.setProperty("--speed-multiplier", this.stats.timeScale.toString());
      meter.style.setProperty("--speed-glint-duration", `${Math.max(0.14, 2.2 / this.stats.timeScale)}s`);
      meter.style.setProperty("--speed-effect-alpha", this.stats.timeScale >= 10 ? "0.65" : "1");
      meter.classList.toggle("is-boosted", this.stats.timeScale > 1);
    }
    const speedButton = this.root.querySelector<HTMLButtonElement>("[data-speed]");
    if (speedButton) {
      const active = this.stats.timeScale > 1;
      speedButton.classList.toggle("is-active", active);
      speedButton.setAttribute("aria-pressed", active ? "true" : "false");
      speedButton.textContent = `${this.stats.timeScale}倍速`;
    }
    const currentTool = this.options?.tools.find((tool) => tool.kind === this.stats?.selectedTool);
    if (currentTool) {
      this.setText("[data-current-tool-icon]", currentTool.icon);
      this.setText("[data-current-tool-label]", currentTool.label);
    }
    for (const preset of this.root.querySelectorAll<HTMLElement>("[data-speed-preset]")) {
      preset.classList.toggle("is-active", preset.dataset.speedPreset === this.stats.timeScale.toString());
    }
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
