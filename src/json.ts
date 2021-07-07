/** Root Project Information */
export interface Project {
  /** Project display name */
  Name: string;

  /** Short project description */
  DetailName: string;

  /** Technical Project name (Usually a slug version of Name) */
  TechnicalName: string;

  /** Unique ID for Project */
  Guid: string;
}

/** Root project settings */
export interface Settings {
  /** "True" if localization mode is enabled (strings stored in separate xlsx instead of in JSON) */
  set_Localization: string;

  /** Exporter version */
  ExportVersion: string;
}

/** Type used to store Articy's GUIDs (just a string) */
export type Id = string;

/** 2D Point in space */
export interface PointData {
  /** Horizontal coordinate */
  x: number;

  /** Vertical coordinate */
  y: number;
}

/** Represents a 2D transform */
export type TransformData = {
  /** Transform pivot */
  Pivot: PointData;

  /** 2D Rotation around pivot */
  Rotation: number;

  /** Translation from origin to pivot */
  Translation: PointData;
};

export interface TechnicalNameProps {
  TechnicalName: string;
}

/** Root export interface for all Articy object properties */
export interface ArticyObjectProps extends TechnicalNameProps {
  Id: Id;
}

/** Articy colour */
export interface ColorData {
  /** Red component */
  r: number;

  /** Green component */
  g: number;

  /** Blue component */
  b: number;
}

/** Size data */
export interface SizeData {
  /** Width */
  w: number;

  /** Height */
  h: number;
}

/** Preview Image Data */
export interface PreviewImageData {
  /** Asset for this image. Set to the Null ID if no image is set. */
  Asset: Id;

  /** Storage mode. AFAIK FromAsset is the only valid value. */
  Mode: 'FromAsset';
}

/** Has a colour */
export interface ColorProps {
  /** Object colour */
  Color: ColorData;
}

/** Any node or entity that has a preview image */
export interface PreviewImageProps {
  /** Preview Image */
  PreviewImage: PreviewImageData;
}

/** Base export interface for all entity definitions */
export interface EntityProps
  extends ArticyObjectProps,
    DisplayNameProps,
    ColorProps,
    PreviewImageProps,
    TextProps {}

/** Base export interface for all flow objects (dialogue fragments, conditions, etc.) */
export interface FlowObjectProps extends ArticyObjectProps {
  /** Position in the flow */
  Position: PointData;
}

/** Interface for all connections between flow nodes (Incoming and Outgoing) */
export interface ConnectionProps {
  /** Optional label */
  Label: string;

  /** Target pin this connection points to */
  TargetPin: Id;

  /** Target this connection points to (connected by TargetPin) */
  Target: Id;
}

/** Interface for any nodes with menu text */
export interface MenuTextProps {
  /** Text to display in a menu */
  MenuText: string;
}

/** Interface for any nodes with a display name */
export interface DisplayNameProps {
  /** Object display name */
  DisplayName: string;
}

/** Interface for any nodes with text */
export interface TextProps {
  /** Main node text */
  Text: string;
}

/** Base export interface for all pins (Input and Output) */
export interface PinProps extends FlowObjectProps {
  /** Option script (instruction for Output, condition for Input) */
  Text: string;

  /** Id of this pin's owner */
  Owner: Id;

  /** Connections coming in/going out of this pin */
  Connections: ConnectionProps[] | undefined;
}

/** Base export interface for all flow nodes that have Input and Output pins */
export interface PinnedObjectProps extends FlowObjectProps {
  /** Input pins leading into this node */
  InputPins: PinProps[] | undefined;

  /** Output pins leading out of this node */
  OutputPins: PinProps[] | undefined;
}

/** Base export interface for all hub flow node properties */
export interface HubProps
  extends PinnedObjectProps,
    DisplayNameProps,
    TextProps {}

/** Base export interface for all flow fragments */
export interface FlowFragmentProps
  extends PinnedObjectProps,
    TextProps,
    DisplayNameProps,
    PreviewImageProps {
  TechnicalName: string;
  Attachments: Id[];
}

/** Base export interface for all flow fragments */
export interface DialogueProps
  extends PinnedObjectProps,
    TextProps,
    DisplayNameProps,
    PreviewImageProps {
  TechnicalName: string;
  Attachments: Id[];
}

/** Base export interface for all script nodes (conditions or instructions) */
export interface ScriptNodeProps extends PinnedObjectProps {
  /** Script to run/check */
  Expression: string;
}

/** Properties for a Jump Node */
export interface JumpProps extends PinnedObjectProps {
  /** Target of the jump */
  Target: Id;

  /** Pin on the target to move through */
  TargetPin: Id;
}

/** Interface for dialogue fragments */
export interface DialogueFragmentProps
  extends PinnedObjectProps,
    TextProps,
    MenuTextProps {
  /** Id of speaker entity */
  Speaker: Id;
}

/** Base export interface for all feature data */
export type FeatureProps = {};

/**
 * Extend this in your application to add type handling for features used across many templates.
 */
export interface GlobalFeatures {}

/** Properties for a template */
export interface TemplateProps {
  /** Features available in this template */
  [name: string]: FeatureProps;
}

/** Properties for a location */
export interface LocationProps
  extends ArticyObjectProps,
    TextProps,
    DisplayNameProps,
    ColorProps {
  /** Bounding box enclosing all elements in the location */
  Size: SizeData;
}

/** Types of shapes available in the location system */
enum ShapeType {
  Invalid = 0,
  Spot = 1,
  Circle = 2,
  Rectangle = 3,
  Path = 4,
  Polygon = 5,
  Link = 6,
}

/** Properties for a zone in a location */
export interface ZoneProps
  extends ArticyObjectProps,
    TextProps,
    ColorProps,
    DisplayNameProps {
  /** Preview image (appears to be the same as ImageAsset) */
  PreviewImage: PreviewImageData;

  /** Points that make up the image shape */
  Vertices: PointData[];

  /** Type of shape */
  ShapeType: ShapeType;

  /** Bounding box of this element */
  Size: SizeData;

  /** 2D Transform */
  Transform: TransformData;
}

/** Properties for an image placed in a location */
export interface LocationImageProps extends ZoneProps {
  /** The actual image */
  ImageAsset: Id;
}

/** Properties for a link placed in a location */
export interface LocationLinkProps extends ArticyObjectProps, ColorProps {
  /** Position of the link in the location */
  Position: PointData;

  /** Link target */
  Target: Id;
}

/** Properties for an asset */
export interface AssetProps extends ArticyObjectProps, DisplayNameProps {
  /** Name of the original filename on disk */
  Filename: string;
}

/** Model definition of an object. Includes its type, properties, and templates. */
export interface ModelData<
  PropertiesType extends ArticyObjectProps = ArticyObjectProps,
  TemplateType extends TemplateProps = TemplateProps
> {
  /** Object type */
  Type: string;

  /** Properties */
  Properties: PropertiesType;

  /** Optional template properties */
  Template?: TemplateType & Partial<GlobalFeatures>;

  /** Path to asset (if this is an asset type) */
  AssetRef?: string;

  /** Asset category */
  AssetCategory?: string;
}

/** Data for an exported package */
export interface PackageData {
  /** Package name */
  Name: string;

  /** Description of the package */
  Description: string;

  /** Is this the default package to load? */
  IsDefaultPackage: boolean;

  /** Models exported in this package */
  Models: ModelData[];
}

/** All possible values of the Class string */
export type ArticyClass =
  | 'Enum'
  | 'Primitive'
  | 'ArticyObject'
  | 'FlowFragment'
  | 'Dialogue'
  | 'DialogueFragment'
  | 'Hub'
  | 'Jump'
  | 'Comment'
  | 'Entity'
  | 'Location'
  | 'Spot'
  | 'Zone'
  | 'Path'
  | 'Link'
  | 'Asset'
  | 'Condition'
  | 'Instruction'
  | 'LocationText'
  | 'LocationImage'
  | 'Document'
  | 'TextObject'
  | 'UserFolder';

/** Definition of an object type exported in the JSON */
interface BaseObjectDefinition {
  /** Type name */
  Type: string;

  /** Base Articy Data type */
  Class: ArticyClass;
}

/** Definition of an enum defined in Articy */
export interface EnumDefinition extends BaseObjectDefinition {
  Class: 'Enum';

  /** Values for each enumeration technical name */
  Values: Record<string, number>;

  /** Display names for each enumeration technical name */
  DisplayNames: Record<string, string>;
}

export interface PropertyDefinition {
  /** Property name */
  Property: string;

  /** Type string */
  Type: string;

  /** User facing name */
  DisplayName?: string;

  /** Is the property value localized */
  Localizable?: boolean;
}

/** Definition of a base type */
export interface TypeDefinition extends BaseObjectDefinition {
  Class: Exclude<ArticyClass, 'Enum'>;

  /** Object properties */
  Properties: PropertyDefinition[];
}

/** Definition of a property in a feature */
export type FeaturePropertyDefinition = Required<PropertyDefinition>;

/** Definition of a feature in a template */
export interface FeatureDefinition {
  /** Unique identifier for the feature */
  TechnicalName: string;

  /** Display name (localizable) */
  DisplayName: string;

  /** Properties in the feature */
  Properties: FeaturePropertyDefinition[];
}

export interface TemplateDefinition {
  /** Unique identifier for the template */
  TechnicalName: string;

  /** Display name (localizable) */
  DisplayName: string;

  /** Features in the template */
  Features: FeatureDefinition[];
}

/** Definition of a template type */
export interface TemplateTypeDefinition extends BaseObjectDefinition {
  Class: Exclude<ArticyClass, 'Enum'>;

  /** Base class */
  InheritsFrom?: string;

  /** Definition of the template */
  Template: TemplateDefinition;
}

export type ObjectDefinition =
  | EnumDefinition
  | TypeDefinition
  | TemplateTypeDefinition;

/** Entry in the project's hierarchy */
export interface HierarchyEntry {
  /** Id of the object this represents */
  Id: Id;

  /** Type of the object this points to */
  Type: string;

  /** Children of this object */
  Children?: HierarchyEntry[];
}

/** Definition of a global variable */
export interface GlobalVariableDef {
  /** Variable name */
  Variable: string;

  /** Type */
  Type: 'Boolean' | 'String' | 'Integer' | string;

  /** Starting value */
  Value: string;

  /** Description */
  Description: string;
}

/** Definition of a variable namespace */
export interface VariableNamespaceDef {
  /** Namespace name */
  Namespace: string;

  /** Description */
  Description: string;

  /** Variables in this namespace */
  Variables: GlobalVariableDef[];
}

/** Defines a script method used in this database */
export interface ScriptMethodDef {
  /** Method name used in scripts */
  Name: string;

  /** Method return type */
  ReturnType: 'float' | 'void' | 'int' | 'boolean' | string;
}

/** Root type for an imported Articy JSON file */
export interface ArticyData {
  /** Project information */
  Project: Project;

  /** Packages exported in this file */
  Packages: PackageData[];

  /** Object definitions in the project */
  ObjectDefinitions: ObjectDefinition[];

  /** Global variables */
  GlobalVariables: VariableNamespaceDef[];

  /** Root Hierarchy entry */
  Hierarchy: HierarchyEntry;

  /** Script methods used by scripts in this database */
  ScriptMethods: ScriptMethodDef[];
}
