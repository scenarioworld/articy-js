import {
  ArticyData,
  ArticyObjectProps,
  EnumDefinition,
  FeatureProps,
  FlowFragmentProps,
  GlobalFeatures,
  HierarchyEntry,
  Id,
  ModelData,
  ObjectDefinition,
  TemplateProps,
} from './json';
import { ArticyCreatorArguments, ArticyObjectCreator } from './object';
import { VerifyRegisteredScriptMethod } from './script';
import { Variable, VariableNamespace, VariableStore } from './variables';
import { TemplateExtension } from './types';
import {
  Localization,
  LocalizeDefinition,
  LocalizeProperties,
} from './localization';
import { Project } from '.';

// Resolve an asset to a real path
type ResolveAssetPath = (assetRef: string) => string | null | undefined;

/**
 * A read-only Database wrapping data loaded from a JSON file exported from Articy.
 *
 * Most applications will only have one global database instance containing all their story data.
 * The easiest way to manage a database object is to export it from its own module, like so:
 * ```typescript
 * // Example GameDB.ts
 *
 * // Import data from the exported json
 * import GameData from "./exported.articy.json";
 * import { Database } from "articy-js";
 *
 * // Create a new database
 * const GameDB = new Database(GameData)
 *
 * // Export the database
 * export default GameDB;
 * ```
 *
 * Then you can access it easily via an import statement like
 * ```typescript
 * import GameDB from "GameDB"
 * ```
 *
 * Access objects like Entities, Flow Fragments, or Locations by Id using [[getObject]].
 * Accessed objects will be automatically wrapped in classes registered via [[RegisterDatabaseTypeClass]] or [[ArticyType]].
 */
export class Database {
  /** Raw data loaded from data.json file */
  private readonly _data: ArticyData;

  /** Map of IDs to Object Model Data (built from data file) */
  private readonly _lookup: Map<Id, ModelData> = new Map();

  /** Map of technical IDs to GUIDs */
  private readonly _technical: Map<string, Id> = new Map();

  /** Map of type names to base class names. Useful if the Articy project uses a template that isn't defined in JS */
  private readonly _definitions: Map<string, ObjectDefinition> = new Map();

  /** Map of objects to their hierarchy entries */
  private readonly _hierarchy: Map<Id, HierarchyEntry> = new Map();

  /** Map of objects to their parents */
  private readonly _parents: Map<Id, Id> = new Map();

  /** Looks up asset files */
  private readonly _assetResolver?: ResolveAssetPath;

  /** Unique database instance ID */
  public readonly guid: string;

  /** Localization provider. Use this to switch the active language or to manually request the localized value of a string. */
  public readonly localization: Localization = new Localization();

  /** Is this project using localization */
  private readonly _isLocalized: boolean;

  /**
   * Creates a new database from data loaded from an Articy JSON file
   * @param data JS object parsed from a Articy JSON file
   * @param assetResolver A function that resolves asset reference paths from the Articy JSON into real paths on the disk/web
   */
  constructor(data: ArticyData, assetResolver?: ResolveAssetPath) {
    // Store articy database
    this._data = data;
    this.guid = data.Project.Guid;
    this._assetResolver = assetResolver;

    // Iterate object definitions and create a map of type names to definitions
    for (const def of this._data.ObjectDefinitions) {
      this._definitions.set(def.Type, def);
    }

    // Iterate packages
    for (const pkg of this._data.Packages) {
      // Iterate models
      for (const model of pkg.Models) {
        // Add model to lookup based on its ID
        this._lookup.set(model.Properties.Id, model);
        this._technical.set(
          model.Properties.TechnicalName,
          model.Properties.Id
        );

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
              this._technical.set(pin.TechnicalName, pin.Id);
            }
          }
          if (flowDef.OutputPins) {
            for (const pin of flowDef.OutputPins) {
              this._lookup.set(pin.Id, { Type: 'OutputPin', Properties: pin });
              this._technical.set(pin.TechnicalName, pin.Id);
            }
          }
        }
      }
    }

    // Iterate hierarchy
    this.processHierarchy(this._data.Hierarchy);

    // Track localization
    this._isLocalized = this._data.Settings.set_Localization === 'True';
  }

  /**
   * Gets information about the loaded project (name, guid, etc.)
   */
  public get project(): Project {
    return this._data.Project;
  }

  private processHierarchy(entry: HierarchyEntry): void {
    // Store this entry
    this._hierarchy.set(entry.Id, entry);

    // Iterate children
    if (entry.Children) {
      for (const child of entry.Children) {
        this.processHierarchy(child);

        // Set parent
        this._parents.set(child.Id, entry.Id);
      }
    }
  }

  /**
   * Returns the display name for a given enum value
   * @param type Enum technical name
   * @param value Numeric enumeration value
   * @returns Display name for that enum value
   */
  public getEnumValueDisplayName(
    type: string,
    value: number
  ): string | undefined {
    // Lookup enum
    const def = this._definitions.get(type);
    if (!def || def.Class !== 'Enum') {
      return undefined;
    }

    // Get technical name of value
    for (const key of Object.keys(def.Values)) {
      // We've found it!
      if (def.Values[key] === value) {
        return this._isLocalized
          ? this.localization.get(def.DisplayNames[key])
          : def.DisplayNames[key];
      }
    }

    // Failure
    return undefined;
  }

  /**
   * Gets the definition of a given template/class type
   * @param type Type name
   * @returns Definition from Articy JSON, including specifications for its properties and features
   */
  public getDefinition(type: string): ObjectDefinition | undefined {
    const def = this._definitions.get(type);
    if (!def) {
      return undefined;
    }
    return this.localizeDefinition(def);
  }

  /**
   * Finds an object's parent in the hierarchy
   * @param objectId Id of the object to get the parent of
   * @returns That ID of that object's parent, or null if there is none.
   */
  public getParent(objectId: Id): Id | null {
    return this._parents.get(objectId) ?? null;
  }

  /**
   * Gets the IDs of all children of a given object
   * @param objectId Object ID
   * @returns IDs of all its children
   */
  public getChildren(objectId: Id): Id[] {
    // Get hierarchy entry
    const entry = this._hierarchy.get(objectId);
    if (!entry) {
      return [];
    }

    // Map child list to Ids
    return (entry.Children ?? []).map(child => child.Id);
  }

  /**
   * Returns a list of children of a given node that match a given type
   * @param objectId Object ID
   * @param creator Type class to match against
   * @returns All children of the object that match the type
   */
  public getChildrenOfType<ObjectType>(
    objectId: Id,
    creator: ArticyObjectCreator<ObjectType>
  ): ObjectType[] {
    return this.getChildren(objectId)
      .map(id => this.getObject<ObjectType>(id, creator))
      .filter(obj => obj !== undefined) as ObjectType[];
  }

  /**
   * Quick check to see if a given object is of a given type
   * @param id Object ID to check
   * @param type Type to check against (can either be the technical name of the type like "FlowFragment" or a registered class like FlowFragment)
   * @returns true if the object is of that type (or of a type that derives from it)
   */
  public isOfType(id: Id, type: ArticyObjectCreator | string): boolean {
    // Get def
    const def = this._lookup.get(id);
    if (!def) {
      return false;
    }

    // If we're testing against a string
    if (typeof type === 'string') {
      return def.Type === type || this.isType(def.Type, type);
    }

    // Otherwise, check if the mapped creator matches
    if (this.getCreator(def.Type) === type) {
      return true;
    }

    // The creator may not match, but it's possible that this is the base type of the creator
    if (
      this.isType(def.Type, Database.InverseRegisteredTypes.get(type) ?? '')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Creates a new global variable store with initial values loaded from the database.
   * @returns A variable store
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
   * @returns If the types are equal or the type derives from the other type
   */
  public isType(type: string, other: string | string[]): boolean {
    other = Array.isArray(other) ? other : [other];
    for (const otherType of other) {
      // If same, return true
      if (type === otherType) {
        return true;
      }

      // Check if other is the base of type
      if (this._definitions.get(type)?.Class === otherType) {
        return true;
      }
    }

    return false;
  }

  /**
   * Loads an Articy Object into a given JS class by technical name (with type safety). Similar to [[getObject]] but uses the TechnicalName.
   * @param technicalName Technical name to search by
   * @param type Object type
   * @returns Object, or undefined if no object has that technical name or it doesn't match the given type
   */
  public getObjectByTechnicalName<ObjectType>(
    technicalName: string,
    type: ArticyObjectCreator<ObjectType>
  ): ObjectType | undefined {
    const id = this._technical.get(technicalName);
    if (!id) {
      return undefined;
    }

    return this.getObject<ObjectType>(id, type);
  }

  /**
   * Loads an Articy Object wrapped in a registered Javascript class associated with the type. See [[ArticyType]] and [[RegisterDatabaseTypeClass]].
   *
   * A note about types: `getObject` will always return an instance of the most specific
   * registered class type associated with the requested data, regardless of the value of the `type` parameter.
   * The `type` parameter predominately functions as a type check. The method returns `undefined` if the parameter in `type`
   * is not equal to or a base class of the registered type.
   * @param id Object ID
   * @param type Constructor for the registered class to wrap the object with
   * @typeparam ObjectType Type returned by the constructor in the `type` parameter
   * @returns an instance of `ObjectType` or undefined if there is a type-mismatch or the object can't be found
   */
  public getObject<ObjectType>(
    id: Id | null | undefined,
    type: ArticyObjectCreator<ObjectType>
  ): ObjectType | undefined {
    if (!id) {
      return undefined;
    }

    // Get definition
    let def = this._lookup.get(id);

    // If not found, return
    if (!def) {
      return undefined;
    }

    // Find a creator
    const creator = this.getCreator(def.Type);
    if (!creator) {
      return undefined;
    }

    // Localize model
    def = this.localizeModel(def);

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
    const base = this._definitions.get(name);
    if (!base) {
      return undefined;
    }

    return Database.RegisteredTypes.get(base.Class);
  }

  /**
   * Returns the properties block of an object
   * @typeParam PropType Properties block interface
   * @typeParam TemplateType Template block interface
   * @param id Object ID
   * @returns Model
   */
  public getModel<
    PropType extends ArticyObjectProps,
    TemplateType extends TemplateProps = TemplateProps
  >(id: Id): ModelData<PropType, TemplateType> | undefined {
    const def = this._lookup.get(id);
    if (!def) {
      return undefined;
    }

    return this.localizeModel(def) as ModelData<PropType, TemplateType>;
  }

  /**
   * Returns all models of a given type (or that derive from that type).
   * A model is just an object that contains both the properties block and the template block.
   * @typeParam PropType Properties block interface
   * @typeParam TemplateType Template block interface
   * @param type Type string
   */
  public getModelsOfType<
    PropType extends ArticyObjectProps,
    TemplateType extends TemplateProps = TemplateProps
  >(type: string | string[]): ModelData<PropType, TemplateType>[] {
    const results: ModelData<PropType, TemplateType>[] = [];
    for (const model of this._lookup.values()) {
      if (this.isType(model.Type, type)) {
        results.push(
          this.localizeModel(model as ModelData<PropType, TemplateType>)
        );
      }
    }
    return results;
  }

  /**
   * Finds all models whose template has a given feature
   * @typeParam Feature Interface of the feature type
   * @typeParam FeatureName Name of the feature to improve return type deduction
   * @param featureName Name of the feature in the template
   * @returns All models whose templates contain the feature
   */
  public getModelsWithFeature<
    Feature extends FeatureProps,
    FeatureName extends string
  >(
    featureName: FeatureName
  ): ModelData<ArticyObjectProps, { FeatureName: Feature }>[] {
    const results: ModelData<
      ArticyObjectProps,
      { FeatureName: Feature }
    >[] = [];
    for (const model of this._lookup.values()) {
      if (model.Template && featureName in model.Template) {
        results.push(
          this.localizeModel(
            model as ModelData<ArticyObjectProps, { FeatureName: Feature }>
          )
        );
      }
    }
    return results;
  }

  /**
   * Returns objects of a given type with a given feature name.
   * This is a special type-safe version that works only with features that are a part of the GlobalFeatures interface.
   * @typeParam FeatureName Name of the feature to improve return type deduction
   * @typeParam ObjectType Object type
   * @param featureName Name of the feature to search for
   * @param creator Object type to return
   * @returns All objects that have the given feature
   */
  public getObjectsWithFeature<
    FeatureName extends keyof GlobalFeatures,
    ObjectType
  >(
    featureName: FeatureName,
    creator: ArticyObjectCreator<ObjectType>
  ): (ObjectType &
    TemplateExtension<FeatureName, GlobalFeatures[FeatureName]>)[];

  /**
   * Returns objects of a given type with a given feature name
   * @param featureName Name of the feature to search for
   * @param creator Object type to return
   * @returns All objects matching the given type that have the given feature
   */
  public getObjectsWithFeature<ObjectType>(
    featureName: string,
    creator: ArticyObjectCreator<ObjectType>
  ): ObjectType[];

  public getObjectsWithFeature(
    featureName: string,
    creator: ArticyObjectCreator
  ) {
    const ids: string[] = [];
    for (const model of this._lookup.values()) {
      if (model.Template && featureName in model.Template) {
        ids.push(model.Properties.Id);
      }
    }

    return ids.map(id => this.getObject(id, creator)).filter(obj => obj);
  }

  /**
   * Returns the type string of a given object ID
   * @param id Object ID to lookup
   * @returns Type string, like "DialogueFragment" or "MyCustomTemplate"
   */
  public getType(id: Id | null | undefined): string | undefined {
    if (!id) {
      return undefined;
    }

    return this._lookup.get(id)?.Type;
  }

  /**
   * Resolves the full filename of an asset given its ID
   * @param assetId Asset Id
   * @returns Absolute path using the `assetResolver` passed into the database constructor.
   */
  public getAssetFilenameFromId(assetId: Id | undefined): string | null {
    if (!assetId) {
      return null;
    }

    // Get definition
    const def = this._lookup.get(assetId);
    if (!def) {
      return null;
    }

    // Resolve
    return this.getAssetFilenameFromRef(def.AssetRef);
  }

  /**
   * Resolves the full filename of an asset given its reference name
   * @param assetRef Asset Reference
   * @returns Absolute path using the `assetResolver` passed into the database constructor
   */
  public getAssetFilenameFromRef(assetRef: string | undefined): string | null {
    if (!assetRef || !this._assetResolver) {
      return null;
    }

    return this._assetResolver(assetRef) ?? null;
  }

  /**
   * Prints errors to the console if there are script methods in the Articy JSON
   * that haven't been registered using [[RegisterScriptFunction]].
   */
  public verifyScriptFunctions(): void {
    // Verify each script method
    this._data.ScriptMethods.forEach(VerifyRegisteredScriptMethod);
  }

  /** @internal */
  public static readonly RegisteredTypes: Map<
    string,
    ArticyObjectCreator
  > = new Map();

  /** @internal */
  public static readonly InverseRegisteredTypes: Map<
    ArticyObjectCreator,
    string
  > = new Map();

  private localizeModel<P extends ArticyObjectProps, T extends TemplateProps>(
    modelDef: ModelData<P, T>
  ): ModelData<P, T> {
    // Do nothing if not localized
    if (!this._isLocalized) {
      return modelDef;
    }

    // Get definition
    const def = this._definitions.get(modelDef.Type);

    // Create proxy
    return LocalizeProperties(modelDef, this.localization, def);
  }

  private localizeDefinition<D extends ObjectDefinition | EnumDefinition>(
    definition: D
  ): D {
    // Do nothing if not localized
    if (!this._isLocalized) {
      return definition;
    }

    // Localize definition
    return LocalizeDefinition(definition, this.localization);
  }
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
