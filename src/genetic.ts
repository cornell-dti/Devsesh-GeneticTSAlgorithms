import { isNullOrUndefined } from "util";
import assert from "assert";

export class GeneticTS<T> {
  generationNum = 0;
  running: boolean = true;
  lastGeneration: [T, number][] = [];
  generation: T[] = [];
  fitness: [T, number][] = [];
  mutateBreedDistribution: {
    type: MutateOrBreed,
    start: number,
    end: number
    mutation?: (ind: T, lastFit: number) => T | Promise<T>,
    breed?: (ind1Fit: [T, number], ind2Fit: [T, number]) => T | Promise<T>
  }[] = [];

  constructor(public config: GeneticConfig<T>) { }

  async start() {
    this.doChecks();
    await this.init();
    await this.step();
  }

  doChecks() {
    assert(!isNullOrUndefined(this.config));
    assert(this.config.generationSize > 0);
    assert(this.config.mutateBreedSettings.autoMutateAndBreed ||
      this.config.mutateBreedSettings.customBreed ||
      this.config.mutateBreedSettings.customMutate);
    if (this.config.mutateBreedSettings.autoMutateAndBreed) {
      assert(
        (this.config.mutateBreedSettings.mutations.reduce(
          (prev, curr, ind, arr) => { return prev + curr.probability }, 0)
          +
          this.config.mutateBreedSettings.breeds.reduce(
            (prev, curr, ind, arr) => { return prev + curr.probability }, 0))
        == 1
      );
    }
    if (this.config.mutateBreedSettings.doCustomBreed) {
      assert(!isNullOrUndefined(this.config.mutateBreedSettings.customBreed));
    }
    if (this.config.mutateBreedSettings.doCustomMutate) {
      assert(!isNullOrUndefined(this.config.mutateBreedSettings.customMutate));
    }
    if (this.config.sortGeneration.sortBy == SortGenerationBy.Custom) {
      assert(!isNullOrUndefined(this.config.sortGeneration.customSort));
    }
  }

  pause() {
    this.running = false;
  }

  resume() {
    this.running = true;
    this.step();
  }

  async init() {
    this.createDistribution();
    for (let i = 0; i < this.config.generationSize; i++) {
      this.generation.push(await this.config.generate());
    }
    await this.evaluateFitness();
  }

  getGenerationInfo(): GenerationFitnessInfo<T> {
    return {
      generationNum: this.generationNum,
      generation: this.generation,
      fitness: this.fitness
    };
  }

  generateRandom() {
    return Math.random();
  }

  async step() {
    this.config.callbacks.beforeNextGeneration ?
      this.config.callbacks.beforeNextGeneration(this.getGenerationInfo()) : '';
    // Generate new generation
    await this.nextGeneration();
    this.config.callbacks.afterNextGeneration ?
      this.config.callbacks.afterNextGeneration(this.getGenerationInfo()) : '';
    this.config.callbacks.beforeGenerationFitnessEvaluated ?
      this.config.callbacks.beforeGenerationFitnessEvaluated(this.getGenerationInfo()) : '';
    // Evaluate the fitness
    await this.evaluateFitness();
    this.config.callbacks.afterGenerationFitnessEvaluated ?
      this.config.callbacks.afterGenerationFitnessEvaluated(this.getGenerationInfo()) : '';
    if (this.running) {
      await this.step();
    }
  }

  async evaluateFitness() {
    this.fitness = [];
    for (let individual of this.generation) {
      this.config.callbacks.beforeFitnessEvaluated ?
        this.config.callbacks.beforeFitnessEvaluated(individual) : '';
      let fitnessVal = await this.config.fitness(individual);
      this.fitness.push([individual, fitnessVal]);
      this.config.callbacks.afterFitnessEvaluated ?
        this.config.callbacks.afterFitnessEvaluated(individual, fitnessVal) : '';
    }
    await this.sortFitness();
  }

  async sortFitness() {
    if (this.config.sortGeneration.sortBy == SortGenerationBy.FitnessHighFirst) {
      this.fitness = this.fitness.sort((a, b) => b[1] - a[1]);
    } else if (this.config.sortGeneration.sortBy == SortGenerationBy.FitnessLowFirst) {
      this.fitness = this.fitness.sort((a, b) => a[1] - b[1]);
    } else if (this.config.sortGeneration.sortBy == SortGenerationBy.Custom) {
      this.fitness = this.fitness.sort(this.config.sortGeneration.customSort);
    }
  }

  async nextGeneration() {
    this.lastGeneration = this.fitness;
    this.generation = [];
    if (this.config.mutateBreedSettings.autoKillWorst) {
      let killUpTo = Math.floor(
        this.lastGeneration.length * this.config.mutateBreedSettings.autoKillWorst
      );
      let sortedLowToHigh = this.fitness.sort((a, b) => a[1] - b[1]);
      sortedLowToHigh = sortedLowToHigh.map((val, ind) => {
        if (ind < killUpTo) {
          return sortedLowToHigh[sortedLowToHigh.length - 1 - ind];
        } else {
          return val;
        }
      });
      this.fitness = sortedLowToHigh;
      await this.sortFitness();
      this.lastGeneration = this.fitness;
    }
    if (this.config.mutateBreedSettings.autoMutateAndBreed) {
      for (let i = 0; i < this.lastGeneration.length; i++) {
        let indiv = this.lastGeneration[i];
        let nextIndiv = this.lastGeneration[(i + 1) % this.lastGeneration.length];
        let pickDist = this.generateRandom();
        let mutDist = this.mutateBreedDistribution.find(
          val => val.start <= pickDist && val.end > pickDist);
        if (mutDist.type == MutateOrBreed.Mutation) {
          this.generation.push(await mutDist.mutation(indiv[0], indiv[1]));
        } else if (mutDist.type == MutateOrBreed.Breed) {
          this.generation.push(await mutDist.breed(indiv, nextIndiv));
        }
      }
    }
    else if (this.config.mutateBreedSettings.doCustomBreed) {
      let prevLength = this.generation.length;
      this.generation = await this.config.mutateBreedSettings.customBreed(this.fitness);
      assert(prevLength == this.generation.length);
    } else if (this.config.mutateBreedSettings.doCustomMutate) {
      let prevLength = this.generation.length;
      this.generation = await this.config.mutateBreedSettings.customMutate(this.fitness);
      assert(prevLength == this.generation.length);
    }
    this.generationNum++;
  }

  createDistribution() {
    if (this.config.mutateBreedSettings.autoMutateAndBreed) {
      let currStartProb = 0;
      for (let mut of this.config.mutateBreedSettings.mutations) {
        this.mutateBreedDistribution.push({
          type: MutateOrBreed.Mutation,
          mutation: mut.mutate,
          start: currStartProb,
          end: currStartProb + mut.probability
        });
        currStartProb += mut.probability;
      }
      for (let breed of this.config.mutateBreedSettings.breeds) {
        this.mutateBreedDistribution.push({
          type: MutateOrBreed.Breed,
          breed: breed.breed,
          start: currStartProb,
          end: currStartProb + breed.probability
        });
        currStartProb += breed.probability;
      }
    }
  }

}

export type GeneticConfig<T> = {
  generationSize: number;
  totalGenerations?: number;
  sortGeneration: Sort<T>;
  generate: Generator<T>;
  fitness: (individual: T) => number | Promise<number>;
  callbacks: Callbacks<T>;
  mutateBreedSettings: MutateBreedSettings<T>;
}

export enum MutateOrBreed {
  Mutation = 0,
  Breed = 1
}

export enum SortGenerationBy {
  FitnessHighFirst = 0,
  FitnessLowFirst = 1,
  Custom = 2
}

export type Sort<T> = {
  sortBy: SortGenerationBy,
  customSort?: (indivOneAndFitness: [T, number], indivTwoAndFitness: [T, number]) => number
}

export type Callbacks<T> = {
  beforeNextGeneration?: (generationInfo: GenerationFitnessInfo<T>) => any;
  onCustomBreed?: (generationInfo: GenerationInfo<T>) => any;
  afterNextGeneration?: (generationInfo: GenerationInfo<T>) => any;
  beforeGenerationFitnessEvaluated?: (generationInfo: GenerationInfo<T>) => any;
  afterGenerationFitnessEvaluated?: (generationInfo: GenerationFitnessInfo<T>) => any;
  beforeFitnessEvaluated?: (individual: T) => any;
  afterFitnessEvaluated?: (individual: T, fitness: number) => any;
}

export type CustomMutate<T> = (indivsAndFitness: [T, number][]) => T[] | Promise<T[]>

export type Mutation<T> = {
  probability: number,
  mutate: (individual: T, lastFitness: number) => T | Promise<T>
}

export type CustomBreed<T> = (indivsAndFitness: [T, number][]) => T[] | Promise<T[]>

export type Breed<T> = {
  probability: number,
  breed: (individualOneFit: [T, number], individualTwoFit: [T, number]) => T | Promise<T>
}

export type MutateBreedSettings<T> = {
  autoMutateAndBreed: boolean;
  autoKillWorst?: number,
  doCustomMutate: boolean;
  doCustomBreed: boolean;
  mutations?: Mutation<T>[];
  breeds?: Breed<T>[];
  customBreed?: CustomBreed<T>;
  customMutate?: CustomMutate<T>;
}

export type Generator<T> = () => T | Promise<T>

export type GenerationFitnessInfo<T> = {
  generation: T[],
  fitness: [T, number][];
  generationNum: number;
}

export type GenerationInfo<T> = {
  generation: T[],
  generationNum: number;
}