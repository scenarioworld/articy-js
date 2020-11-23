import { LocationImageProps, LocationProps, TemplateProps, ZoneProps } from "ArticyJSON";
import { RegisterDatabaseTypeClass } from "./database";
import { ArticyObject } from "./types";

/**
 * Articy location
 */
export class Location<TemplateType extends TemplateProps = TemplateProps> extends ArticyObject<LocationProps, TemplateType>
{

}
RegisterDatabaseTypeClass("Location", Location);

/** 
 * Articy location zones (and zone like objects) 
 */
export class Zone<TemplateType extends TemplateProps = TemplateProps, PropertiesType extends ZoneProps = ZoneProps> extends ArticyObject<PropertiesType, TemplateType>
{

}
RegisterDatabaseTypeClass("Zone", Zone);

/**
 * Image in a location
 */
export class LocationImage<TemplateType extends TemplateProps = TemplateProps> extends Zone<TemplateType, LocationImageProps>
{

}
RegisterDatabaseTypeClass("LocationImage", LocationImage);