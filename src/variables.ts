/** Types of variables supported by Articy */
export type Variable = string | number | boolean;

/**
 * Represents all values in a variable namespace
 */
export interface VariableNamespace {
  [name: string]: Variable;
}

/** Stores all global variables for the game */
export interface VariableStore {
  [name: string]: VariableNamespace;
}
