declare module "ArticyJSON"
{
    /** Root Project Information */
    interface Project
    {
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
    interface Settings
    {
        /** "True" if localization mode is enabled (strings stored in separate xlsx instead of in JSON) */
        set_Localization: string;

        /** Exporter version */
        ExportVersion: string;
    }

    /** Type used to store Articy's GUIDs (just a string) */
    type Id = string;

    /** 2D Point in space */
    interface PointData
    { 
        /** Horizontal coordinate */
        x: number; 

        /** Vertical coordinate */
        y: number; 
    }

    /** Represents a 2D transform */
    type TransformData =
    {
        /** Transform pivot */
        Pivot: PointData;

        /** 2D Rotation around pivot */
        Rotation: number;

        /** Translation from origin to pivot */
        Translation: PointData;
    };

    interface TechnicalNameProps
    {
        TechnicalName: string;
    }

    /** Root interface for all Articy object properties */
    interface ArticyObjectProps extends TechnicalNameProps
    {
        Id: ArticyId;
    }

    /** Articy colour */
    interface ColorData
    {
        /** Red component */
        r: number;

        /** Green component */
        g: number;

        /** Blue component */
        b: number;
    }

    /** Size data */
    interface SizeData
    {
        /** Width */
        w: number;

        /** Height */
        h: number;
    }

    /** Preview Image Data */
    interface PreviewImageData
    {
        /** Asset for this image. Set to the Null ID if no image is set. */
        Asset: Id;

        /** Storage mode. AFAIK FromAsset is the only valid value. */
        Mode: "FromAsset";
    }

    /** Has a colour */
    interface ColorProps
    {
        /** Object colour */
        Color: ColorData;
    }

    /** Any node or entity that has a preview image */
    interface PreviewImageProps
    {
        /** Preview Image */
        PreviewImage: PreviewImageData;
    }

    /** Base interface for all entity definitions */
    interface EntityProps extends ArticyObjectProps, DisplayNameProps, ColorProps, PreviewImageProps
    {
    }

    /** Base interface for all flow objects (dialogue fragments, conditions, etc.) */
    interface FlowObjectProps extends ArticyObjectProps
    {
        /** Position in the flow */
        Position: Point;
    }

    /** Interface for all connections between flow nodes (Incoming and Outgoing) */
    interface ConnectionProps
    {
        /** Optional label */
        Label: string;

        /** Target pin this connection points to */
        TargetPin: Id;

        /** Target this connection points to (connected by TargetPin) */
        Target: Id;
    }

    /** Interface for any nodes with menu text */
    interface MenuTextProps
    {
        /** Text to display in a menu */
        MenuText: string;
    }

    /** Interface for any nodes with a display name */
    interface DisplayNameProps
    {
        /** Object display name */
        DisplayName: string;
    }

    /** Interface for any nodes with text */
    interface TextProps
    {
        /** Main node text */
        Text: string;
    }

    /** Base interface for all pins (Input and Output) */
    interface PinProps extends FlowObjectProps
    {
        /** Option script (instruction for Output, condition for Input) */
        Text: string;

        /** Id of this pin's owner */
        Owner: Id;

        /** Connections coming in/going out of this pin */
        Connections: ConnectionProps[]|undefined;
    }

    /** Base interface for all flow nodes that have Input and Output pins */
    interface PinnedObjectProps extends FlowObjectProps
    {
        /** Input pins leading into this node */
        InputPins: PinProps[]|undefined;

        /** Output pins leading out of this node */
        OutputPins: PinProps[]|undefined;
    }

    /** Base interface for all hub flow node properties */
    interface HubProps extends PinnedObjectProps, DisplayNameProps, TextProps
    {
    }

    /** Base interface for all flow fragments */
    interface FlowFragmentProps extends PinnedObjectProps, TextProps, DisplayNameProps, PreviewImageProps
    {
        TechnicalName: string;
        Attachments: Id[];
    }

    /** Base interface for all flow fragments */
    interface DialogueProps extends PinnedObjectProps, TextProps, DisplayNameProps, PreviewImageProps
    {
        TechnicalName: string;
        Attachments: Id[];
    }

    /** Base interface for all script nodes (conditions or instructions) */
    interface ScriptNodeProps extends PinnedObjectProps
    {
        /** Script to run/check */
        Expression: string;
    }

    /** Properties for a Jump Node */
    interface JumpProps extends PinnedObjectProps
    {
        /** Target of the jump */
        Target: Id;

        /** Pin on the target to move through */
        TargetPin: Id;
    }

    /** Interface for dialogue fragments */
    interface DialogueFragmentProps extends PinnedObjectProps, TextProps, MenuTextProps
    {
        /** Id of speaker entity */
        Speaker: Id;
    }
    
    /** Base interface for all feature data */
    interface FeatureProps { } // eslint-disable-line @typescript-eslint/no-empty-interface

    /** Properties for a template */
    interface TemplateProps
    {
        /** Features available in this template */
        [name: string]: FeatureProps;
    }

    /** Properties for a location */
    interface LocationProps extends ArticyObjectProps, TextProps, DisplayNameProps, ColorProps
    {
        /** Bounding box enclosing all elements in the location */
        Size: SizeData;
    }

    /** Types of shapes available in the location system */
    enum ShapeType
    {
        Invalid = 0,
        Spot = 1,
        Circle = 2,
        Rectangle = 3,
        Path = 4,
        Polygon = 5,
        Link = 6,
    }

    /** Properties for a zone in a location */
    interface ZoneProps extends ArticyObjectProps, TextProps, ColorProps, DisplayNameProps
    {
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
    interface LocationImageProps extends ZoneProps
    {
        /** The actual image */
        ImageAsset: Id;
    }

    /** Properties for an asset */
    interface AssetProps extends ArticyObjectProps, DisplayNameProps
    {
        /** Name of the original filename on disk */
        Filename: string;
    }

    /** Model definition of an object. Includes its type, properties, and templates. */
    interface ModelData<PropertiesType extends ArticyObjectProps = ArticyObjectProps, TemplateType extends TemplateProps = TemplateProps>
    {
        /** Object type */
        Type: string;

        /** Properties */
        Properties: PropertiesType;

        /** Optional template properties */
        Template?: TemplateType;

        /** Path to asset (if this is an asset type) */
        AssetRef?: string;

        /** Asset category */
        AssetCategory?: string;
    }

    /** Data for an exported package */
    interface PackageData
    {
        /** Package name */
        Name: string;

        /** Description of the package */
        Description: string;

        /** Is this the default package to load? */
        IsDefaultPackage: boolean;

        /** Models exported in this package */
        Models: ModelData[];
    }

    /** Definition of an object type exported in the JSON */
    interface ObjectDefinition
    {
        /** Type name */
        Type: string;

        /** Base class */
        Class: string;
    }

    /** Definition of an enum defined in Articy */
    interface EnumDefinition extends ObjectDefinition
    {
        Class: "Enum",

        /** Values for each enumeration technical name */
        Values: Record<string, number>;

        /** Display names for each enumeration technical name */
        DisplayNames: Record<string, string>;
    }

    /** Entry in the project's hierarchy */
    interface HierarchyEntry
    {
        /** Id of the object this represents */
        Id: Id;

        /** Type of the object this points to */
        Type: string;

        /** Children of this object */
        Children?: HierarchyEntry[];
    }

    /** Definition of a global variable */
    interface GlobalVariableDef
    {
        /** Variable name */
        Variable: string;

        /** Type */
        Type: "Boolean" | "String" | "Integer" | string;

        /** Starting value */
        Value: string;

        /** Description */
        Description: string;
    }

    /** Definition of a variable namespace */
    interface VariableNamespaceDef
    {
        /** Namespace name */
        Namespace: string;

        /** Description */
        Description: string;

        /** Variables in this namespace */
        Variables: GlobalVariableDef[];
    }

    /** Defines a script method used in this database */
    interface ScriptMethodDef
    {
        /** Method name used in scripts */
        Name: string;

        /** Method return type */
        ReturnType: "float" | "void" | "int" | "boolean" | string;
    }

    /** Root type for an imported Articy JSON file */
    interface ArticyData
    {
        /** Project information */
        Project: ProjectInfo;

        /** Packages exported in this file */
        Packages: Package[];

        /** Object definitions in the project */
        ObjectDefinitions: ObjectDefinition[];

        /** Global variables */
        GlobalVariables: VariableNamespaceDef[];

        /** Root Hierarchy entry */
        Hierarchy: HierarchyEntry;

        /** Script methods used by scripts in this database */
        ScriptMethods: ScriptMethodDef[];
    }
}

declare module "*.articy.json" {
    const value: ArticyData;
    export default value;
}