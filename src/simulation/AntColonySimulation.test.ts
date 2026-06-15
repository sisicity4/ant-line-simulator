import { describe, expect, it } from "vitest";
import { AntColonySimulation } from "./AntColonySimulation";

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
    for (let i = 0; i < 360; i += 1) {
      simulation.step(50);
    }

    const debug = simulation.getDebugSnapshot();
    expect(debug.invalidAnts).toBe(0);
    expect(debug.activeAnts).toBeLessThanOrEqual(95);
    expect(debug.objects).toBeGreaterThan(0);
    expect(debug.deliveredPieces).toBeGreaterThan(0);
  });
});
