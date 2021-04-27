import {
  GlobalFeatures,
  ArticyObjectProps,
  AssetProps,
  EntityProps,
  Id,
  TemplateProps,
  FeatureProps,
} from './json';
import { Database, ArticyType } from './database';
import { ArticyCreatorArguments, ArticyObjectCreator } from './object';

/**
 * Type interface you can & with ArticyObject to guarantee its template includes a given feature
 */
export interface TemplateExtension<
  FeatureName extends string,
  FeatureType extends FeatureProps
> {
  template: Readonly<Record<FeatureName, FeatureType>>;
}

/**
 * Base class for all articy objects
 */
export class ArticyObject<
  PropertiesType extends ArticyObjectProps,
  TemplateType extends TemplateProps = TemplateProps
> {
  /** Properties from JSON */
  public readonly properties: Readonly<PropertiesType>;

  /** Template from JSON */
  public readonly template?: Readonly<TemplateType & Partial<GlobalFeatures>>;

  /** Type this was loaded as */
  public readonly type: string;

  /** Parent DB */
  public readonly db: Database;

  /** Helper ID */
  public readonly id: Id;

  constructor(args: ArticyCreatorArguments<PropertiesType, TemplateType>) {
    this.properties = args.props;
    this.type = args.type;
    this.template = args.template;
    this.db = args.db;
    this.id = args.props.Id;
  }

  /**
   * Checks if this object is the given type or derives from it
   * @param type Type to check
   */
  public is(type: string): boolean {
    return this.db.isType(this.type, type);
  }

  /**
   * Casts to a subtype
   * @param type Subtype
   */
  public as<ObjectType>(
    type: ArticyObjectCreator<ObjectType>
  ): ObjectType | undefined {
    if (this instanceof type) {
      return this as ObjectType;
    }
    return undefined;
  }

  /**
   * Gets children of a given type
   * @param creator Child type constructor
   */
  public getChildrenOfType<ObjectType>(
    creator: ArticyObjectCreator<ObjectType>
  ): ObjectType[] {
    return this.db.getChildrenOfType<ObjectType>(this.id, creator);
  }

  /** Gets the parent of this object */
  public getParent<ObjectType>(
    type: ArticyObjectCreator<ObjectType>
  ): ObjectType | undefined {
    // Get parent id
    const parentId = this.db.getParent(this.id);
    if (!parentId) {
      return undefined;
    }

    // Find object
    return this.db.getObject(parentId, type);
  }
}

/**
 * Base class to all entities
 */
@ArticyType('Entity')
export class Entity<
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<EntityProps, TemplateType> {
  /**
   * Gets the URL of the preview image for this entity
   */
  /*getPreviewImage(): string|null {
        return this.db.getAssetFilename(this.properties.PreviewImage.Asset);
    }*/
}

/**
 * Asset type. Includes images, sounds, etc. stored in Articy.
 */
@ArticyType('Asset')
export class Asset<
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<AssetProps, TemplateType> {
  /** Asset reference id. Used to lookup the resolved filename. */
  public readonly AssetRef: string | null;

  /** Resolved filename relative to the site root. Can be used in <img> tags, etc. */
  public readonly Filename: string | null;

  constructor(args: ArticyCreatorArguments<AssetProps>) {
    super(args);

    // Load asset ref
    this.AssetRef = (args.model?.AssetRef as string) ?? null;
    this.Filename = args.db.resolveAssetFilename(this.AssetRef);
  }
}
