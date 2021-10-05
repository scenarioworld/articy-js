import {
  advanceGameFlowState,
  BaseFlowNode,
  completeFlow,
  Database,
  GameFlowState,
  GameIterationConfig,
  Id,
  mergeGameFlowState,
  refreshBranches,
  startupGameFlowState,
} from '.';

type GlobalKeys = 'variables' | 'visits' | 'turn';

export type Globals = Pick<GameFlowState, GlobalKeys>;

/** Empty globals state */
export const NullGlobals: Globals = {
  variables: {},
  visits: { counts: {}, indicies: {} },
  turn: -1,
};

export type SlimGameFlowState = Omit<GameFlowState, GlobalKeys>;

/** Empty slim game flow state */
export const NullSlimGameFlowState: SlimGameFlowState = {
  pages: [],
  mergePages: [],
  branches: [],
  id: null,
  last: null,
  terminalBranch: undefined,
};

type GlobalsIterationResult = [
  Globals,
  SlimGameFlowState,
  BaseFlowNode | undefined
];

function SplitGlobals([state, node]: [
  GameFlowState,
  BaseFlowNode | undefined
]): GlobalsIterationResult {
  // Split out global state
  const { variables, visits, turn, ...naked } = state;

  // Return as its own object
  return [{ variables, visits, turn }, naked, node];
}

/**
 * Initializes a new [[Globals]] object to be used with the `withGlobals` variants of the iteration methods.
 * @param db Database (used to create initial variable state)
 * @returns Initialized [[Globals]] object
 */
export function initializeGlobals(db: Database): Globals {
  return {
    variables: db.newVariableStore(),
    visits: { counts: {}, indicies: {} },
    turn: 0,
  };
}

/**
 * Same as [[startupGameFlowState]] but seperates out the globals of the iterator
 * @param globals Existing globals
 * @param db Database
 * @param start Starting ID. The returned state will either point to this node (if it's a terminal) or it'll find the first terminal by iterating along the first branch.
 * @param config Configuration settings which determine which nodes are considered 'terminal'.
 * @param existing Optional existing game state to migrate variables and visits from.
 * @returns A new [[Globals]] and [[SlimGameFlowState]] ready for iteration with [[advanceGameFlowStateWithGlobals]].
 */
export function startupGameFlowStateWithGlobals(
  globals: Globals,
  db: Database,
  start: Id,
  config: GameIterationConfig
): GlobalsIterationResult {
  return SplitGlobals(startupGameFlowState(db, start, config, globals));
}

/**
 * Same as [[advanceGameFlowState]] but seperates out the globals of the iterator
 * @param globals Existing globals
 * @param db Database
 * @param state Current [[SlimGameFlowState]]
 * @param config Configuration settings which determine which nodes are considered 'terminal'.
 * @param branchIndex Branch index to follow
 * @returns A new game flow state with a list of available branches. Also returns the current node to avoid unncessary lookups.
 */
export function advanceGameFlowStateWithGlobals(
  globals: Globals,
  db: Database,
  state: SlimGameFlowState,
  config: GameIterationConfig,
  branchIndex: number
): GlobalsIterationResult {
  return SplitGlobals(
    advanceGameFlowState(db, { ...state, ...globals }, config, branchIndex)
  );
}

/**
 * Same as [[mergeGameFlowState]] but seperates out the globals of the iterator
 * @param globals Existing globals
 * @param db Articy database
 * @param state Current flow iterator
 * @param config Iteration configuration
 * @param start Id to start the new thread from. Will iterate until it finds something that matches the stop types of config and merge branches/pages
 * @returns Merged iterator
 */
export function mergeGameFlowStateWithGlobals(
  globals: Globals,
  db: Database,
  state: SlimGameFlowState,
  config: GameIterationConfig,
  start: Id
): [Globals, SlimGameFlowState] {
  const newState = mergeGameFlowState(
    db,
    { ...state, ...globals },
    config,
    start
  );
  const [glob, split] = SplitGlobals([newState, undefined]);
  return [glob, split];
}

/**
 * Same as [[refreshBranches]] but seperates out the globals of the iterator
 * @param globals Existing globals
 * @param db Database
 * @param state Current game flow state
 * @param config Game iteration config settings
 */
export function refreshBranchesWithGlobals(
  globals: Globals,
  db: Database,
  state: SlimGameFlowState,
  config: GameIterationConfig
): [Globals, SlimGameFlowState] {
  const newState = refreshBranches(db, { ...state, ...globals }, config);
  const [glob, split] = SplitGlobals([newState, undefined]);
  return [glob, split];
}

/**
 * Same as [[completeFlow]] but seperates out the globals of the iterator
 * @param globals Existing globals
 * @param db Database
 * @param state Current state
 * @returns a null iterator with the up-to-date variables and visits
 */
export function completeFlowWithGlobals(
  globals: Globals,
  db: Database,
  state: SlimGameFlowState
): [Globals, SlimGameFlowState] {
  const newState = completeFlow(db, { ...state, ...globals });
  const [glob, split] = SplitGlobals([newState, undefined]);
  return [glob, split];
}
