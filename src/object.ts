import { Id, ModelData } from "ArticyJSON";
import { Database } from "./database";

/** Null ID */
export const NullId: Id = "0x0000000000000000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ArticyCreatorArguments<PropertiesType = any, TemplateType = any>
{
    /** Construction properties */
    props: PropertiesType;

    /** Template properties */
    template?: TemplateType;

    /** Full model (may incl. other info) */
    model?: ModelData|undefined;

    /** Template name (or base class if not a template) */
    type: string;

    /** Parent database */
    db: Database;
}

/** Articy object creator */
export type ArticyObjectCreator<ObjectType = unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    = new(args: ArticyCreatorArguments) => ObjectType;