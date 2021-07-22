import {
  ActionCreatorWithPayload,
  AnyAction,
  Middleware,
} from '@reduxjs/toolkit';
import {
  ArticyObjectProps,
  FeatureProps,
  FlowObjectProps,
  Id,
  ScriptMethodDef,
  TemplateProps,
} from './json';
import { Database } from './database';
import { BaseFlowNode } from './flowTypes';
import { GameFlowState, VisitSet } from './iterator';
import { Variable, VariableStore } from './variables';

/**
 * Extend this interface with a type called `ApplicationState` to add Typescript support for accessing your Redux state via Script Function handlers and the like.
 *
 * Example:
 * ```typescript
 * interface ExtensionTypes
 * {
 *    // Replace this type with whatever type you use for your Redux state
 *    ApplicationState: MyReduxStateType;
 * }
 * ```
 */
export interface ExtensionTypes {}
export type ApplicationState = ExtensionTypes extends {
  ApplicationState: unknown;
}
  ? ExtensionTypes['ApplicationState']
  : unknown;

/**
 * Context passed to each script function handler
 */
type Context = {
  /** Id of the caller (or [[NullId]] if called outside a node) */
  caller: Id;

  /** Visit information */
  visits: VisitSet;

  /** Variable state */
  variables: VariableStore;

  /** Database */
  db: Database;

  /** Custom application state (see [[ExtensionTypes]] and [[createScriptDispatchMiddleware]]) */
  state: Readonly<ApplicationState> | undefined;
};

// Generator which queues script reducers until finally returning a variable value
type ScriptGenerator = Generator<AnyAction, Variable | void, undefined>;

// Used internally. This is the signature used by the actual Articy Expresso scripts
type ScriptFunctionInternal = (...args: Variable[]) => Variable | void;

/**
 * Signature for a script function handler registered via [[RegisterScriptFunction]].
 * @param context Current execution context.
 * @param args Arguments from the Expresso script
 * @returns A boolean, void, and optionally a set of Redux actions to call if using [[createScriptDispatchMiddleware]]
 */
export type ScriptFunction = (
  context: Context,
  ...args: Variable[]
) => Variable | void | ScriptGenerator;

// List of registered functions by name
const registeredFunctions: Record<string, ScriptFunction> = {};

// State context (only set while root reducer is running)
let state: Readonly<ApplicationState> | undefined = undefined;
export function GetState(): typeof state {
  return state;
}

// Queued actions
let actionQueue: AnyAction[] | undefined = undefined;

function queueGeneratedActions(
  generator: ScriptGenerator,
  shadowing: boolean
): Variable | void {
  // Iterate the results
  let result = generator.next();
  while (!result.done) {
    // Don't queue in shadow mode
    if (!shadowing && actionQueue) {
      // Queue for post-update
      actionQueue.push(result.value);
    }

    // Move on to the next result
    result = generator.next();
  }

  // Final result is the return value
  return result.value;
}

type createMiddlewareFunction = (
  finalizeAction?: ActionCreatorWithPayload<AnyAction>
) => Middleware;

/**
 * Creates a Redux middleware that gives script function handlers registered via [[RegisterScriptFunction]] access to your application's current Redux state (via [[Context.state]]).
 *
 * Also allows script function handlers, feature handlers, etc. to yield return Redux Actions which will automatically be executed at the end of the current reducer run (or end of the next run if the reducer is not running). You can use this feature by registering your methods via [[RegisterScriptFunction]], etc. as *generator methods*. Then using the `yield` keyword.
 *
 * Example:
 * ```typescript
 * RegisterScriptFunction('MovePlayerTo', function* (context, x, y) {
 *    // Read your application state in context.state
 *
 *    // Trigger Redux actions (you can do more than one)
 *    yield { type: 'redux/move_action', x, y };
 *    yield { type: 'redux/enemies_move' };
 * });
 * ```
 *
 * You can optionally pass in a `finalizeAction` parameter to this middleware. Anytime Redux actions are triggered and run from ScriptFunctions, at the end this finalizeAction will be posted to the reducer.
 */
export const createScriptDispatchMiddleware: createMiddlewareFunction = finalizeAction => storeApi => next => action => {
  // Prime us to queue
  let queue: AnyAction[] = [];
  actionQueue = queue;

  // Set state
  state = storeApi.getState();

  // Execute action normally
  const result = next(action);

  // Clear queue and state
  actionQueue = undefined;
  state = undefined;

  // Dispatch appropriate actions
  for (const action of queue) {
    storeApi.dispatch(action);
  }

  // If we dispatched anything, then dispatch a finalize action
  if (queue.length > 0 && finalizeAction) {
    storeApi.dispatch(finalizeAction(action));
  }

  // Return result
  return result;
};

// Wraps a ScriptFunction and returns a function suitable for Articy's Expresso scripts.
// Automatically handles the function potentially returning reducers to be queued at the end of the state update.
function wrapScriptFunction(
  func: ScriptFunction,
  context: Context,
  shadowing: boolean
): ScriptFunctionInternal {
  return (...args) => {
    // Execute the underlying method
    const returnValue = func(context, ...args);

    // Check if the result is an iterator. If so, this is a generator.
    if (typeof returnValue === 'object') {
      return queueGeneratedActions(returnValue, shadowing);
    }

    return returnValue;
  };
}

/**
 * Makes a Javascript function available to Expresso scripts
 * @param name Function name (to be used in Articy)
 * @param func Handler
 */
export function RegisterScriptFunction(
  name: string,
  func: ScriptFunction
): void {
  registeredFunctions[name] = func;
}

const nativeScriptFunctions = [
  'random',
  'getProp',
  'setProp',
  'print',
  'getObj',
];

/**
 * Clears all registered functions
 */
export function ClearRegisteredScriptFunctions(): void {
  for (const key of Object.keys(registeredFunctions)) {
    // Don't delete native functions
    if (nativeScriptFunctions.includes(key)) {
      continue;
    }
    delete registeredFunctions[key];
  }
}

/**
 * Checks if a script method is properly registered. Logs an error if not.
 * @param method Script method specification (name and return type)
 * @returns If a method of that name is registered
 */
export function VerifyRegisteredScriptMethod(method: ScriptMethodDef): boolean {
  if (!(method.Name in registeredFunctions)) {
    console.error(
      `Script method ${method.Name} is used in this Articy Database but is not registered in code!`
    );
    return false;
  }

  return true;
}

type FeatureExecutionHandler<Feature extends FeatureProps = FeatureProps> = (
  db: Database,
  feature: Feature,
  node: BaseFlowNode,
  state: GameFlowState
) => Variable | void | ScriptGenerator;
const featureHandlers: Map<string, FeatureExecutionHandler[]> = new Map();

/**
 * Registers a handler function called whenever a node with a given feature is executed in [[advanceGameFlowState]].
 * @param name Technical name of the feature
 * @param handler Function to call
 */
export function RegisterFeatureExecutionHandler<Feature extends FeatureProps>(
  name: string,
  handler: FeatureExecutionHandler<Feature>
): void {
  if (!featureHandlers.has(name)) {
    featureHandlers.set(name, [handler as FeatureExecutionHandler]);
  } else {
    featureHandlers.get(name)?.push(handler as FeatureExecutionHandler);
  }
}

type TemplateExecutionHandler<
  Template extends TemplateProps = TemplateProps
> = (
  db: Database,
  template: Template,
  node: BaseFlowNode<FlowObjectProps, Template>,
  state: GameFlowState
) => Variable | void | ScriptGenerator;
const templateHandlers: Map<string, TemplateExecutionHandler[]> = new Map();

/**
 * Registers a handler function called whenever a node with a given template is executed in [[advanceGameFlowState]].
 * @param name Template technical name
 * @param handler Function to call
 */
export function RegisterTemplateExecutionHandler<
  Template extends TemplateProps
>(name: string, handler: TemplateExecutionHandler<Template>): void {
  if (!templateHandlers.has(name)) {
    templateHandlers.set(name, [handler as TemplateExecutionHandler]);
  } else {
    templateHandlers.get(name)?.push(handler as TemplateExecutionHandler);
  }
}

/**
 * Calls all registered feature handlers for a node
 * @param node Node to call feature handlers for
 * @param state Current flow state
 */
export function OnNodeExecution(
  node: BaseFlowNode,
  state: GameFlowState
): void {
  if (!node.template) {
    return;
  }

  // Iterate all its features
  for (const key of Object.keys(node.template ?? {})) {
    // Check if we have a handler for that feature
    const handlers = featureHandlers.get(key);
    if (!handlers) {
      continue;
    }

    // If so, run handlers
    const feature = node.template[key];
    for (const handler of handlers) {
      const returnValue = handler(node.db, feature, node, state);
      if (typeof returnValue === 'object') {
        queueGeneratedActions(returnValue, false);
      }
    }
  }

  // Check its template
  const myTemplateHandlers = templateHandlers.get(node.type);
  if (myTemplateHandlers) {
    // Iterate handlers
    for (const handler of myTemplateHandlers) {
      const returnValue = handler(node.db, node.template, node, state);
      if (typeof returnValue === 'object') {
        queueGeneratedActions(returnValue, false);
      }
    }
  }
}

/**
 * Clears all registered feature handlers
 */
export function ClearRegisteredFeatureHandlers(): void {
  featureHandlers.clear();
}

/**
 * Clears all registered template handlers
 */
export function ClearRegisteredTemplateHandlers(): void {
  templateHandlers.clear();
}

// Removes all comments from a script
function scrubComments(script: string): string {
  return script.replace(/(\/\/.*$)|(\/\*(.|[\r\n])*\*\/)/gm, '').trim();
}

type MaybeSpeaker = { Speaker?: Id } & ArticyObjectProps;

export function runScriptRaw(
  script: string | undefined,
  variables: VariableStore,
  visits: VisitSet,
  caller: Id,
  db: Database,
  returns: boolean,
  shadowing: boolean
) {
  // No script? Return true.
  if (!script || script === '') {
    return true;
  }

  // Clean up comments
  script = scrubComments(script);

  // No script? Return true.
  if (!script || script === '') {
    return true;
  }

  // Get variable names
  const names = Array.from(Object.keys(variables));

  // Get functio names
  const funcNames = Array.from(Object.keys(registeredFunctions));

  // Create a function which takes all the variable sets its arguments
  // eslint-disable-next-line no-new-func
  const func = new Function(
    'window',
    'self',
    'speaker',
    ...names,
    ...funcNames,
    `"use strict"; ${returns ? 'return' : ''} ${script}`
  );

  // Create game context object
  const context: Context = {
    caller,
    db,
    variables,
    visits,
    state,
  };

  // Figure out speaker variable
  const speaker: Id | undefined = db.getModel<MaybeSpeaker>(caller)?.Properties
    ?.Speaker;

  // Call the function with the variable sets
  return func.call(
    undefined,
    undefined,
    caller,
    speaker,
    ...names.map(n => variables[n]),
    ...funcNames.map(f =>
      wrapScriptFunction(registeredFunctions[f], context, shadowing)
    )
  );
}

/**
 * Runs a condition or instruction script
 * @param script Script to run
 * @param variables Global variable store
 * @param visits Visit set information
 * @param caller Id of the node calling this function
 * @param db Database
 * @param returns Is this script expected to return a boolean?
 * @returns Whether the script returned a truthy value.
 */
export function runScript(
  script: string | undefined,
  variables: VariableStore,
  visits: VisitSet,
  caller: Id,
  db: Database,
  returns: boolean,
  shadowing: boolean
): boolean {
  // Run script and get raw result
  const result = runScriptRaw(
    script,
    variables,
    visits,
    caller,
    db,
    returns,
    shadowing
  );

  // Evaluate as boolean
  return result === true;
}
