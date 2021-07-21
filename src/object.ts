import { Id, ModelData } from './json';
import { Database } from './database';

/**
 * Null ID. Never maps to a real node in the [[Database]].
 */
export const NullId: Id = '0x0000000000000000';

/**
 * Arguments past to the constructor of a [[ArticyObject]] created through [[Database.getObject]].
 */
export interface ArticyCreatorArguments<
  PropertiesType = any,
  TemplateType = any
> {
  /** Properties block from the JSON */
  props: PropertiesType;

  /** Template properties from the JSON */
  template?: TemplateType;

  /** Full model (may incl. other info) */
  model?: ModelData | undefined;

  /** Template name (or base class if not a template) */
  type: string;

  /** Owning database */
  db: Database;
}

/**
 * Constructor type for [[ArticyObject]] and any of its subclasses.
 */
export type ArticyObjectCreator<ObjectType = unknown> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (args: ArticyCreatorArguments) => ObjectType;
