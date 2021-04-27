import { Database } from './database';
import { ArticyObjectProps } from './json';
import { RegisterScriptFunction } from './script';
import { ArticyObject } from './types';
import { Variable } from './variables';

function getObjectFromStringId(
  db: Database,
  objectId: string
): ArticyObject<ArticyObjectProps> | undefined {
  if (objectId.startsWith('0x')) {
    return db.getObject(objectId, ArticyObject);
  } else {
    return db.getObjectByTechnicalName(objectId, ArticyObject);
  }
}

RegisterScriptFunction('getProp', (context, objectId, propertyName) => {
  if (typeof propertyName !== 'string' || typeof objectId !== 'string') {
    console.warn('Bad argument type for getProp');
    return undefined;
  }

  // Get object
  const object = getObjectFromStringId(context.db, objectId);
  if (!object) {
    console.warn("Couldn't find object with id ", objectId);
    return undefined;
  }

  // Check if it's a template or property variable
  const properties = propertyName.split('.');
  if (properties.length === 2) {
    return (object.template?.[properties[0]] as
      | Record<string, Variable>
      | undefined)?.[properties[1]];
  } else {
    return (object.properties as Record<string, Variable>)[properties[0]];
  }
});

RegisterScriptFunction('getObj', (context, objectId) => {
  if (typeof objectId !== 'string') {
    console.warn('Bad argument type for getProp');
    return undefined;
  }

  // Get object
  const object = getObjectFromStringId(context.db, objectId);
  if (!object) {
    console.warn("Couldn't find object with id ", objectId);
    return undefined;
  }

  // Turn it into an id
  return object.id;
});

RegisterScriptFunction('print', (_context, ...args) => {
  console.log('ARTICY PRINT: ', ...args);
});

RegisterScriptFunction('random', (_context, min, max) => {
  if (typeof min !== 'number' || typeof max !== 'number') {
    console.warn('random() requires two numbers');
    return undefined;
  }

  return Math.round(Math.random() * (max - min) + min);
});
