import type { MapPreset, SimulationStats, ToolDefinition, ToolKind } from "../simulation/types";

interface HudOptions {
  tools: ToolDefinition[];
  maps: MapPreset[];
  onToolSelect: (tool: ToolKind) => void;
  onMapSelect: (mapId: string) => void;
  onReset: () => void;
  onTimeScaleToggle: () => void;
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
        <div class="telemetry-grid">
          <span>運んだカケラ <strong data-pieces>0</strong></span>
          <span>アリ <strong data-ants>0</strong></span>
          <span>大物 <strong data-cargo>0</strong></span>
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
      <button class="speed-button" type="button" data-speed aria-pressed="false">10倍速</button>
      <button class="reset-button" type="button" data-reset>リセット</button>
      <button class="research-button" type="button" data-open-research>生態ノート</button>
      <section class="research-page is-hidden" aria-label="アリの生態ノート" data-research-page>
        <div class="research-panel">
          <button class="research-close" type="button" aria-label="生態ノートを閉じる" data-close-research>×</button>
          <p class="research-kicker">Ant Notes</p>
          <h1>アリの行列は、匂いと記憶でできている</h1>
          <div class="research-grid">
            <article>
              <h2>1. アリは社会性昆虫</h2>
              <p>コロニーは個体の集まりではなく、女王や働きアリなどの分業で動く共同体です。このゲームでは、その中の「食べ物を探して運ぶ働きアリ」に注目しています。</p>
            </article>
            <article>
              <h2>2. 行列の正体はフェロモン</h2>
              <p>多くのアリは、食べ物へ向かう道に化学的な匂いの印を残します。後続のアリはその印をたどり、成功した道ほどさらに強くなります。</p>
            </article>
            <article>
              <h2>3. でも、ただのロボットではない</h2>
              <p>研究では、アリがフェロモンだけでなく経路の記憶も使うことが示されています。単純な道では記憶を優先し、複雑な分岐ではフェロモンが助けになります。</p>
            </article>
            <article>
              <h2>4. このゲームの簡略モデル</h2>
              <p>アリは前方左右のフェロモン濃度差を比べて少し曲がり、そこにランダム探索と地形回避を混ぜています。水ポンプや謎は、実験で観察される「道しるべの乱れ」を遊び向けに誇張した表現です。</p>
            </article>
          </div>
          <div class="source-list">
            <span>出典</span>
            <a href="https://www.britannica.com/animal/ant" target="_blank" rel="noreferrer">Britannica: Ant</a>
            <a href="https://www.britannica.com/science/pheromone" target="_blank" rel="noreferrer">Britannica: Pheromone</a>
            <a href="https://arxiv.org/abs/1201.5827" target="_blank" rel="noreferrer">Perna et al. 2012</a>
            <a href="https://pubmed.ncbi.nlm.nih.gov/22972897/" target="_blank" rel="noreferrer">Czaczkes et al. 2013</a>
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
    this.root.querySelector<HTMLButtonElement>("[data-open-research]")?.addEventListener("click", () => this.setResearchOpen(true));
    this.root.querySelector<HTMLButtonElement>("[data-close-research]")?.addEventListener("click", () => this.setResearchOpen(false));
    this.root.querySelector<HTMLElement>("[data-research-page]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.setResearchOpen(false);
    });
  }

  private setResearchOpen(open: boolean): void {
    this.root.querySelector<HTMLElement>("[data-research-page]")?.classList.toggle("is-hidden", !open);
  }

  private renderStats(): void {
    if (!this.stats) return;
    this.setText("[data-pieces]", this.stats.deliveredPieces.toString());
    this.setText("[data-ants]", this.stats.activeAnts.toString());
    this.setText("[data-cargo]", this.stats.activeCargo.toString());
    this.setText("[data-pattern]", this.stats.patternName);
    this.setText("[data-integrity]", `${this.stats.trailIntegrity}%`);
    const meter = this.root.querySelector<HTMLSpanElement>("[data-meter]");
    if (meter) meter.style.width = `${this.stats.trailIntegrity}%`;
    const speedButton = this.root.querySelector<HTMLButtonElement>("[data-speed]");
    if (speedButton) {
      const active = this.stats.timeScale === 10;
      speedButton.classList.toggle("is-active", active);
      speedButton.setAttribute("aria-pressed", active ? "true" : "false");
      speedButton.textContent = active ? "1倍速" : "10倍速";
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
