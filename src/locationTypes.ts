import {
  LocationImageProps,
  LocationProps,
  TemplateProps,
  ZoneProps,
} from './json';
import { ArticyType } from './database';
import { ArticyObject } from './types';

/**
 * Articy location
 */
@ArticyType('Location')
export class Location<
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<LocationProps, TemplateType> {}

/**
 * Articy location zones (and zone like objects)
 */
@ArticyType('Zone')
export class Zone<
  TemplateType extends TemplateProps = TemplateProps,
  PropertiesType extends ZoneProps = ZoneProps
> extends ArticyObject<PropertiesType, TemplateType> {}

/**
 * Image in a location
 */
@ArticyType('LocationImage')
export class LocationImage<
  TemplateType extends TemplateProps = TemplateProps
> extends Zone<TemplateType, LocationImageProps> {}
