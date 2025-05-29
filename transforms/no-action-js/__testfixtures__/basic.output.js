import { action } from "@ember/object";
const Component = {
  test: action(function() {}),
  method: action(function() {}),
  anotherMethod: action(function(param) {}),

  expr: action(function() {
    let obj = {};
    let val = {...obj};
    return val;
  }),

  testAction: action(function() {}),
  asyncMethod: action(async function() {}),
  asyncProp: action(async function() {})
};