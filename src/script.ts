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
import { BaseFlowNode, ExecuteContext } from './flowTypes';
import { GameFlowState, VisitSet } from './iterator';
import { Variable, VariableStore } from './variables';

export interface ExtensionTypes {}
export type ApplicationState = ExtensionTypes extends {
  ApplicationState: unknown;
}
  ? ExtensionTypes['ApplicationState']
  : unknown;

// Context passed as the first argument to every script method
type Context = {
  /** Id of the caller (or @see NullId if called outside a node) */
  caller: Id;

  /** Visit information */
  visits: VisitSet;

  /** Variable state */
  variables: VariableStore;

  /** Database */
  db: Database;

  /** Custom application state */
  state: Readonly<ApplicationState> | undefined;
};

// Generator which queues script reducers until finally returning a variable value
type ScriptGenerator = Generator<AnyAction, Variable | void, undefined>;

// Used internally. This is the signature used by the actual Articy Expresso scripts
type ScriptFunctionInternal = (...args: Variable[]) => Variable | void;

// Signature of script functions you can register. They must either return a value OR generate script reducers
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

/**
 * Gives articy script function handlers access to the Redux store and the ability to return Redux actions to queue
 */
type createMiddlewareFunction = (
  finalizeAction?: ActionCreatorWithPayload<AnyAction>
) => Middleware;
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
 * Registers a Javascript function so it can be called from Articy
 * @param name Function name (used in Articy)
 * @param func Function
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

/** Checks if a script method is properly registered. Logs an error if not. */
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
 * Registers a handler function called whenever a node with a given feature is executed in flow.
 * @param name Feature name
 * @param handler Handler to register
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
 * Registers a handler function called whenever a node with a given template is executed in flow.
 * @param name Template name
 * @param handler Handler to register
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
 * @param node Flow node
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

function runScriptRaw(
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
  //const speaker: Id|undefined = db.isOfType(caller, DialogueFragment) ? db.getProperties<DialogueFragmentProps>(caller)?.Speaker : undefined;

  const speaker: Id | undefined = db.getProperties<MaybeSpeaker>(caller)
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

const SequenceRegex: RegExp = /{((!?[A-Za-z0-9.]+:)|([!~&]))?([^|]*)((\|([^|]*))*)}/g;

enum SequenceType {
  Stopping,
  Cycle,
  Shuffle,
  OnlyOnce,
  Conditional,
}

function ParseSequenceType(type: string): SequenceType {
  if (type === undefined) {
    return SequenceType.Stopping;
  }

  if (type.endsWith(':')) {
    return SequenceType.Conditional;
  }

  switch (type) {
    case '!':
      return SequenceType.OnlyOnce;
    case '~':
      return SequenceType.Shuffle;
    case '&':
      return SequenceType.Cycle;
  }

  throw new Error(`Unexpected sequence identifier: ${type}`);
}

function processSequence(
  type: SequenceType,
  typeString: string,
  alternates: string[],
  caller: Id,
  context: ExecuteContext,
  db: Database
): string {
  // SPECIAL CASE: If this is a stopping list with no alternates, evaluate it as a print
  if (
    type === SequenceType.Stopping &&
    typeString === undefined &&
    alternates.length === 1
  ) {
    const evaluated = runScriptRaw(
      alternates[0],
      context.variables,
      context.visits,
      caller,
      db,
      true,
      false
    );
    return `${evaluated}`;
  }

  let index = -1;
  const visits = context.visits.counts[caller] ?? 0;
  switch (type) {
    case SequenceType.Stopping:
      index = Math.min(visits, alternates.length - 1);
      break;
    case SequenceType.Cycle:
      index = visits % alternates.length;
      break;
    case SequenceType.OnlyOnce:
      index = visits;
      if (index >= alternates.length) {
        return '';
      }
      break;
    case SequenceType.Shuffle:
      // TODO - Prevent repeats until you've hit every item once
      index = Math.floor(Math.random() * alternates.length);
      break;
    case SequenceType.Conditional:
      // Evaluate
      const cond = typeString.substr(0, typeString.length - 1);
      const result = runScript(
        cond,
        context.variables,
        context.visits,
        caller,
        db,
        true,
        false
      );
      index = result ? 0 : 1;
      if (index >= alternates.length) {
        return '';
      }
  }

  return alternates[index];
}

function splitAlternatesList(list: string): string[] {
  const result: string[] = [];

  let start = 0;
  let depth = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '{') {
      depth++;
    } else if (list[i] === '}' && depth > 0) {
      depth--;
    } else if (list[i] === '|' && depth === 0) {
      result.push(list.substr(start, i - start));
      start = i + 1;
    }
  }

  result.push(list.substr(start));

  return result;
}

/**
 * Takes text and parses it for inline scripts and lists that match Inkle Ink's "Lists" and "Variable Printing" syntax.
 * See https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md#1-basic-lists
 * And https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md#printing-variables
 * @param text Text to process for inline scripts
 * @param context Execution context (includes variables and visit counts)
 * @param caller ID of the node this text is from (used for script execution)
 * @param db Parent database (used for script execution)
 * @returns The input text where all inline scripts are replaced with their values
 */
export function processInlineScripts(
  text: string,
  context: ExecuteContext,
  caller: Id,
  db: Database
): string {
  // Collect all regex matches
  const matches: RegExpExecArray[] = [];
  while (true) {
    const match = SequenceRegex.exec(text);
    if (match === null) {
      break;
    }
    matches.push(match);
  }

  // Iterate through matches and process
  let index = 0;
  const output: string[] = [];
  for (const match of matches) {
    // Add text preceeding match to output (if available)
    const startIndex = match.index;
    if (index !== startIndex) {
      output.push(text.substr(index, startIndex - index));
    }

    // Get sequence type
    const type = ParseSequenceType(match[1]);

    // Get the alternates list
    const alternatives = splitAlternatesList(
      [match[4], match[5]].filter(m => m !== undefined).join('')
    );

    // Process the match
    let processedText = processSequence(
      type,
      match[1],
      alternatives,
      caller,
      context,
      db
    );

    // Recurse (processed match might have generated new {} blocks)
    processedText = processInlineScripts(processedText, context, caller, db);

    // Add process result to output
    output.push(processedText);

    // Increment index
    index = match.index + match[0].length;
  }

  // Add text after last match to output
  if (index !== text.length) {
    output.push(text.substr(index));
  }

  // Return combined output
  return output.join('');
}
