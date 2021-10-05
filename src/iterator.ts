import { ArticyObjectProps, ConnectionProps, Id } from './json';
import { Database } from './database';
import { BaseFlowNode } from './flowTypes';
import { ArticyObjectCreator, NullId } from './object';
import { ApplicationState, GetState, OnNodeExecution } from './script';
import { ArticyObject } from './types';
import { VariableStore } from './variables';

/**
 * A dictionary of node IDs to the number of times they've been visited.
 */
export interface VisitCounts {
  [name: string]: number;
}

/**
 * A dictionary of node IDs to the turn index they were last visited.
 */
export interface VisitIndicies {
  [name: string]: number;
}

/**
 * Keeps track of visit counts and indicies for nodes.
 */
export interface VisitSet {
  /** Map of IDs to the number of times the node has been visited (unset = unvisited) */
  counts: VisitCounts;

  /** Map of IDs to the last turn ID the node was visited. Useful for sorting by how recently a node was seen. */
  indicies: VisitIndicies;
}

/** Empty @see VisitSet */
export const EmptyVisitSet: VisitSet = { counts: {}, indicies: {} };

/**
 * A simple flow iterator that tracks variable values and the current node id.
 *
 * Only use this is you want to do low-level iteration (advancing one node at a time, no stopping, no iteration config).
 * Generally, you should be using [[GameFlowState]].
 */
export interface SimpleFlowState {
  /** Id of the current node */
  id: Id | null;

  /** Last node. Needed for FlowFragments to decide which internal pin to follow. */
  last: Id | null;

  /** Current value of all variables */
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

  /** In the case of additional pages, this tracks what node this branch is actually coming off of. */
  branchedFrom: Id;
}

/**
 * Wrapper for [[FlowBranch]] that resolves the path IDs into their resolved Articy Objects.
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

  /**
   * In the case of additional pages, this tracks what node this branch is actually coming off of.
   */
  readonly branchedFrom: Id;

  constructor(
    index = -1,
    path: BaseFlowNode[] = [],
    branchedFrom: Id = NullId
  ) {
    this.index = index;
    this.path = path;
    this.branchedFrom = branchedFrom;
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
    branch.path.map(id => db.getObject(id, BaseFlowNode) as BaseFlowNode),
    branch.branchedFrom
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
   * Normally, just a list containing the current id. If you use the CreatePage stop type or mergeGameFlowState, you'll get additional pages here.
   */
  pages: Id[];

  /**
   * A subset of pages that were added via the mergeGameFlowState. This is used only internally to make refreshBranches work properly with mergeGameFlowState
   */
  mergePages: { id: Id; last: Id }[];

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

  /**
   * This is the "terminal branch" executed when completeFlow is called.
   * It is the first branch of available nodes that does NOT lead to a stopping node.
   * An example might be a series of instruction nodes after the last dialogue fragment in a flow.
   */
  terminalBranch: FlowBranch | undefined;
}

/**
 * Empty game flow iterator. Use this to initialize your game state
 */
export const NullGameFlowState: GameFlowState = {
  id: null,
  last: null,
  pages: [],
  mergePages: [],
  variables: {},
  visits: EmptyVisitSet,
  branches: [],
  turn: 0,
  terminalBranch: undefined,
};

/**
 * Returned by [[GameIterationConfig.customStopHandler]]. Tells the runtime to apply custom handling to a given node.
 */
export enum CustomStopType {
  /**
   * Normal stop. Stop here and return a new branch. Equivilent to listing this node's template in [[GameIterationConfig.stopAtTypes]].
   */
  NormalStop = 'NORMAL_STOP',

  /**
   * Stop and continue.
   * Stops and returns a new branch like [[NormalStop]], but also continue along making new branches like [[Continue]].
   */
  StopAndContinue = 'STOP_AND_CONTINUE',

  /**
   * Continue. Ignores the stop. Act as though this node was never listed in [[GameIterationConfig.stopAtTypes]].
   */
  Continue = 'CONTINUE',

  /**
   * Stop but also drops the whole branch. It's as if this node didn't exist.
   */
  Drop = 'DROP',

  /**
   * Adds this node to the "additional pages" list in the iterator. Otherwise, operates like [[Continue]].
   */
  CreatePage = 'CREATE_PAGE',

  /**
   * Operates like NormalStop except when taking this branch, we advance past this node until we get a non-Advance node. Useful for blank nodes.
   */
  Advance = 'ADVANCE',
}

/**
 * Configuration for game flow state iteration. Controls which nodes are considered terminals.
 */
export interface GameIterationConfig {
  /**
   * These node types are considered "terminal".
   * Iteration will stop at them and return a new branch.
   */
  stopAtTypes: string[];

  /**
   * Any node containing these features will be considered "terminal"
   * as if its template were contained in @see stopAtTypes above.
   */
  stopAtFeatures?: string[];

  /**
   * Called on notes that match stopAtTypes. Customizes how the stop is handled (or ignored).
   *
   * This is useful if you have nodes that should only be considered terminal if they contain particular text, settings, etc.
   * It can also return a variety of more advanced terminal handling via [[CustomStopType]] such as page creation and stop and continues.
   */
  customStopHandler?: (
    node: BaseFlowNode,
    connections: ConnectionProps[],
    visits: Readonly<VisitSet>,
    state?: Readonly<ApplicationState>
  ) => CustomStopType | void;
}

/**
 * From a flow state, find all immediate (valid) child flow nodes
 * @param db Database
 * @param state Current flow state
 * @param node Current node (If you already have it. Avoids unnecessary lookups)
 * @returns A list of immediate valid child nodes
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
    if (child && child[0]) {
      children.push(child[0]);
    }
  }

  return children;
}

type BasicFlowIterationResult = [
  SimpleFlowState,
  BaseFlowNode | undefined,
  ConnectionProps | undefined
];
type GameIterationResult = [GameFlowState, BaseFlowNode | undefined];

/**
 * Advances a basic flow state one node down a branch.
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
    return [state, undefined, undefined];
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
  if (!next || !next[0]) {
    return [
      { id: null, last: null, variables: {}, shadowing: state.shadowing },
      undefined,
      undefined,
    ];
  }

  const [nextNode, conn] = next;

  // Create new state
  return [
    {
      id: nextNode.properties.Id,
      last: state.id,
      variables: state.variables,
      shadowing: state.shadowing,
    },
    nextNode,
    conn,
  ];
}

function shouldStopAt(
  node: ArticyObject<ArticyObjectProps>,
  config: GameIterationConfig
) {
  if (config.stopAtTypes.filter(t => node.is(t)).length > 0) {
    return true;
  } else if (
    node.template &&
    config.stopAtFeatures &&
    config.stopAtFeatures.filter(f => f in node.template!).length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Creates a new flow state beginning at the first terminal node found by starting at a given ID.
 * @param db Database
 * @param start Starting ID. The returned state will either point to this node (if it's a terminal) or it'll find the first terminal by iterating along the first branch.
 * @param config Configuration settings which determine which nodes are considered 'terminal'.
 * @param existing Optional existing game state to migrate variables and visits from.
 * @returns A new [[GameFlowState]] ready for iteration with [[advanceGameFlowState]].
 */
export function startupGameFlowState(
  db: Database,
  start: Id,
  config: GameIterationConfig,
  existing?: Pick<GameFlowState, 'variables' | 'visits' | 'turn'>
): GameIterationResult {
  // Create initial state
  let initial: GameFlowState = {
    id: start,
    last: null,
    pages: [start],
    branches: [],
    mergePages: [],
    variables: existing?.variables ?? db.newVariableStore(),
    visits: existing?.visits ?? EmptyVisitSet,
    turn: existing?.turn ?? 0,
    terminalBranch: undefined,
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
  if (shouldStopAt(node, config)) {
    initial.turn++;
    return [initial, node];
  }

  // Otherwise, advance
  return advanceGameFlowState(db, initial, config, 0);
}

function executeFlowBranch(
  state: GameFlowState,
  branch: FlowBranch,
  db: Database
): [VariableStore, VisitSet, ResolvedBranch] {
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

    // Deal with extra visits
    let forcedVisits = step.visits({ variables: vars, visits: visits });
    if (forcedVisits !== undefined && forcedVisits.length > 0) {
      if (typeof forcedVisits === 'string') {
        forcedVisits = [forcedVisits];
      }

      for (const id of forcedVisits) {
        visits.counts[id] = (visits.counts[id] ?? 0) + 1;
        visits.indicies[id] = state.turn;
      }
    }
  }

  return [vars, visits, resolvedBranch];
}

/**
 * Advances a [[GameFlowState]] along a particular branch until the next terminal node is hit.
 * @param db Database
 * @param state Current [[GameFlowState]]
 * @param config Configuration settings which determine which nodes are considered 'terminal'.
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

  // Execute the branch
  const [vars, visits, resolvedBranch] = executeFlowBranch(state, branch, db);

  // Move to end
  let last = db.getObject(state.id, BaseFlowNode);
  if (branch.path.length > 1) {
    last = resolvedBranch.path[branch.path.length - 2];
  }
  const curr = resolvedBranch.path[branch.path.length - 1];
  let newFlowState: GameFlowState = {
    // New node ID
    id: curr.properties.Id,

    // Id of the last node we were on
    last: last?.properties.Id,

    // Start with no new pages
    pages: [curr.properties.Id],

    // No merged pages either
    mergePages: [],

    // Empty branch list - will be refreshed after
    branches: [],

    // Copy over variables
    variables: vars,

    // Visits
    visits: visits,

    // Next turn index
    turn: state.turn + 1,

    // No known terminate branch - will be refreshed after
    terminalBranch: undefined,
  };

  // Refresh this new state with fresh branches
  newFlowState = refreshBranches(db, newFlowState, config);

  // SPECIAL: Advancement, skip ahead to the next branch
  if (
    newFlowState.branches.length > 0 &&
    config.customStopHandler?.(curr, [], newFlowState.visits, GetState()) ===
      CustomStopType.Advance
  ) {
    return advanceGameFlowState(db, newFlowState, config, 0);
  }

  // Otherwise, return
  return [newFlowState, curr];
}

/**
 * Creates a second "thread" in a flow iterator starting at a given node.
 *
 * Suppose the existing flow state is stopped at X with 3 branches A, B, and C.
 * If we merge this state using `mergeGameFlowState` with a `start` of Y is terminal and has branches M and N then we'd get a new [[GameFlowState]] with the following properties:
 *
 * * It's [[GameFlowState.id]] would still be the ID of X.
 * * But it's [[GameFlowState.pages]] would contain both the ID of X and Y.
 * * It's branches array would contain [A, B, C] *as well as* [M, N]. Each will have a unique branch index.
 *
 * The two flow states, the original and the new one starting at Y, have merged. This is called 'pageing'. Your flow state now has multiple pages which are being displayed as one.
 *
 * Calling [[refreshBranches]] or [[advanceGameFlowState]] work as normal along any of the sets of branches. Advancing will collapse the state into a single page again, ending up at the destination at the end of that branch.
 *
 * This method is called automatically during iteration whenever the [[GameIterationConfig.customStopHandler]] returns [[CustomStopType.CreatePage]]
 * @param db Articy database
 * @param state Current flow iterator
 * @param config Iteration configuration
 * @param start Id to start the new thread from. Will iterate until it finds something that matches the stop types of config and merge branches/pages
 * @returns Merged iterator
 */
export function mergeGameFlowState(
  db: Database,
  state: GameFlowState,
  config: GameIterationConfig,
  start: Id
): GameFlowState {
  // Create a new flow state starting at the starting index but using our existing state for variables, etc.
  const [newStartupState] = startupGameFlowState(db, start, config, state);

  // Now, we need to merge the states. Find the highest branch number of our existing state
  const maxBranchIndex =
    state.branches.length === 0
      ? -1
      : Math.max(...state.branches.map(b => b.index));

  // Merge the states
  return {
    ...newStartupState,
    id: state.id,
    last: state.last,
    pages: [...state.pages, ...newStartupState.pages],
    mergePages: [
      ...state.mergePages,
      ...(newStartupState.id
        ? [{ id: newStartupState.id, last: newStartupState.last! }]
        : []),
    ],
    branches: [
      ...state.branches,
      ...newStartupState.branches.map(b => ({
        ...b,
        index: b.index + maxBranchIndex + 1,
      })),
    ],
  };
}

type CollectionResult = Partial<
  Pick<GameFlowState, 'pages' | 'branches' | 'terminalBranch'>
>;
function merge(a: CollectionResult, b: CollectionResult): CollectionResult {
  const branches: CollectionResult =
    a.branches || b.branches
      ? { branches: [...(a.branches ?? []), ...(b.branches ?? [])] }
      : {};
  const pages: CollectionResult =
    a.pages || b.pages
      ? {
          pages: [...(a.pages ?? []), ...(b.pages ?? [])],
        }
      : {};

  return {
    ...branches,
    ...pages,
    terminalBranch: a.terminalBranch ?? b.terminalBranch,
  };
}

export function collectBranches(
  db: Database,
  iter: SimpleFlowState,
  config: GameIterationConfig,
  visits: VisitSet,
  branch?: FlowBranch,
  index = 0,
  direction = -1,
  node?: BaseFlowNode,
  prevConnections: ConnectionProps[] = []
): CollectionResult {
  // No valid ID? Return nothing.
  if (!iter.id) {
    return {};
  }

  // Get the node at this flow state
  node = node ?? db.getObject(iter.id, BaseFlowNode);
  if (!node) {
    return {};
  }

  // Make sure branch object exists
  if (!branch) {
    branch = { index, path: [], branchedFrom: iter.id };
  }

  // Get number of branches
  let branches = node.numBranches(
    { variables: iter.variables, visits },
    iter.last,
    iter.shadowing ?? false
  );

  // Keep track of connections we've taken
  const connections = [...prevConnections];

  // Travel this route as long as there is only one child
  while (branches === 1 || direction >= 0) {
    // Check for shadowing
    if (node.needsShadow()) {
      // Create a cloned variable store to use from here on out
      iter.variables = cloneVariableStore(iter.variables);
    }

    // Move to that child
    let nextConnection: ConnectionProps | undefined;
    [iter, node, nextConnection] = basicNextFlowState(
      db,
      iter,
      direction,
      visits
    );
    direction = -1;

    // If our last valid connection is now undefined, restore it.
    if (nextConnection) {
      connections.push(nextConnection);
    }

    // If no node exists, this is a dead end
    if (!node) {
      // Return this branch as a "terminal branch" that can be used if we want to finish up iteration with complete
      return { terminalBranch: branch };
    }

    // Otherwise, add to our current branch
    branch.path.push(node.id);

    // Check if we're ready to stop
    if (shouldStopAt(node, config)) {
      // Check if there's custom stop logic for this node
      if (config.customStopHandler) {
        const behaviour = config.customStopHandler(
          node,
          connections,
          visits,
          GetState()
        );

        // Default behaviour. Return branch and stop.
        if (
          behaviour === CustomStopType.NormalStop ||
          behaviour === CustomStopType.Advance ||
          behaviour === undefined
        ) {
          return { branches: [branch] };
        } else if (behaviour === CustomStopType.StopAndContinue) {
          // We want to return a branch at the current position plus whatever branches follow us
          const forked: FlowBranch = {
            index: index + 1,
            path: [...branch.path],
            branchedFrom: branch.branchedFrom,
          };
          return merge(
            { branches: [branch] },
            collectBranches(
              db,
              iter,
              config,
              visits,
              forked,
              index + 1,
              0,
              node
            )
          );
        } else if (behaviour === CustomStopType.Drop) {
          // Drop. End this branch without returning anything.
          return {};
        } else if (behaviour === CustomStopType.CreatePage) {
          // Create new page and continue branching
          if (iter.id) {
            const newBranch: FlowBranch = { ...branch, branchedFrom: iter.id };
            return merge(
              { pages: [iter.id] },
              collectBranches(
                db,
                iter,
                config,
                visits,
                newBranch,
                index + 1,
                0,
                node
              )
            );
          }
        } else if (behaviour === CustomStopType.Continue) {
          // Continue. Do nothing
        } else {
          // Unexpected type... stop?
          console.log(
            `Unexpected custom stop behaviour found: ${behaviour}. Unsure what to do.... Stopping here.`
          );
          return { branches: [branch] };
        }
      } else {
        // No custom stop behaviour. Use default stop and return branch.
        return { branches: [branch] };
      }
    }

    // Continue
    branches = node.numBranches(
      { variables: iter.variables, visits },
      iter.last,
      iter.shadowing ?? false
    );
  }

  // Dead end handling
  if (branches === 0) {
    return { terminalBranch: branch };
  }

  // If we're here, we've reached a fork
  let result: CollectionResult = {};
  for (let i = 0; i < branches; i++) {
    // Duplicate branch
    const forked: FlowBranch = {
      index,
      path: [...branch.path],
      branchedFrom: branch.branchedFrom,
    };

    result = merge(
      result,
      collectBranches(
        db,
        { ...iter },
        config,
        visits,
        forked,
        index,
        i,
        node,
        connections
      )
    );

    // Update index
    if (result.branches && result.branches.length > 0) {
      index = result.branches[result.branches.length - 1].index + 1;
    }
  }

  return result;
}

function cloneVariableStore(vars: VariableStore): VariableStore {
  return JSON.parse(JSON.stringify(vars));
}

/**
 * Refreshes the branch list of a [[GameFlowState]].
 *
 * Useful if you've manually adjusted the value of variables and you want to make sure your branches are accurate.
 * @param db Database
 * @param state Current game flow state
 * @param config Game iteration config settings
 */
export function refreshBranches(
  db: Database,
  state: GameFlowState,
  config: GameIterationConfig
): GameFlowState {
  // Do normal branch collection, clearing page lists
  const result: GameFlowState = { ...state, pages: [] };
  Object.assign(
    result,
    collectBranches(db, { ...state, shadowing: true }, config, state.visits)
  );
  if (state.id !== null) {
    result.pages.splice(0, 0, state.id);
  }

  // Handle merged pages
  for (const page of state.mergePages) {
    // Collect branches for the merged page
    const iter: SimpleFlowState = { ...result, ...page };
    const newBranchResults = collectBranches(db, iter, config, result.visits);

    // Append branches/pages to the iterator
    result.pages.push(page.id);
    const maxIndex =
      result.branches.length === 0
        ? -1
        : Math.max(...result.branches.map(b => b.index));
    if (newBranchResults.pages) {
      result.pages.push(...newBranchResults.pages);
    }
    if (newBranchResults.branches) {
      result.branches.push(
        ...newBranchResults.branches.map(b => ({
          ...b,
          index: b.index + maxIndex + 1,
        }))
      );
    }
  }

  // Return iterator
  return result;
}

/**
 * If the flow state has no branches, "complete" the flow by running any remaining pins or instructions after the current node.
 *
 * If there are branches, this just returns a nulled out iterator with the variable and visits sets intact.
 * @param db Database
 * @param state Current state
 * @returns a null iterator with the up-to-date variables and visits
 */
export function completeFlow(
  db: Database,
  state: GameFlowState
): GameFlowState {
  // If there are valid branches or no terminal branch, do nothing but clear the iterator
  if (state.branches.length > 0 || !state.terminalBranch) {
    return {
      ...state,
      id: null,
      last: null,
      branches: [],
      terminalBranch: undefined,
      mergePages: [],
      pages: [],
    };
  }

  // Otherwise, execute the terminating branch
  const [variables, visits] = executeFlowBranch(
    state,
    state.terminalBranch,
    db
  );

  // Return the new state with modified variables and visits but no current node or branches. We're done.
  return {
    ...state,
    variables,
    visits,
    id: null,
    last: null,
    branches: [],
    terminalBranch: undefined,
    mergePages: [],
    pages: [],
  };
}
