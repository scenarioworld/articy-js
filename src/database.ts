import {
  ArticyData,
  ArticyObjectProps,
  EnumDefinition,
  FlowFragmentProps,
  HierarchyEntry,
  Id,
  ModelData,
  TemplateProps,
} from './json';
import { v4 as uuidv4 } from 'uuid';
import { ArticyCreatorArguments, ArticyObjectCreator } from './object';
import { VerifyRegisteredScriptMethod } from './script';
import { Variable, VariableNamespace, VariableStore } from './variables';

// Resolve an asset to a real path
type ResolveAssetPath = (assetRef: string) => string | null | undefined;

/** Database that contains all articy data loaded from a JSON file */
export class Database {
  /** Raw data loaded from data.json file */
  private readonly _data: ArticyData;

  /** Map of IDs to Object Model Data (built from data file) */
  private readonly _lookup: Map<Id, ModelData> = new Map();

  /** Map of type names to base class names. Useful if the Articy project uses a template that isn't defined in JS */
  private readonly _classes: Map<string, string> = new Map();

  /** Map of enumerations defined in this database */
  private readonly _enums: Map<string, EnumDefinition> = new Map();

  /** Map of objects to their hierarchy entries */
  private readonly _hierarchy: Map<Id, HierarchyEntry> = new Map();

  /** Looks up asset files */
  private readonly _assetResolver?: ResolveAssetPath;

  /** Unique database instance ID */
  public readonly guid: string;

  constructor(data: ArticyData, assetResolver?: ResolveAssetPath) {
    // Store articy database
    this.guid = uuidv4();
    this._data = data;
    this._assetResolver = assetResolver;

    // Iterate object definitions and create a map of type names to base class names
    for (const def of this._data.ObjectDefinitions) {
      // Special: cache enums in a lookup
      if (def.Class === 'Enum') {
        this._enums.set(def.Type, def as EnumDefinition);
      } else {
        this._classes.set(def.Type, def.Class);
      }
    }

    // Iterate packages
    for (const pkg of this._data.Packages) {
      // Iterate models
      for (const model of pkg.Models) {
        // Add model to lookup based on its ID
        this._lookup.set(model.Properties.Id, model);

        // Add children pins (if applicable)
        // TODO: Any way to generalize this? Kinda hacky.
        if (
          'InputPins' in model.Properties ||
          'OutputPins' in model.Properties
        ) {
          const flowDef = model.Properties as FlowFragmentProps;
          if (flowDef.InputPins) {
            for (const pin of flowDef.InputPins) {
              this._lookup.set(pin.Id, { Type: 'InputPin', Properties: pin });
            }
          }
          if (flowDef.OutputPins) {
            for (const pin of flowDef.OutputPins) {
              this._lookup.set(pin.Id, { Type: 'OutputPin', Properties: pin });
            }
          }
        }
      }
    }

    // Iterate hierarchy
    this.processHierarchy(this._data.Hierarchy);
  }

  private processHierarchy(entry: HierarchyEntry): void {
    // Store this entry
    this._hierarchy.set(entry.Id, entry);

    // Iterate children
    if (entry.Children) {
      for (const child of entry.Children) {
        this.processHierarchy(child);
      }
    }
  }

  /**
   * Returns the display name for a given enum value
   * @param type Enum technical name
   * @param value Numeric enumeration value
   */
  public getEnumValueDisplayName(
    type: string,
    value: number
  ): string | undefined {
    // Lookup enum
    const def = this._enums.get(type);
    if (!def) {
      return undefined;
    }

    // Get technical name of value
    for (const key of Object.keys(def.Values)) {
      // We've found it!
      if (def.Values[key] === value) {
        return def.DisplayNames[key];
      }
    }

    // Failure
    return undefined;
  }

  /** Returns all children of an object */
  public getChildren(objectId: Id): Id[] {
    // Get hierarchy entry
    const entry = this._hierarchy.get(objectId);
    if (!entry) {
      return [];
    }

    // Map child list to Ids
    return (entry.Children ?? []).map(child => child.Id);
  }

  /** Returns all children of a given type */
  public getChildrenOfType<ObjectType>(
    objectId: Id,
    creator: ArticyObjectCreator<ObjectType>
  ): ObjectType[] {
    return this.getChildren(objectId)
      .map(id => this.getObject<ObjectType>(id, creator))
      .filter(obj => obj !== undefined) as ObjectType[];
  }

  /**
   * Quick object type check
   * @param id Object ID
   * @param creator Type to check against
   */
  public isOfType(id: Id, creator: ArticyObjectCreator): boolean {
    // Get def
    const def = this._lookup.get(id);
    if (!def) {
      return false;
    }

    // Check if it maps to this creator
    if (this.getCreator(def.Type) === creator) {
      return true;
    }

    // Check if it inherits from it
    if (
      this.isType(def.Type, Database.InverseRegisteredTypes.get(creator) ?? '')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Creates a new global variable store with initial values loaded from the database
   */
  public newVariableStore(): VariableStore {
    // Create a new variable store
    const store: VariableStore = {};

    // Iterate namespaces
    for (const ns of this._data.GlobalVariables) {
      // Create set
      const set: VariableNamespace = {};

      // Fill the set with values
      for (const v of ns.Variables) {
        // Get value based on type
        let value: Variable | undefined = undefined;
        switch (v.Type) {
          case 'Boolean':
            value = v.Value === 'True';
            break;
          case 'Integer':
            value = parseInt(v.Value);
            break;
          case 'String':
            value = v.Value;
            break;
        }

        // Couldn't figure out type
        if (value === undefined) {
          console.log(
            `Failed to parse variable ${ns.Namespace}.${v.Variable}'s type: ${v.Type}`
          );
          continue;
        }

        // Set default value
        set[v.Variable] = value;
      }

      // Load set into store
      store[ns.Namespace] = set;
    }

    return store;
  }

  /**
   * Checks if type is an instance of another type
   * @param type Type name
   * @param other Type or base type name
   */
  public isType(type: string, other: string | string[]): boolean {
    other = Array.isArray(other) ? other : [other];
    for (const otherType of other) {
      // If same, return true
      if (type === otherType) {
        return true;
      }

      // Check if other is the base of type
      if (this._classes.get(type) === otherType) {
        return true;
      }
    }

    return false;
  }

  /** Lookup the properties block of an object */
  public getProperties<PropsType extends ArticyObjectProps>(
    id: Id
  ): PropsType | undefined {
    const def = this._lookup.get(id);
    if (!def) {
      return undefined;
    }

    return def.Properties as PropsType;
  }

  /**
   * Gets all property blocks for objects of a given type
   * @param type Type name
   */
  public getPropertiesOfType<PropsType extends ArticyObjectProps>(
    type: string
  ): PropsType[] {
    const results: PropsType[] = [];
    for (const [, model] of this._lookup) {
      if (model.Type === type) {
        results.push(model.Properties as PropsType);
      }
    }
    return results;
  }

  /**
   * Loads an Articy Object into a given JS class (with type safety)
   * @param id Object ID
   * @param type JS Articy Object Type to load as
   * @returns a type of ObjectType or undefined if there is a type-mismatch or the object can't be found
   */
  public getObject<ObjectType>(
    id: Id | null | undefined,
    type: ArticyObjectCreator<ObjectType>
  ): ObjectType | undefined {
    if (!id) {
      return undefined;
    }

    // Get definition
    const def = this._lookup.get(id);

    // If not found, return
    if (!def) {
      return undefined;
    }

    // Find a creator
    const creator = this.getCreator(def.Type);
    if (!creator) {
      return undefined;
    }

    // Create construction arguments
    const args: ArticyCreatorArguments<ArticyObjectProps, TemplateProps> = {
      props: def.Properties,
      template: def.Template,
      model: def,
      type: def.Type,
      db: this,
    };

    // Create using constructor
    const inst = new creator(args);

    // Guarantee type safety
    if (inst instanceof type) {
      return inst;
    }

    // Not the right type. Return null.
    return undefined;
  }

  private getCreator(name: string): ArticyObjectCreator | undefined {
    // Try to find a creator for this type
    const creator = Database.RegisteredTypes.get(name);
    if (creator) {
      return creator;
    }

    // If none, try its base class
    const base = this._classes.get(name);
    if (!base) {
      return undefined;
    }

    return Database.RegisteredTypes.get(base);
  }

  /**
   * Returns all models of a given type (or that derive from that type)
   * @param type Type string
   */
  public getModelsOfType<
    PropType extends ArticyObjectProps,
    TemplateType extends TemplateProps = TemplateProps
  >(type: string | string[]): ModelData<PropType, TemplateType>[] {
    const results: ModelData<PropType, TemplateType>[] = [];
    for (const model of this._lookup.values()) {
      if (this.isType(model.Type, type)) {
        results.push(model as ModelData<PropType, TemplateType>);
      }
    }
    return results;
  }

  /**
   * Returns the type string of a given object ID
   * @param id Object ID to lookup
   */
  public getType(id: Id | null | undefined): string | undefined {
    if (!id) {
      return undefined;
    }

    return this._lookup.get(id)?.Type;
  }

  /**
   * Returns the actual filename for an asset
   * @param assetId Asset Id
   */
  public getAssetFilename(assetId: Id | undefined): string | null {
    if (!assetId) {
      return null;
    }

    // Get definition
    const def = this._lookup.get(assetId);
    if (!def) {
      return null;
    }

    // Resolve
    return this.resolveAssetFilename(def.AssetRef);
  }

  /**
   * Resolves the full filename of an asset given a ref
   * @param assetRef Asset Reference
   */
  public resolveAssetFilename(assetRef: string | undefined): string | null {
    if (!assetRef || !this._assetResolver) {
      return null;
    }

    return this._assetResolver(assetRef) ?? null;
  }

  /**
   * Prints errors if script methods are not properly registered for this database
   */
  public verifyScriptFunctions(): void {
    // Verify each script method
    this._data.ScriptMethods.forEach(VerifyRegisteredScriptMethod);
  }

  public static readonly RegisteredTypes: Map<
    string,
    ArticyObjectCreator
  > = new Map();
  public static readonly InverseRegisteredTypes: Map<
    ArticyObjectCreator,
    string
  > = new Map();
}

/**
 * Registers a javascript class to be instantiated whenever encountering an Articy object of a given type
 * @param name Type name (must match the Template's Technical Name or Class Name in Articy)
 * @param creator Constructor that creates objects of this type
 */
export function RegisterDatabaseTypeClass<ObjectType>(
  name: string,
  creator: ArticyObjectCreator<ObjectType>
): void {
  Database.RegisteredTypes.set(name, creator as ArticyObjectCreator);
  Database.InverseRegisteredTypes.set(creator as ArticyObjectCreator, name);
}

/**
 * Decorator alternative to @see RegisterDatabaseTypeClass
 * Add on top of classes you want to register as Articy Database Types
 * @param name Type name (must match the Template's Technical Name or Class Name in Articy)
 */
export function ArticyType(name: string) {
  return (constructor: ArticyObjectCreator) =>
    RegisterDatabaseTypeClass(name, constructor);
}
