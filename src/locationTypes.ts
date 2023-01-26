import {
  ArticyObjectProps,
  LocationImageProps,
  LocationLinkProps,
  LocationProps,
  SpotProps,
  TemplateProps,
  ZoneProps,
} from './json';
import { ArticyType } from './database';
import { ArticyObject } from './types';
import { ArticyCreatorArguments } from './object';

/**
 * Articy location
 */
@ArticyType('Location')
export class Location<
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<LocationProps, TemplateType> { }

/**
 * Articy location zones (and zone like objects)
 */
@ArticyType('Zone')
export class Zone<
  TemplateType extends TemplateProps = TemplateProps,
  PropertiesType extends ZoneProps = ZoneProps
> extends ArticyObject<PropertiesType, TemplateType> { }

/**
 * Image in a location
 */
@ArticyType('LocationImage')
export class LocationImage<
  TemplateType extends TemplateProps = TemplateProps
> extends Zone<TemplateType, LocationImageProps> { }

/**
 * Link in a location
 */
@ArticyType('Link')
export class LocationLink<
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<LocationLinkProps, TemplateType> {
  /** Target of the link (or undefined) */
  public readonly Target?: ArticyObject<ArticyObjectProps, TemplateProps>;

  constructor(args: ArticyCreatorArguments) {
    super(args);

    // Grab target
    this.Target = args.db.getObject(this.properties.Target, ArticyObject);
  }
}

/** Spot in a Location */
@ArticyType('Spot')
export class LocationSpot<
  TemplateType extends TemplateProps = TemplateProps
> extends ArticyObject<SpotProps, TemplateType> { }