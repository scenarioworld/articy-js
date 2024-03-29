# Changelog

## 1.2.2

- Expose loaded project information [#80](https://github.com/scenarioworld/articy-js/pull/80).

## 1.2.1

- Make sure input pins and conditions are executed when advancing (originally they were only run as part of the branch searching and thus changes were not committed to state). [#76](https://github.com/scenarioworld/articy-js/pull/76).

## 1.2.0

### Breaking Changes
- `RegisterFeatureExecutionHandler` and `RegisterTemplateExecutionHandler` now take a new mandatory property: a unique string id. This prevents handlers from being reregistered in projects using webpack where hot reloads may re-execute individual modules [#50](https://github.com/scenarioworld/articy-js/pull/50).


## 1.1.0

### New Features
- Added a new suite of `withGlobals` iteration methods. These methods split the flow iterator into two: a "slim" iterator which contains the current id, branches, etc., and a "globals" object which contains the variables and visit states. This makes it a lot easier to manage multiple iterators that all share the same global state.
- runScript can now return strings and numbers, not just booleans. Useful if you're using scripts properties in articy:draft to return more complex types.
