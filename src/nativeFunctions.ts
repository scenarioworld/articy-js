import { Database } from './database';
import { ArticyObjectProps } from './json';
import { NullId } from './object';
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

// getProp(object, property) returns the value of a property or template property in an object
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

// getObj(id) gets an object by ID
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

// Prints a string to the Javascript console
RegisterScriptFunction('print', (_context, ...args) => {
  console.log('ARTICY PRINT: ', ...args);
});

// Returns a random(min, max) number between min and max
RegisterScriptFunction('random', (_context, min, max) => {
  if (typeof min !== 'number' || typeof max !== 'number') {
    console.warn('random() requires two numbers');
    return undefined;
  }

  return Math.round(Math.random() * (max - min) + min);
});

// once() method -> returns true only if the calling node has not been visted before
RegisterScriptFunction('once', context => {
  return (
    !(context.caller in context.visits.counts) ||
    context.visits.counts[context.caller] === 0
  );
});

// limit(number) method -> returns true only if the current node has been visited less than `number` times
RegisterScriptFunction('limit', (context, max) => {
  // Make sure it's actually a number
  if (typeof max !== 'number') {
    return false;
  }

  // Check visit count
  const count = context.visits.counts[context.caller];
  if (count === undefined && max === 0) {
    return false;
  }
  if (count === undefined || count < max) {
    return true;
  }
  return false;
});

// Grabs the number of times this particular node was visited
RegisterScriptFunction('visits', context => {
  const id = context.caller;
  if (id === NullId || id === '') {
    return 0;
  }

  return context.visits.counts[id] ?? 0;
});

// visited() - returns true if this node has been visted
RegisterScriptFunction(
  'visited',
  state =>
    state.caller in state.visits.counts && state.visits.counts[state.caller] > 0
);
