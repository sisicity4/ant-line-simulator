import { describe, expect, it } from "vitest";
import { AntColonySimulation, TOOL_DEFINITIONS } from "./AntColonySimulation";

describe("AntColonySimulation", () => {
  it("resets the total ant count with the colony", () => {
    const simulation = new AntColonySimulation();

    simulation.reset();

    expect(simulation.getStats().activeAnts).toBe(52);
    expect(simulation.getStats().totalAnts).toBe(52);
  });

  it("keeps each ant on its selected branch until the current trip ends", () => {
    const simulation = new AntColonySimulation();
    const ant = simulation.ants[0];
    const initialBranch = ant.routeBranchIndex;

    simulation.deliveredPieces = 10_000;
    simulation.step(2_000);

    expect(ant.routeBranchIndex).toBe(initialBranch);
  });

  it("stays finite while running at 20x with persistent obstacles", () => {
    const simulation = new AntColonySimulation();
    simulation.setTimeScale(20);
    const route = simulation.getDisplayRoutes()[0];

    for (const point of route.slice(2, 5)) {
      simulation.toggleToolAt(point.x, point.y, "pebble", false);
    }
    for (let i = 0; i < 180; i += 1) {
      simulation.step(50);
    }

    const debug = simulation.getDebugSnapshot();
    expect(debug.invalidAnts).toBe(0);
    expect(debug.activeAnts).toBeLessThanOrEqual(95);
    expect(debug.objects).toBeGreaterThan(0);
    expect(debug.deliveredPieces).toBeGreaterThan(0);
  });

  it("reduces pheromone deposition in crowded local traffic", () => {
    const sparse = new AntColonySimulation();
    const crowded = new AntColonySimulation();
    const sparseAnt = sparse.ants[0];
    const crowdedAnt = crowded.ants[0];

    sparse.ants.splice(1);
    for (const ant of crowded.ants) {
      ant.x = crowdedAnt.x;
      ant.y = crowdedAnt.y;
    }
    (sparse as unknown as { refreshCrowdingMultipliers: () => void }).refreshCrowdingMultipliers();
    (crowded as unknown as { refreshCrowdingMultipliers: () => void }).refreshCrowdingMultipliers();

    const sparseMultiplier = (sparse as unknown as { crowdingDepositMultiplier: (ant: typeof sparseAnt) => number }).crowdingDepositMultiplier(sparseAnt);
    const crowdedMultiplier = (crowded as unknown as { crowdingDepositMultiplier: (ant: typeof crowdedAnt) => number }).crowdingDepositMultiplier(crowdedAnt);

    expect(sparseMultiplier).toBe(1);
    expect(crowdedMultiplier).toBeLessThanOrEqual(0.22);
  });

  it("does not change preferred walking speed based on pheromone strength", () => {
    const simulation = new AntColonySimulation();
    const ant = simulation.ants[0];
    ant.preferredSpeed = 44;
    ant.speed = 44;
    simulation.pheromones.addFood(ant.x, ant.y, 2.5);
    simulation.pheromones.addHome(ant.x, ant.y, 2.5);

    simulation.step(50);

    expect(ant.speed).toBeLessThan(60);
  });

  it.each(["garden-fork", "scramble", "mountain-river"])("remains healthy during a long 20x run on %s", (mapId) => {
    const simulation = new AntColonySimulation();
    simulation.setMap(mapId);
    simulation.setTimeScale(20);
    const route = simulation.getDisplayRoutes()[0];

    for (const [index, tool] of TOOL_DEFINITIONS.entries()) {
      const point = route[Math.min(index + 1, route.length - 2)];
      simulation.toggleToolAt(point.x + index * 13, point.y + index * 7, tool.kind, false);
    }
    for (let i = 0; i < 240; i += 1) {
      simulation.step(50);
    }

    const debug = simulation.getDebugSnapshot();
    expect(debug.invalidAnts).toBe(0);
    expect(debug.activeAnts).toBe(95);
    expect(debug.deliveredPieces).toBeGreaterThan(0);
    expect(debug.trailIntegrity).toBeGreaterThan(25);
  });

  it("keeps the chosen speed and placed objects until an explicit reset or removal", () => {
    const simulation = new AntColonySimulation();
    simulation.setTimeScale(20);
    let result: "placed" | "removed" | "blocked" = "blocked";

    for (let y = 80; y < simulation.height - 80 && result !== "placed"; y += 80) {
      for (let x = 80; x < simulation.width - 80 && result !== "placed"; x += 80) {
        result = simulation.toggleToolAt(x, y, "pebble", false);
      }
    }

    simulation.step(10_000);

    expect(result).toBe("placed");
    expect(simulation.timeScale).toBe(20);
    expect(simulation.objects).toHaveLength(1);
    expect(simulation.toggleToolAt(simulation.objects[0].x, simulation.objects[0].y)).toBe("removed");
    expect(simulation.objects).toHaveLength(0);
  });
});
