import { action } from "@ember/object";
const Component = {
  methodUsedAsActionInHBS: action(function() {}),
  test() {},
  method: action(function() {}),
  anotherMethod: action(function(param) {}),

  expr: action(function() {
    let obj = {};
    let val = {...obj};
    return val;
  }),

  // FIXME: This method was renamed from 'test' to 'testAction' due to naming conflict. Update corresponding HBS templates.
  testAction: action(function() {}),

  asyncMethod: action(async function() {}),
  asyncProp: action(async function() {})
};