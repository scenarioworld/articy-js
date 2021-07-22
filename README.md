# ArticyJS

A Javascript library for loading and executing interactive stories written in [Articy](http://www.articy.com). Includes full feature parity with the Unity and Unreal Articy plugins alongside additional features like more custom hooks into flow iteration and inline script calls embedded in display text.

Note that while this package features full feature parity with the Unity plguin, it doesn't share the same API.

## Installation

Just install using `npm` or `yarn` and you're ready to go.

```
yarn add articy-node
npm install articy-node --save-dev
```

## Loading Data from Articy

First we'll see how to get data from your Articy project into your Javascript application or game.

### Exporting to JSON From Articy

To load a story from Articy, you'll need to [export it to a JSON file](https://www.articy.com/help/Exports_JSON.html) and store it somewhere within your project. This'll be the file loaded by the runtime.

If you're exporting a project using localization, make sure the accompanying `.xlsx` files are copied alongside the JSON.

### Creating and Loading a Database

To load the data you've exported, you'll create an instance of the [[Database]] class. The `Database` object is read-only and you will only ever need to create one instance of it per story. For most projects, this'll mean you only need one.

If you're using Javscript modules, the best way to manage these instances is to initialize them in their own module and export them as the default export.

```typescript
// Example GameDB.ts

// Import data from the exported json
import GameData from "./exported.articy.json";
import { Database } from "articy-node";

// Create a new database
const GameDB = new Database(GameData)

// Export the database
export default GameDB;
```

To access it from another file, just use

```typescript
import GameDB from "GameDB"
```

### Accessing Database Objects

The `Database` class will give you access to objects within your project such as Entities, Flow Fragments, Dialogues, etc. Objects are accessed by their Unique ID which you can find in the Properties Inspector in Articy. All IDs begin with `0x`.

To access an object, use the `getObject` method.

```typescript
import GameDB from "GameDB";
import { FlowFragment } from "articy-node";

// Get a flow fragment by ID
const fragment = GameDB.getObject("0x01000000000018A3", FlowFragment);
console.log("Flow fragment text: ", fragment.properties.Text);
```

You'll notice `getObject` takes two parameters: the unique ID, and the Type. The Type is a Javascript class which helps tell the runtime how to handle the object data and gives access to both the `properties` and `template` data on the object.

You can create your own types to handle specific templates (see below) but included in the runtime are all the types you need for basic Articy objects like `FlowFragment`, `DialogueFragment`, `Entity`, `Location`, etc. There are also base types like `BaseFlowNode` and `ArticyObject` if you want to be less discerning about the type. 

If there's a mismatch between the actual type of the object and the type past into `getObject`, then it will return `undefined`. Also, even if a base type like `BaseFlowNode` is passed in as the type, `getObject` will return an object of the *most specific type* the runtime knows about that matches the database object. So if you pass `BaseFlowNode` and the real type of the object is a Flow Fragment, you'll get an object of type `FlowFragment`.

Some types like will automatically fetch associated objects for your convenience. For example, `DialogueFragment` will automatically fetch the associated speaker and store it in `Speaker` and flow nodes will automatically fetch all their Input and Output pins.

## Running Flows

While Articy works great as a Database, the main reason you're probably using it is to create branching story flows in the Flow Editor.

The model for flow iteration is styled after libraries like Redux, with various reducer methods which consume a `GameFlowState` and return a new, updated state.

### A Basic Example

```typescript
// First, we need to create a configuration to tell the runtime what nodes to 'stop' at. In most simple games, this'll be just DialogueFragment nodes.
const iterationConfig: GameIterationConfig = { 
    stopAtTypes: ["DialogueFragment"]
};

// Use startupGameFlowState to create a new flow state beginning at the given node
const [initialState] = startupGameFlowState(GameDB, "0x01000000000018A3", iterationConfig);

// Access information about the current state
console.log("Current node id: ", initialState.id);
console.log("Value of variable Test.X: ", initialState.variables["Test"]["X"]);
console.log("Number of branches: ", initialState.branches.length);

// Move down the first (0th) branch
const [nextState] = advanceGameFlowState(GameDB, initialState, iterationConfig, 0);

// Refresh the branch set
const stateWithRefreshedBranches = refreshBranches(GameDB, nextState, iterationConfig);
```

You'll notice that `startupGameFlowState` and `advanceGameFlowState` actually return an array, with the new state as the first element. This is because they also return a second element, the object represented by the new state's id, for convenience's sake so you don't have to call `getObject` immediately after.

For example,

```typescript
// Use startupGameFlowState to create a new flow state beginning at the given node
const [initialState, initialNode] = startupGameFlowState(GameDB, "0x01000000000018A3", iterationConfig);
console.log("The startup node's text is ", initialNode.properties.Text);
```

### Advanced Flow Control

You can further customize flow control using the parameters in the `GameIterationConfig` parameter.

Firstly, you can add additional types to the `stopAtTypes` list. Unlike the Articy Unity runtime, this list can include not just base types like FlowFragment and DialogueFragment but also names of templates defined by you in Articy.

You can also define stoppage based on the presence of certain features using `stopAtFeatures`. Just supply a list of Feature names and any nodes containing them will be considered stops.

For even finer grained control, you can specify a `customStopHandler` function. This method is called on any node that matches `stopAtTypes` or `stopAtFeatures` and returns a `CustomStopType`. The method is passed a reference to the given node as well as other state information by which it can make its decision to actually trigger a stop, continue, or carry out a more complex operation.

Here's a quick example that only stops on DialogueFragments but also FlowFragments if and only if their Display Text begins the string `STOP:`

```typescript
const iterationConfig: GameIterationConfig = { 
    stopAtTypes: ["DialogueFragment", "FlowFragment"],
    customStopHandler: node => { 
        // Check if the node is a flow fragment
        if(node instanceof FlowFragment) { 
            // If so, check if it's display text begins with STOP:
            if(node.properties.DisplayText.startsWith("STOP:")) { 
                // If so, stop as normal
                return CustomStopType.NormalStop;
            } else { 
                // Otherwise, continue past as if this wasn't marked as stop
                return CustomStopType.Continue;
            }
        }

        // We don't need to do anything for any other cases down here. If customStopHandler returns nothing, it falls back on its default behaviour.
    }
}
```

### Registering Execution Handlers

We may have nodes in Articy we'd like to perform some kind of action without actually triggering a stop. For example, we may have a Hub template called `PlayMusic` that's meant to switch the currently playing music track in our game. Or `SetBackground` which changes the current scene. Neither of these contain dialogue, so we don't actually want them to appear as choices or nodes we stop on, but we do want to trigger some code whenever they're run.

We can do this by registering Template or Feature Execution handlers. These are global callbacks that are triggered whenever flow iteration passes over either a given Template or a Template with a given Feature.

```typescript
/* Let's say you created a new Feature in Articy called MusicSettings. It has one string in it called SongName.
 * We want to run some special music code whenever any node with that feature is executed as part of iteration.
 * This will work even if the node in question is not "stopped at" in iteration, and just passed over.
*/
RegisterFeatureExecutionHandler("MusicSettings", (db, feature, node, state) => {
    const musicToPlay = feature.SongName;
    // do something with musicToPlay
    alert("Now playing:" + musicToPlay);
});
```

Execution handlers are passed a reference to the current database, the feature or template being executed, the parent node, and the current value of the `GameFlowState` during execution (where you can access visit counts, variables, etc.).

### Registering Script Functions

You can also register new script functions for use in Expresso scripts. They can take any number of arguments of the supported types (number, string, boolean).

```typescript
// Register a new IsGreater function that takes two arguments
RegisterScriptFunction("IsGreater", (context, arg1, arg2) => {
    return arg1 > arg2;
});
```

The first argument past to each function handler is a `context` object with information about the current execution. This is useful if you want the function's behaviour to change based on parent node, for example.

### Expresso Script Support with Additional Functions

This package supports all the built-in functions documented at [Articy Unity Plugin](https://www.articy.com/articy-importer/unity/html/howto_script.htm) with the exception of setProp due to some implementation complications (but I'm working on it). This includes the helper objects of `speaker` and `self` where they are appropriate.

We also include four extra built-in methods.

* `once()` will return true if and only if the owning node has NOT been visited. It's a great way to make choices that can only be chosen once. Simply add `once()` to their input pin.
* `limit(n)` works similarly, but only returns true if the node has been visited less than `n` times.
* `visited()` returns true if the current node has been visited before.
* `visits()` returns the number of times the current node has been visited.

### Redux Middleware

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

## Defining New Object Types

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

If you're using Typescript, you can type the `feature` argument to an interface matching the spec in Articy.

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

## Localization

This package supports Articy's localization system. When loading a project with localization turned on, you'll use the `localization` object within the `Database` class to load and manage your game's localized text.

Note that this class can't load `.xlsx` files directly. Instead, it requires a JSON object that maps localization IDs to strings. You can get this by loading the xlsx file yourself using a library like [xlsx](https://www.npmjs.com/package/xlsx) or [exceljs](https://www.npmjs.com/package/exceljs) or using our [articy-xlsx-loader](https://www.npmjs.com/package/articy-xlsx-loader) if you're using Webpack.

Objects accessed via `getObject` will automatically have their properties localized to whatever the active language is. You can change the active language at any time using the Localization objects' `active` variable. This will automatically update the text in all loaded objects, meaning you don't have to worry about holding onto objects loaded via `getObject`.

```typescript
import { Database } from "articy-node";

// Import game data from json with localization turned on
import GameData from "./game.articy.json";

// Create database
const GameDB = new Database(GameData as ArticyData);

// Load the localizations. Uses [articy-xlsx-loader](https://www.npmjs.com/package/articy-xlsx-loader) to parse these .xlsx files into JSON objects mapping localization IDs to strings.
GameDB.localization.load('en', require('./loc_All objects_en.xlsx'));
GameDB.localization.load('fr', require('./loc_All objects_fr.xlsx'));

// Set French as the active language
GameDB.localization.active = 'fr';

// Use GameDB as usual, all localization will be carried out automatically.
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

## Notable Missing Features

* setProp() is not implemented due to various issues with integrating it into the "Redux" style state used in this library. I'm still brainstorming how to deal with this but it's not a high priority right now as I don't tend to use it (but let me know if you do).
* Individual package loading is not supported. Currnently the library just loads all packages inside the JSON.