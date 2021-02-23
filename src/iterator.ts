import { ArticyObjectProps, Id } from './json';
import { Database } from './database';
import { BaseFlowNode } from './flowTypes';
import { ArticyObjectCreator } from './object';
import { OnNodeExecution } from './script';
import { ArticyObject } from './types';
import { VariableStore } from './variables';

/**
 * Keeps track of the number of times a node has been visited
 */
export interface VisitCounts {
  [name: string]: number;
}

/**
 * Keeps track of the last turn index a node was visited
 */
export interface VisitIndicies {
  [name: string]: number;
}

/**
 * Keeps track of visited nodes.
 */
export interface VisitSet {
  counts: VisitCounts;
  indicies: VisitIndicies;
}

/** Empty @see VisitSet */
export const EmptyVisitSet: VisitSet = { counts: {}, indicies: {} };

/**
 * Represents a basic iterator in the flow.
 */
export interface SimpleFlowState {
  id: Id | null;
  last: Id | null;
  variables: VariableStore;

  /** If true, we're in shadow mode. Don't commit any permenant changes to game state. */
  shadowing?: boolean;
}

/**
 * Represents a branch in the flow.
 */
export interface FlowBranch {
  /** Branch index. Pass this index to @see advanceGameFlowState to follow this branch */
  index: number;

  /** Path. Following this branch will move through all these nodes. The final Id is the terminal node the path ends on. */
  path: Id[];
}

/**
 * Represents a branch in the flow.
 */
export class ResolvedBranch<
  DestinationType extends BaseFlowNode = BaseFlowNode
> {
  /**
   * Branch index. Used when calling the continue function in iteration.
   */
  public readonly index: number;

  /**
   * Full branch path from current flow node to the terminal node.
   */
  public readonly path: BaseFlowNode[];

  constructor(index = -1, path: BaseFlowNode[] = []) {
    this.index = index;
    this.path = path;
  }

  /**
   * Returns the terminal node
   */
  destination(): DestinationType {
    return this.path[this.path.length - 1] as DestinationType;
  }

  /**
   * Checks if the terminal node is of a given type
   * @param type Type to check (can be string type name or type class)
   */
  destinationIs<NewDestinationType extends DestinationType = DestinationType>(
    type: ArticyObjectCreator<NewDestinationType> | string
  ): this is ResolvedBranch<NewDestinationType> {
    if (typeof type === 'string') {
      return this.destination().is(type);
    }
    return this.destination() instanceof type;
  }

  /**
   * Returns the terminal node as the specified type or undefined if it doesn't match.
   * Can combine class type with string type. Will only return non-undefined if it matches both.
   * @param type Flow node type
   * @param typeString Type string
   */
  destinationAs<ObjectType extends DestinationType>(
    type: ArticyObjectCreator<ObjectType>,
    typeString?: string
  ): ObjectType | undefined {
    const dest = this.destination();

    // Make sure it matches the return type
    if (!(dest instanceof type)) {
      return undefined;
    }

    // Make sure it matches the string type
    if (typeString && !dest.is(typeString)) {
      return undefined;
    }

    // Correc type. Return.
    return dest;
  }

  /**
   * Like destinationAs but checks along the path for the first matching node
   * @param type Type to return
   * @param typeString Type string
   */
  pathHas<ObjectType>(
    type: ArticyObjectCreator<ObjectType>,
    typeString: string
  ): ObjectType | undefined {
    // Go through path
    for (let i = 0; i < this.path.length; i++) {
      const item = this.path[i];

      // Check if it's the right type
      if (!(item instanceof type)) {
        continue;
      }

      // Check type string
      if (typeString && !item.is(typeString)) {
        continue;
      }

      // Return item
      return item;
    }

    // Fail
    return undefined;
  }
}

/**
 * Resolves a branch by converting all its IDs into Flow Node objects.
 * @param branch Flow branch
 * @param db Database
 */
export function resolveBranch(
  branch: FlowBranch,
  db: Database
): ResolvedBranch {
  return new ResolvedBranch(
    branch.index,
    branch.path.map(id => db.getObject(id, BaseFlowNode) as BaseFlowNode)
  );
}

/**
 * Resolves a list of branches all at once using @see resolveBranch
 * @param branches List of flow branches
 * @param db Database
 */
export function resolveBranches(
  branches: FlowBranch[],
  db: Database
): ResolvedBranch[] {
  return branches.map(b => resolveBranch(b, db));
}

/**
 * Checks if the destination of a branch is a given type
 * @param branch Flow branch to check
 * @param db Database
 * @param type Type to check for
 */
export function branchEndsWith(
  branch: FlowBranch,
  db: Database,
  type: ArticyObjectCreator | string
): boolean {
  if (branch.path.length === 0) {
    return false;
  }

  // Check type of final path entry
  return db.isOfType(branch.path[branch.path.length - 1], type);
}

/**
 * Resolves all branches in a list whose destination matches a given type
 * @param branches Flow branch list
 * @param db Database
 * @param type Type to check the destination again
 */
export function getBranchesOfType<
  DestinationType extends BaseFlowNode = BaseFlowNode
>(
  branches: FlowBranch[],
  db: Database,
  type: ArticyObjectCreator<DestinationType> | string
): ResolvedBranch<DestinationType>[] {
  return branches
    .filter(b => branchEndsWith(b, db, type))
    .map(b => resolveBranch(b, db) as ResolvedBranch<DestinationType>);
}

/**
 * Full game flow iterator. Contains not just a current position in the flow but a visit set and current branches
 */
export interface GameFlowState extends SimpleFlowState {
  /**
   * Cache of branches available at this juncture
   */
  branches: FlowBranch[];

  /**
   * All nodes visited so far.
   */
  visits: VisitSet;

  /**
   * Turn counter. Not sure what it represents but it goes up.
   */
  turn: number;
}

/**
 * Empty game flow iterator. Use this to initialize your game state
 */
export const NullGameFlowState: GameFlowState = {
  id: null,
  last: null,
  variables: {},
  visits: EmptyVisitSet,
  branches: [],
  turn: 0,
};

/**
 * Custom handling for iteration stops
 */
export enum CustomStopType {
  /**
   * Normal stop. Stop here and return a new branch.
   */
  NormalStop = 'NORMAL_STOP',

  /**
   * Stop and continue.
   * Return a new branch with this node as the terminal but continue making new branches past it.
   */
  StopAndContinue = 'STOP_AND_CONTINUE',

  /**
   * Continue. Ignores stop. Continue iteration looking for terminals.
   */
  Continue = 'CONTINUE',

  /**
   * Stop but drops the whole branch. It's as if this node didn't exist.
   */
  Drop = 'DROP',
}

/**
 * Configuration for game flow state iteration
 */
export interface GameIterationConfig {
  /**
   * These node types are considered "terminal".
   * Iteration will stop at them and return a new branch.
   */
  stopAtTypes: string[];

  /**
   * Called on notes that match stopAtTypes. Customizes how the stop is handled.
   */
  customStopHandler?: (
    node: BaseFlowNode,
    visits: VisitSet
  ) => CustomStopType | void;
}

/**
 * From a flow state, find all immediate (valid) child flow nodes
 * @param db Database
 * @param state Current flow state
 * @param node Current node (If you already have it. Avoids unnecessary lookups)
 */
export function getFlowStateChildren(
  db: Database,
  state: SimpleFlowState,
  visits: VisitSet = EmptyVisitSet,
  node?: BaseFlowNode
): BaseFlowNode[] {
  if (!state.id) {
    return [];
  }

  // Get node to access
  node = node ?? db.getObject(state.id, BaseFlowNode);
  if (!node) {
    return [];
  }

  // Grab children
  const children: BaseFlowNode[] = [];
  const numChildren = node.numBranches(
    { variables: state.variables, visits },
    state.last,
    state.shadowing ?? false
  );
  for (let i = 0; i < numChildren; i++) {
    const child = node.next(
      { variables: state.variables, visits },
      i,
      state.last,
      state.shadowing ?? false
    );
    if (child) {
      children.push(child);
    }
  }

  return children;
}

type BasicFlowIterationResult = [SimpleFlowState, BaseFlowNode | undefined];
type GameIterationResult = [GameFlowState, BaseFlowNode | undefined];

/**
 * Advances a flow state one node down a branch.
 * @param db Database
 * @param state Current flow state
 * @param branchIndex Branch index to follow (-1 to only follow if there is exactly one path)
 * @returns The new flow state and the new current node (used to avoid unnecessary lookups)
 */
export function basicNextFlowState(
  db: Database,
  state: SimpleFlowState,
  branchIndex: number,
  visits: VisitSet = EmptyVisitSet
): BasicFlowIterationResult {
  // Nowhere to go. We have no ID.
  if (!state.id) {
    return [state, undefined];
  }

  // Get current node
  const node = db.getObject(state.id, BaseFlowNode);

  // Find the next node
  const next = node?.next(
    { variables: state.variables, visits },
    branchIndex,
    state.last,
    state.shadowing ?? false
  );

  // Nowhere to go.
  if (!next) {
    return [
      { id: null, last: null, variables: {}, shadowing: state.shadowing },
      undefined,
    ];
  }

  // Create new state
  return [
    {
      id: next.properties.Id,
      last: state.id,
      variables: state.variables,
      shadowing: state.shadowing,
    },
    next,
  ];
}

function shouldStopAt(
  node: ArticyObject<ArticyObjectProps>,
  stopAtTypes: string[]
) {
  if (stopAtTypes.filter(t => node.is(t)).length > 0) {
    return true;
  }
  return false;
}

/**
 * Advances from the starting ID to a desired stop at node (or not if we are already at a stop at node)
 * @param db Database
 * @param start Starting ID
 * @param config Advancement options
 * @param existing Existing game state to migrate variables and visits from
 */
export function startupGameFlowState(
  db: Database,
  start: Id,
  config: GameIterationConfig,
  existing?: GameFlowState
): GameIterationResult {
  // Create initial state
  let initial: GameFlowState = {
    id: start,
    last: null,
    branches: [],
    variables: existing?.variables ?? db.newVariableStore(),
    visits: existing?.visits ?? EmptyVisitSet,
    turn: existing?.turn ?? 0,
  };
  initial = refreshBranches(db, initial, config);

  // Get start node
  const node = db.getObject(start, BaseFlowNode);
  if (!node) {
    return [NullGameFlowState, undefined];
  }

  // Make sure to execute the start node
  node.execute({ variables: initial.variables, visits: initial.visits });
  OnNodeExecution(node, initial);

  // Mark it as visited
  initial.visits = { ...initial.visits };
  initial.visits.counts = {
    ...initial.visits.counts,
    [start]: (initial.visits.counts[start] ?? 0) + 1,
  };
  initial.visits.indicies = {
    ...initial.visits.indicies,
    [start]: initial.turn,
  };

  // Check if it's a valid starting point
  if (shouldStopAt(node, config.stopAtTypes)) {
    initial.turn++;
    return [initial, node];
  }

  // Otherwise, advance
  return advanceGameFlowState(db, initial, config, 0);
}

/**
 * Advances a flow state until it hits a node that matches the search criteria.
 * @param db Database
 * @param state Current flow state
 * @param branchIndex Branch index to follow
 * @returns A new game flow state with a list of available branches. Also returns the current node to avoid unncessary lookups.
 */
export function advanceGameFlowState(
  db: Database,
  state: GameFlowState,
  config: GameIterationConfig,
  branchIndex: number
): GameIterationResult {
  if (!state.id) {
    return [state, undefined];
  }

  // Get branch to follow
  const branch = state.branches.find(x => x.index === branchIndex);
  if (!branch) {
    return [state, undefined];
  }

  let vars = state.variables;
  let hasCloned = false;

  const visits: VisitSet = {
    indicies: { ...state.visits.indicies },
    counts: { ...state.visits.counts },
  };

  // Resolve branch to get the actual nodes in the list
  const resolvedBranch = resolveBranch(branch, db);

  // Execute each stage in the path
  for (const step of resolvedBranch.path) {
    // Clone variable store if we're going to change it
    if (!hasCloned && step.needsShadow()) {
      hasCloned = true;
      vars = cloneVariableStore(vars);
    }

    // Execute node
    step.execute({ variables: vars, visits: visits });

    // Call any registered handlers
    // TODO: Do we need to pass a more up to date state??
    OnNodeExecution(step, state);

    // Mark as visited
    let count = visits.counts[step.properties.Id] ?? 0;
    count++;
    visits.counts[step.properties.Id] = count;

    // Set current turn
    visits.indicies[step.properties.Id] = state.turn;
  }

  // Move to end
  let last = db.getObject(state.id, BaseFlowNode);
  if (branch.path.length > 1) {
    last = resolvedBranch.path[branch.path.length - 2];
  }
  const curr = resolvedBranch.path[branch.path.length - 1];
  const newFlowState = {
    // New node ID
    id: curr.properties.Id,

    // Id of the last node we were on
    last: last?.properties.Id,

    // Empty branch list - will be refreshed after
    branches: [],

    // Copy over variables
    variables: vars,

    // Visits
    visits: visits,

    // Next turn index
    turn: state.turn + 1,
  };

  // Return state with branches
  return [refreshBranches(db, newFlowState, config), curr];
}

export function collectBranches(
  db: Database,
  iter: SimpleFlowState,
  config: GameIterationConfig,
  visits: VisitSet,
  branch?: FlowBranch,
  index = 0,
  direction = -1,
  node?: BaseFlowNode
): FlowBranch[] {
  // No valid ID? Return nothing.
  if (!iter.id) {
    return [];
  }

  // Get the node at this flow state
  node = node ?? db.getObject(iter.id, BaseFlowNode);
  if (!node) {
    return [];
  }

  // Make sure branch object exists
  if (!branch) {
    branch = { index, path: [] };
  }

  // Get number of branches
  let branches = node.numBranches(
    { variables: iter.variables, visits },
    iter.last,
    iter.shadowing ?? false
  );

  // Travel this route as long as there is only one child
  while (branches === 1 || direction >= 0) {
    // Check for shadowing
    if (node.needsShadow()) {
      // Create a cloned variable store to use from here on out
      iter.variables = cloneVariableStore(iter.variables);
    }

    // Move to that child
    [iter, node] = basicNextFlowState(db, iter, direction, visits);
    direction = -1;

    // If no node exists, this is a dead end
    if (!node) {
      // No return since we didn't hit a valid end point
      return [];
    }

    // Otherwise, add to our current branch
    branch.path.push(node.id);

    // Check if we're ready to stop
    if (shouldStopAt(node, config.stopAtTypes)) {
      // Check if there's custom stop logic for this node
      if (config.customStopHandler) {
        const behaviour = config.customStopHandler(node, visits);

        // Default behaviour. Return branch and stop.
        if (
          behaviour === CustomStopType.NormalStop ||
          behaviour === undefined
        ) {
          return [branch];
        } else if (behaviour === CustomStopType.StopAndContinue) {
          // We want to return a branch at the current position plus whatever branches follow us
          const forked = { index: index + 1, path: [...branch.path] };
          return [
            branch,
            ...collectBranches(
              db,
              iter,
              config,
              visits,
              forked,
              index + 1,
              0,
              node
            ),
          ];
        } else if (behaviour === CustomStopType.Drop) {
          // Drop. End this branch without returning anything.
          return [];
        } else if (behaviour === CustomStopType.Continue) {
          // Continue. Do nothing
        } else {
          // Unexpected type... stop?
          console.log(
            `Unexpected custom stop behaviour found: ${behaviour}. Unsure what to do.... Stopping here.`
          );
          return [branch];
        }
      } else {
        // No custom stop behaviour. Use default stop and return branch.
        return [branch];
      }
    }

    // Continue
    branches = node.numBranches(
      { variables: iter.variables, visits },
      iter.last,
      iter.shadowing ?? false
    );
  }

  // If we're here, we've reached a fork
  let result: FlowBranch[] = [];
  for (let i = 0; i < branches; i++) {
    // Duplicate branch
    const forked = { index, path: [...branch.path] };

    // Go!
    result = [
      ...result,
      ...collectBranches(
        db,
        { ...iter },
        config,
        visits,
        forked,
        index,
        i,
        node
      ),
    ];

    // Update index
    if (result.length > 0) {
      index = result[result.length - 1].index + 1;
    }
  }

  return result;
}

function cloneVariableStore(vars: VariableStore): VariableStore {
  return JSON.parse(JSON.stringify(vars));
}

/**
 * Updates the available branches in a game flow state
 * @param db Database
 * @param state Game flow state
 * @param config Game iteration config settings
 */
export function refreshBranches(
  db: Database,
  state: GameFlowState,
  config: GameIterationConfig
): GameFlowState {
  const result = { ...state };
  const vars = state.variables;
  result.branches = collectBranches(
    db,
    { ...state, shadowing: true },
    config,
    state.visits
  );
  result.variables = vars;
  return result;
}
