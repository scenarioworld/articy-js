import { Database } from './database';
import { IParseOptions, IFileRange } from './inline_peggy';
import { ExecuteContext } from './flowTypes';
import { Id } from './json';
import { runScript, runScriptRaw } from './script';

export enum SequenceType {
  Stopping,
  Cycle,
  Shuffle,
  OnlyOnce,
}

export interface IEmbedScriptParseOptions extends IParseOptions {
  caller: Id;
  context: ExecuteContext;
  db: Database;
}

export type SequenceEmbedType = { type: SequenceType };
export type ExprEmbedType = { expr: string };
export type EmbedType = null | ExprEmbedType | SequenceEmbedType;
export type Argument = Partial<ExprEmbedType> & {
  value?: string;
  full: string;
  location: IFileRange;
};

export function processEmbed(
  type: EmbedType,
  alternatives: Argument[],
  multiline: boolean,
  options: IEmbedScriptParseOptions,
  expected: (desc: string, loc?: IFileRange) => void
): string {
  const { context, caller, db } = options;

  // SPECIAL CASE: If this is a stopping list with no alternates, evaluate it as a print
  if (type === null && alternatives.length === 1 && !multiline) {
    const evaluated = runScriptRaw(
      alternatives[0].full,
      options.context.variables,
      context.visits,
      caller,
      db,
      true,
      false
    );
    return `${evaluated}`;
  }

  // SPECIAL: If this has no type we're a multi-line, evaluate as a select list
  if (multiline && type === null) {
    for (const arg of alternatives) {
      // Make sure it has a condition
      if (!arg.expr || !arg.value) {
        expected(`a condition ending with a ':'`, arg.location);
        return '';
      }

      // Evaluate else
      if (arg.expr.toLowerCase().trim() === 'else') {
        return arg.value;
      }

      // Evaluate condition
      if (
        runScript(
          arg.expr,
          context.variables,
          context.visits,
          caller,
          db,
          true,
          false
        )
      ) {
        return arg.value;
      }
    }

    // No branches match
    return '';
  }

  // No type means a stopping list
  if (type === null) {
    type = { type: SequenceType.Stopping };
  }

  // Figure out what to do
  let index = -1;

  // If it's a sequence type
  if ('type' in type) {
    // Make decision based on type and sequence
    const visits = context.visits.counts[caller] ?? 0;
    switch (type.type) {
      case SequenceType.Stopping:
        index = Math.min(visits, alternatives.length - 1);
        break;
      case SequenceType.Cycle:
        index = visits % alternatives.length;
        break;
      case SequenceType.OnlyOnce:
        index = visits;
        if (index >= alternatives.length) {
          return '';
        }
        break;
      case SequenceType.Shuffle:
        // TODO - Prevent repeats until you've hit every item once
        index = Math.floor(Math.random() * alternatives.length);
        break;
    }
  } else {
    // Otherwise, it must be a condition. Evaluate the condition
    const result = runScript(
      type.expr,
      context.variables,
      context.visits,
      caller,
      db,
      true,
      false
    );
    index = result ? 0 : 1;
    if (index >= alternatives.length) {
      return '';
    }
  }

  // Return the appropriate argument
  return alternatives[index].full;
}
