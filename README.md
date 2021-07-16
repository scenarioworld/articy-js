# Articy.Node

A node package for loading and executing [Articy](http://www.articy.com) flows from JSON exports. Includes full TypeScript support.

## Export from Articy

In order to use this package, you need a [json file exported from Articy](https://www.articy.com/help/Exports_JSON.html). Use the Export feature in Articy and save it somewhere in your project.

## Creating a database

To access the data in the database, you'll need to load the exported JSON into a new instance of the database class

```js
// Example GameDB.js

// Import data from the exported json
import GameData from "./exported.articy.json";
import { Database } from "articy-node";

// Create a new database
const GameDB = new Database(GameData)

// Export the database
export default GameDB;
```

Then, you can access objects from the database using `getObject`.

```js
import GameDB from "GameDB";
import { FlowFragment } from "articy-node";

// Get a flow fragment by ID
const fragment = GameDB.getObject("0x01000000000018A3", FlowFragment);
console.log("Flow fragment text: ", fragment.properties.Text);
```

## Flow Iteration

The model for flow iteration is styled after Redux, with various reducers that consume a `GameFlowState` and return a new, updated flow state.

```js

// Create an iteration configuration. This tells the runtime which nodes it should stop on
const iterationConfig = { 
    stopAtTypes: ["DialogueFragment"]
};

// Given our database, startup a flow state at a given node ID
const [initialState, initialNode] = startupGameFlowState(GameDB, "0x01000000000018A3", iterationConfig);

// Access information about the current state
console.log("Current node id: ", initialState.id);
console.log("Value of variable Test.X: ", initialState.variables["Test"]["X"]);
console.log("Number of branches: ", initialState.branches.length);

// Move down the first branch
const [nextState, nextNode] = advanceGameFlowState(GameDB, initialState, iterationConfig, 0);

// Refresh the branch set
const stateWithRefreshedBranches = refreshBranches(GameDB, nextState, iterationConfig);

```

## Registering New Types, Functions, and Features

### Script Functions

You can easily register new functions for use in Expresso scripts. They can take any number of arguments of the supported types (number, string, boolean).

```js
// Register a new IsGreater function that takes two arguments
RegisterScriptFunction("IsGreater", (context, arg1, arg2) => {
    return arg1 > arg2;
});
```

The first argument past to each function handler is a `context` object with information about the current execution. This is useful if you want the function's behaviour to change based on parent node, for example.

```js
// Context passed as the first argument to every script method
type Context = {
  /** Id of the caller (or NullId if called outside a node) */
  caller: Id;

  /** Visit information (includes indicies and counts) */
  visits: VisitSet;

  /** Variable state */
  variables: VariableStore;

  /** Loaded Articy Database */
  db: Database;

  /** Custom application state (see Redux Middleware documentation) */
  state: Readonly<ApplicationState> | undefined;
};
```

### Object Types

In most cases, you will not need to define new object types. This is only necessary if you want to customize the iteration functions (such as `next` or `execute`) or want to add new helper methods.

To register a new object type, define a new class deriving from either `Entity`, `DialogueFragment` or whatever base class is most appropriate. Then, mark the class with the `@ArticyType` decorator (or use `RegisterDatabaseTypeClass` if you don't have decorator support).

```js
@ArticyType('MyCustomDialogueFragment') // this must match the technical name of your custom Template in Articy
class MyCustomDialogueFragment extends DialogueFragment // if using Typescript, you can add a <TemplateType> here to add type support for the template's features
{
    execute(context) {
        // custom logic when this node is executed in flow iteration
    }
}
```

### Feature Handlers

A better alternative to making a new type is registering a Feature Handlers. Feature Handlers are registered functions that are called whenever a node with a given Feature is executed during iteration. 

```js
/* Let's say you created a new Feature in Articy called MusicSettings. It has one string in it called SongName.
 * We want to run some special music code whenever any node with that feature is executed as part of iteration.
 * This will work even if the node in question is not "stopped at" in iteration, and just passed over.
*/
RegisterFeatureExecutionHandler("MusicSettings", (db, feature, node, state) => {
    const musicToPlay = feature.SongName;
    // do something with musicToPlay
});
```

If you're using Typescript, you can type the `feature` argument to an interface matching the spec in Articy.

## Expresso Script Support with Additional Functions

This package supports all the built-in functions documented at [Articy Unity Plugin](https://www.articy.com/articy-importer/unity/html/howto_script.htm) with the exception of setProp due to some implementation complications (but I'm working on it). This includes the helper objects of `speaker` and `self` where they are appropriate.

We also include two extra built-in methods: `once()` and `limit(n)`.

`once()` will return true if and only if the owning node has NOT been visited. It's a great way to make choices that can only be chosen once. Simply add `once()` to their input pin.

`limit(n)` works similarly, but only returns true if the node has been visited less than `n` times.

## Redux Middleware

Suppose you want to write a custom script function that modifies your game state in some way (say, moving the player around on the screen or something) but you're using Redux. States are immutable. What can you do?

You can use the `createScriptDispatchMiddleware` included with this package. This addon not only gives script function handlers access to your current Redux store, but also gives them the ability to dispatch actions.

To use it, simply add it to your `applyMiddleware` call like so:

```js
// Make the extensions
const extensions = compose(
    applyMiddleware(createScriptDispatchMiddleware())
);

// Create store
const store = createStore(reducer, initialState, extensions);
```

Now, script functions can not only access your application state, but they can also trigger actions using the Javascript `yield` keyword.

```js
// Make sure your script function is a _generator_ function. 
// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
RegisterScriptFunction('MovePlayerTo', function* (context, x, y) {
    // Read your application state in context.state
    
    // Trigger Redux actions
    yield { type: 'redux/move_action', x, y };
});
```

This will queue a Redux of action of type `redux/move_action` to be executed as soon as iteration is complete. This will only work if your iteration calls are happening during a Redux action of course.

This also works for `RegisterFeatureExecutionHandler`. Simply define the handler as a generator function and yield actions just as above.

## Asset Loading

To support asset loading (such as images), just add an asset resolver function to the Database constructor. This method should, given an asset reference string in Articy return the assets filename. In webpack, this is easy.

```js
import { Database } from "articy-node";

// Import game data from json
import GameData from "./game.articy.json";

// Asset resolver method
function assetResolver(assetRef: string) {
    // Articy exports all assets into an "Assets" folder relative to the exported .json file
    // Use webpack's require method to bundle these and map their filenames
    return require("./Assets/" + assetRef);
}

// Create database with resolver
const GameDB = new Database(GameData as ArticyData, assetResolver);

// Export
export default GameDB;
```

Now, given an Asset ID (from, say, a game entity) you can now get the full filename with the Database's `getAssetFilename` function.

```js
// Load an entity by ID
const entity = GameDB.getObject("0xFFFFFFFF", Entity);

// Get its preview image
const assetFilename = GameDB.getAssetFilename(entity.properties.PreviewImage.Asset);
```

## Inline Script Support

Using the `processInlineScripts` function, you can evaluate scripts embedded in text to create more responsive games. The syntax for inline scripts is lifted from the Lists and Variable Printing features of Inkle's Ink language.

Examples:

```
Some display text {show this the first time|show this after the first time}.
Print out the value of a variable: {MyNamespace.MyVariable}
Do some {~shuffling|randomizing|random rearranging} of text.
Print text conditionally to know if a variable {MyNamespace.MyBoolean:is true|is false}.
Make switch statements { 
    - MyNamespace.MyInteger == 3: that work.
    - MyNamespace.MyInteger == 4: that work well!
    - else: that are great :)
}
```

## Missing Features

* Localization support (coming soon)
* setProp()