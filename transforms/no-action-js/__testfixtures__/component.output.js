import { computed, action } from '@ember/object';

export default Component.extend({
    test() {},
    method: action(function() {}),
    anotherMethod: action(function(param) {}),
    expr: action(function() {}),

    // FIXME: This method was renamed from 'test' to 'testAction' due to naming conflict. Update corresponding HBS templates.
    testAction: action(function() {})
});