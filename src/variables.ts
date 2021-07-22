/**
 * Union of types that the value of an Articy Global Variable may have. See [[VariableNamespace]].
 */
export type Variable = string | number | boolean;

/**
 * A dictionary of variable names to values in a Global Variable Namespace. See [[VariableStore]].
 */
export interface VariableNamespace {
  [name: string]: Variable;
}

/**
 * A dictionary of namespace names to namespaces. Used as the root global variable store.
 */
export interface VariableStore {
  [name: string]: VariableNamespace;
}
