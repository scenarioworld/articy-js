# Articy.Node

A node package for loading and executing [Articy](http://www.articy.com) flows from JSON exports.

## Export from Articy

In order to use this package, you need a [json file exported from Articy](https://www.articy.com/help/Exports_JSON.html). Use the Export feature in Articy and save it somewhere in your project.

TODO: Screenshot from Articy

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

TODO: Document flow iteration

## Registering New Types, Functions, and Features

TODO: Document new type/template/feature/script function/etc. registration

## Redux Middleware

TODO: Document redux middleware

## Asset Loading

TODO: Stub asset loading

## Missing Features

* Localization support