import { Database, Id } from '.';
import { parse } from './inline_peggy';
import { IEmbedScriptParseOptions } from './inline_util';
import { ExecuteContext } from './flowTypes';

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
  // Create options aray
  const options: IEmbedScriptParseOptions = {
    context,
    caller,
    db,
  };

  // Parse
  return parse(text, options);
}
