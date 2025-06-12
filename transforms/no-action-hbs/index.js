module.exports = function ({ source /*, path*/ }, { parse, visit }) {
  const ast = parse(source);

  return visit(ast, (env) => {
    let { builders: b } = env.syntax;

    return {
      MustacheStatement(node) {
        if (node.path.original === 'action') {
          const firstParam = node.params[0];
          const secondParam = node.params[1];

          // Skip transformation if there are named arguments
          if (node.hash?.pairs?.length > 0) {
            return node;
          }

          if (firstParam.type === 'StringLiteral' && secondParam) {
            // Transform {{action "methodName" param}} to {{fn this.methodName param}}
            return b.mustache(b.path('fn'), [
              b.path(`this.${firstParam.value}`),
              ...node.params.slice(1)
            ]);
          } else if (firstParam.type === 'StringLiteral') {
            // Transform {{action "methodName"}} to this.methodName
            return b.mustache(b.path(`this.${firstParam.value}`));
          } else if (secondParam) {
            // Transform {{action this.method param}} to {{fn this.method param}}
            // Check if firstParam.original does not contain 'this.'
            if (!node.params[0].original.includes('this.')) {
              console.log('\nCheck this action '+node.params[0].original+' in JS file as it is from another instance');
            }
            return b.mustache(b.path('fn'), node.params);
          } else {
            // Transform {{action this.method}} to {{this.method}}
            // Check if firstParam.original does not contain 'this.'
            if (!firstParam.original.includes('this.')) {
              console.log('\nCheck this action '+firstParam.original+' in JS file as it is from another instance');
            }
            return b.mustache(firstParam);
          }
        }
      },

      SubExpression(node) {
        if (node.path.original === 'action') {
          const firstParam = node.params[0];
          const secondParam = node.params[1];

          // Skip transformation if there are named arguments
          if (node.hash?.pairs?.length > 0) {
            return node;
          }

          if (firstParam.type === 'StringLiteral' && secondParam) {
            // Transform (action "methodName" param) to (fn this.methodName param)
            return b.sexpr(b.path('fn'), [
              b.path(`this.${firstParam.value}`),
              ...node.params.slice(1)
            ]);
          } else if (firstParam.type === 'StringLiteral') {
            // Transform (action "methodName") to this.methodName
            return b.path(`this.${firstParam.value}`);
          } else if (secondParam) {
            // Transform (action this.method param) to (fn this.method param)
            // Check if firstParam.original does not contain 'this.'
            if (!node.params[0].original.includes('this.')) {
              console.log('\nCheck this action '+node.params[0].original+' in JS file as it is from another instance');
            }
            return b.sexpr(b.path('fn'), node.params);
          } else {
            // Transform (action this.method) to this.method
            // Check if firstParam.original does not contain 'this.'
             if (!firstParam.original.includes('this.')) {
              console.log('\nCheck this action '+firstParam.original+' in JS file as it is from another instance');
            }
            return b.path(firstParam.original);
          }
        }
      },

      ElementModifierStatement(node) {
        if (node.path.original === 'action') {
          const firstParam = node.params[0];
          const secondParam = node.params[1];

          // For named arguments, preserve the original node structure
          if (node.hash?.pairs?.length > 0) {
            // Create a new modifier with the same structure
            const newNode = b.elementModifier(
              'action',
              node.params,
              node.hash
            );
            // Copy over location info to preserve formatting
            newNode.loc = node.loc;
            return newNode;
          }

          // For non-named arguments, transform to on helper
          const clickParam = b.string('click');
          if (firstParam.type === 'StringLiteral') {
            const methodName = b.path(`this.${firstParam.value}`);
            // If there are additional params, use fn helper
            if (secondParam) {
              const fnExpr = b.sexpr(b.path('fn'), [
                methodName,
                ...node.params.slice(1)
              ]);
              const newNode = b.elementModifier('on', [clickParam, fnExpr]);
              newNode.loc = node.loc; // Preserve location info
              return newNode;
            } else {
              // Simple case, just the method name
              const newNode = b.elementModifier('on', [clickParam, methodName]);
              newNode.loc = node.loc; // Preserve location info
              return newNode;
            }
          } else {
            // Handle transformations for non-string literals
            const newNode = b.elementModifier('on', [
              clickParam,
              secondParam ? 
                b.sexpr(b.path('fn'), node.params) : 
                firstParam
            ]);
            newNode.loc = node.loc; // Preserve location info
            return newNode;
          }
        }
      }
    };
  });
};

module.exports.type = 'hbs';
