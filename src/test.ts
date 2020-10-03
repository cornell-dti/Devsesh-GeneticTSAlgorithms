import * as Gen from "./genetic";
import Matter, { Engine } from "matter-js";
import { start } from "repl";

// Constants
let ProjectileID = 999;
let TargetID = 1000;

// The data structure which we are evolving
type AimInputs = {
  x: number,
  y: number
}

// The Matter Simulation that's rendered on the HTML canvas.
class TargetPractice {

  // Utility function to compute distance 
  distance(x1: number, y1: number, x2: number, y2: number): number {
    let maxX = x1 > x2 ? x1 : x2;
    let minX = x1 <= x2 ? x1 : x2;
    let maxY = y1 > y2 ? y1 : y2;
    let minY = y1 <= y2 ? y1 : y2;
    return Math.sqrt((Math.pow((maxX - minX), 2) + Math.pow((maxY - minY), 2)));
  }

  // Create the physics simulation components
  engine = Matter.Engine.create({
    timing: {
      timeScale: 1.7,
      timestamp: 0
    }
  });
  runner = Matter.Runner.create();
  world = this.engine.world;
  render = Matter.Render.create({
    element: document.getElementById('sim-canvas'),
    engine: this.engine,
    options: {
      width: 800,
      height: 600,
      wireframes: false,
    }
  });
  target = Matter.Bodies.rectangle(600, 570, 100, 20, {
    id: TargetID,
    isStatic: true,
    render: {
      fillStyle: 'blue',
      strokeStyle: 'white',
      lineWidth: 3
    }
  });
  projectileRad = 2;

  // Initialize the simulation
  initSim() {
    Matter.World.add(this.world, [
      // walls
      Matter.Bodies.rectangle(400, -50, 800, 150, { isStatic: true }),
      Matter.Bodies.rectangle(400, 650, 800, 150, { isStatic: true }),
      Matter.Bodies.rectangle(850, 300, 150, 600, { isStatic: true }),
      Matter.Bodies.rectangle(-50, 300, 150, 600, { isStatic: true })
    ]);
    Matter.World.addBody(this.world,
      // Target pad
      this.target);
    let ind = Matter.Bodies.circle(600, 570, this.projectileRad, {
      id: 9239234,
      isStatic: true,
      render: {
        fillStyle: 'red',
        strokeStyle: 'white',
        lineWidth: 3
      }
    });
    Matter.World.addBody(this.world, ind);
    Matter.Runner.run(this.runner, this.engine);
    Matter.Render.run(this.render);
  }

  // Run the simulation for an individual
  runSim(ai: AimInputs): Promise<number> {
    let projectile = Matter.Bodies.circle(40, 500, 10, {
      id: ProjectileID,
      isStatic: false,
      render: {
        fillStyle: 'red',
        strokeStyle: 'white',
        lineWidth: 3
      }
    });
    Matter.World.addBody(this.world,
      // projectile
      projectile);

    // Set up projectile to be have its velocity set after the next Engine update
    let projectileShot = false;
    let beforeUpdateCB = (event) => {
      // executed after the next Engine update
      if (!projectileShot) {
        Matter.Body.setVelocity(projectile, { x: ai.x, y: ai.y });
        projectileShot = true;
      }
    };
    Matter.Events.on(this.engine, "afterUpdate", beforeUpdateCB);
    let resProm: (value?: unknown) => void;
    let retProm = new Promise<number>((res, rej) => {
      resProm = res;
    });

    // Do collision detection and cleanup (unregister events, remove bodies)
    let collStartCB = (event: Matter.IEventCollision<Matter.Engine>) => {
      let pair = event.pairs[0];
      if (pair.bodyA.id == ProjectileID || pair.bodyB.id == ProjectileID) {
        let proj: Matter.Body;
        let other: Matter.Body;
        if (pair.bodyA.id == ProjectileID) {
          proj = pair.bodyA;
          other = pair.bodyB;
        } else {
          proj = pair.bodyB;
          other = pair.bodyA;
        }
        let distance = this.distance(proj.position.x, proj.position.y,
          this.target.position.x, this.target.position.y);
        if (other.id == 4 || other.id == 2) {
          distance = 99999;
        }
        Matter.Events.off(this.engine, "afterUpdate", beforeUpdateCB);
        Matter.Events.off(this.engine, "collisionStart", collStartCB);
        Matter.World.remove(this.world, projectile);
        resProm(distance);
      }
    };
    Matter.Events.on(this.engine, "collisionStart", collStartCB);

    return retProm;
  }

  // An approximate max fitness for the individual
  maxFit = 1000;

  // Approximate max distance for individual (not accounting for collision inaccuracy)
  maxDist = this.maxFit + this.projectileRad + ((this.target.bounds.max.y - this.target.bounds.min.y) / 2);

  // The config for the genetic library
  config: Gen.GeneticConfig<AimInputs> = {
    generationSize: 5,
    sortGeneration: {
      sortBy: Gen.SortGenerationBy.FitnessHighFirst
    },
    generate: () => { return { x: 2, y: -15 }; },
    mutateBreedSettings: {
      autoMutateAndBreed: true,
      doCustomMutate: false,
      doCustomBreed: false,
      autoKillWorst: 0.75,
      mutations: [{
        probability: 1, mutate:
          (input: AimInputs, lastFitness: number) => {
            if (lastFitness >= this.maxDist - (this.projectileRad * 2)) {
              return input;
            }
            let select = Math.random();
            let select2 = Math.random();
            let mod = Math.random();
            let strength = 250 * (Math.pow((this.maxDist - lastFitness), 3)) / Math.pow((this.maxDist), 3);
            strength = Math.max(0.7, strength);
            if (select < 0.5) {
              if (select2 < 0.5) {
                return { x: Math.max(0, input.x + (mod * strength)), y: input.y };
              } else {
                return { x: Math.max(0, input.x - (mod * strength)), y: input.y };
              }
            } else {
              if (select2 < 0.5) {
                return { x: input.x, y: Math.min(0, input.y + (mod * strength)) };
              } else {
                return { x: input.x, y: Math.min(0, input.y - (mod * strength)) };
              }
            }
          }
      }],
      breeds: []
    },
    fitness: async (indiv) => {
      let distAway = (await this.runSim(indiv));
      return this.maxDist - distAway;
    },
    callbacks: {
      afterNextGeneration: async (gen) => {
        generationDisp.innerHTML = "Generation " + gen.generationNum;
      },
      afterGenerationFitnessEvaluated: async (gen) => {
        genOutput.innerHTML = (gen.generationNum == 1 ? '' : (genOutput.innerHTML + '\n\n')) + 'Generation ' + gen.generationNum + '\n' + JSON.stringify(gen.fitness);
      }
    }
  }

  // The actual Genetic Learner instance
  // note: It has strong generic typing thanks to TS!
  gener = new Gen.GeneticTS<AimInputs>(this.config);

  // The initial startup
  async start() {
    this.initSim();
    this.gener.start();
  }

}

// Create the target practice instance (the sim and genetic learner)
let test = new TargetPractice();

// Handle UI Logic
let started = false;
let startButton = document.getElementById("start-sim-button");
let genOutput = document.getElementById("generation-output");
startButton.addEventListener("click", () => {
  if (startButton.innerHTML == "Pause Sim") {
    test.gener.pause();
    startButton.innerHTML = "Resume Sim";
  } else {
    if (!started) {
      // Start the target practice if not started yet
      test.start();
      started = true;
    } else {
      // Else resume
      test.gener.resume();
    }
    startButton.innerHTML = "Pause Sim";
  }
});
let generationDisp = document.getElementById("generation");