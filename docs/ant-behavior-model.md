# アリ行動モデル再調査メモ

最終確認日: 2026-05-06

このゲームは厳密な生物シミュレーターではなく、アリの採餌行動から遊びに向いた要素を抽出した観察ゲームです。実装では「本能通り」と言い切らず、根拠の強い行動ルールとゲーム都合の誇張を分けて扱います。

## 結論

現行モデルの中心である「フェロモン濃度差に応じて曲がる」「ランダム探索とフェロモン追従が混ざる」「蒸発・拡散で行列が太くなったり薄くなったりする」「過剰な匂いで行列が乱れる」は、文献と整合しています。

ただし、現在の実装は特定種の完全再現ではありません。特に水ポンプ、指跡、小石、葉っぱ、謎、大物運搬、10個の開始パターンは、観察ゲームとしての干渉表現です。これらは「アリがこう感じる」と説明せず、「フェロモン場・通行可能性・個体の向きに外乱を入れるゲーム表現」として扱います。

## 根拠と実装対応

| 実装要素 | 根拠 | 現在の扱い | 判定 |
| --- | --- | --- | --- |
| 左右のフェロモン濃度差で旋回 | Perna et al. はアルゼンチンアリで、前方局所のフェロモン量と左右差に応じた Weber 型の旋回応答を報告。 | `weberTurn = (right - left) / (right + left + 0.08)` | 維持 |
| ランダム探索 + フェロモン追従 | Malíčková et al. は、ランダムな方向変化とフェロモン信号の非直接的相互作用で採餌経路が形成されるモデルを示す。 | `noise` と `desiredField` 追従を混合 | 維持 |
| フェロモンの蒸発・拡散 | 多くの採餌モデルで、残留・拡散・減衰する場として扱う。Malíčková et al. も拡散特性が同期や経路形成に影響するとする。 | `PheromoneGrid.step()` | 維持 |
| 経路記憶とフェロモンの併用 | Czaczkes et al. 2016 は、フェロモンが経路学習を支える情報になり得ることを示す。Czaczkes et al. 2013 系の研究でも、単純経路では記憶が強く、複雑経路ではフェロモンが助けになる。 | `memoryHeading` とルート目標を弱く加算 | 維持。ただし「記憶」は簡略化 |
| 過剰フェロモンによる行列崩壊 | Suckling et al. は、アルゼンチンアリで trail pheromone の過剰提示が trail integrity と bait location success を下げたと報告。 | `disruption` フィールド、水滴・指跡・謎 | 維持 |
| 混雑時の自己調整 | Czaczkes et al. 2013 は、混雑が pheromone deposition を下げる負のフィードバックになり得ると報告。 | 未実装 | 次候補 |
| 方向別フェロモン | 現在は home/food の2場で往復を表現しているが、これはモデル都合。実際の種差は大きい。 | `home` と `food` の2グリッド | 維持。ただし説明は控えめに |
| 大物運搬 | アリが大きい餌片を運ぶこと自体は自然だが、現在のボーナス的出現間隔・見た目は演出。 | `cargoSize`, `cargoPieces` | ゲーム表現 |
| 小石・葉っぱ・水ポンプ | 物理障害や濡れた地面で経路が変わることはあり得るが、実験モデルそのものではない。 | `objects`, `washAnts`, `avoidObjects` | ゲーム表現 |

## 現行実装の注意点

- `AntColonySimulation.stepAnt()` は個体の「意思」を作っているわけではなく、局所情報に対する反応を合成している。
- `memoryHeading` は本物の視覚ランドマーク記憶や path integration ではなく、ゲーム内ルートへの弱い慣性。
- `trailIntegrity` は研究用の測定値ではなく、ゲーム内で行列のまとまりを見るための簡易メトリクス。
- `timeScale` は物理パラメータを変えず、細かいステップに分けて同じ規則を早送りする。
- プレイヤー干渉は「アリを倒す」方向ではなく、フェロモン場・向き・通行可能性への外乱として扱う。置いたものは自動消滅せず、プレイヤーが取り除くまで環境の一部として残る。

## 次に本能らしさを上げるなら

1. 混雑時のフェロモン沈着量を下げる。
   - 根拠: Czaczkes et al. 2013, crowding negative feedback.
   - 実装案: 近傍アリ数が多いと `addFood` / `addHome` の deposit を 0.4-1.0 倍にする。

2. 餌から巣へ戻る個体だけが強く food trail を足す。
   - 現在も往復で場を分けているが、餌獲得成功・大物運搬時に沈着量を強めると採餌らしさが上がる。

3. 探索個体と追従個体のばらつきを個体差にする。
   - 根拠はモデル一般には妥当だが、種特異的主張は避ける。
   - 実装案: `Ant` に `pheromoneSensitivity` と `explorationNoise` を持たせる。

4. 研究メモ UI では断定を避ける。
   - 「アリは必ずこうする」ではなく、「このゲームではこの研究をもとにこう抽象化している」と書く。

## 参照資料

- Andrea Perna et al. "Individual rules for trail pattern formation in Argentine ants (Linepithema humile)." arXiv:1201.5827 / PLoS Computational Biology, 2012. https://arxiv.org/abs/1201.5827
- Miriam Malíčková, Christian Yates, Katarína Boďová. "A stochastic model of ant trail following with two pheromones." arXiv:1508.06816, 2015. https://arxiv.org/abs/1508.06816
- Tomer J. Czaczkes et al. "The Effect of Trail Pheromone and Path Confinement on Learning of Complex Routes in the Ant Lasius niger." PLOS ONE, 2016. https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0149720
- D.M. Suckling et al. "Pheromone disruption of Argentine ant trail integrity." Journal of Chemical Ecology, 2008. https://pubs.usgs.gov/publication/70033166
- Tomer J. Czaczkes, Christoph Grüter, Francis L.W. Ratnieks. "Negative feedback in ants: crowding results in less trail pheromone deposition." Journal of the Royal Society Interface, 2013. https://pmc.ncbi.nlm.nih.gov/articles/PMC3627113/
