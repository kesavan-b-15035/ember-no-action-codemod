import { computed, action } from '@ember/object';

export default Component.extend({
    test() {},
    method: action(function() {}),
    anotherMethod: action(function(param) {}),
    expr: action(function() {}),
    testAction: action(function() {})
});