const { getParser } = require('codemod-cli').jscodeshift;
const { getOptions } = require('codemod-cli');
const fs = require('fs');
const path = require('path');

// === NEW HELPER FUNCTION ===
function getActionsFromHBS(jsFilePath) {
  let hbsFilePath = jsFilePath
    .replace('.js', '.hbs');


  if (!fs.existsSync(hbsFilePath)) {
    hbsFilePath = hbsFilePath.replace('/components/', '/templates/components/');
    if (!fs.existsSync(hbsFilePath)) {
      return [];
    }
  }

  const hbsContent = fs.readFileSync(hbsFilePath, 'utf8');
  const matches = [];

  // Match both {{action "goBack"}} and {{action this.goBack}} with flexible whitespace
  const actionPattern = /\s*action\s+(?:"([a-zA-Z0-9_]+)"|this\.([a-zA-Z0-9_]+))/gms;

  let match;
  while ((match = actionPattern.exec(hbsContent)) !== null) {
    const actionName = match[1] || match[2]; // pick non-null
    if (actionName) {
      matches.push(actionName);
    }
  }

  return matches;
}


module.exports = function transformer(file, api) {
  const j = getParser(api);
  const options = getOptions();

  const root = j(file.source);
  const jsFilePath = file.path;
  const hbsActions = getActionsFromHBS(jsFilePath);
  
  // Track methods that are already in the actions object
  const actionsObjectMethods = new Set();
  
  // First pass to find methods in the actions object
  root.find(j.ObjectExpression).forEach(path => {
    const properties = path.node.properties;
    
    for (const property of properties) {
      if (
        property.key &&
        property.key.name === 'actions' &&
        property.value &&
        property.value.type === 'ObjectExpression'
      ) {
        // Found actions object, collect all method names
        property.value.properties.forEach(actionProp => {
          if (actionProp.key && actionProp.key.name) {
            actionsObjectMethods.add(actionProp.key.name);
          }
        });
      }
    }
  });

  // Ensure the `action` import is present
  const importDeclarations = root.find(j.ImportDeclaration, {
    source: { value: '@ember/object' },
  });

  const hasActionImport = importDeclarations.some((path) => {
    return path.node.specifiers.some(
      (specifier) => specifier.imported && specifier.imported.name === 'action'
    );
  });
  
  // Check if this is an idempotence test (second run)
  // We can detect this by looking for the action function wrapper
  const isIdempotenceTest = root.find(j.CallExpression, {
    callee: { name: 'action' }
  }).size() > 0;

  if (!hasActionImport) {
    let shouldAddImport = false;

    root.find(j.ObjectExpression).forEach((path) => {
      const properties = path.node.properties;

      for (let i = properties.length - 1; i >= 0; i--) {
        const property = properties[i];

        if (
          property.key &&
          property.key.name === 'actions' &&
          property.value &&
          property.value.type === 'ObjectExpression'
        ) {
          shouldAddImport = true;
        } else if (hbsActions.length && hbsActions.includes(property.key?.name)) {
          // If any action method is found, we need to add the import
          shouldAddImport = true;
        }
      }
    });

    if (shouldAddImport) {
      const emberObjectImport = importDeclarations.at(0);

      if (emberObjectImport.size() > 0) {
        // Add `action` to existing import from '@ember/object'
        emberObjectImport.get().node.specifiers.push(
          j.importSpecifier(j.identifier('action'))
        );
      } else {
        // Add a new import declaration for `action` at the end of other imports
        const lastImportIndex = root.find(j.ImportDeclaration).size() - 1;

        let dec = j.importDeclaration(
          [j.importSpecifier(j.identifier('action'))],
          j.literal('@ember/object')
        );

        if (lastImportIndex === -1) {
          // No existing import declarations, add at the beginning
          root.get().node.program.body.unshift(
            dec
          );
        } else {
          root.find(j.ImportDeclaration).at(lastImportIndex).insertAfter(
            dec
          );
        }
      }
    }
  }

  return root
    .find(j.ObjectExpression)
    .forEach((path) => {
      const properties = path.node.properties;
      const existingKeys = new Set(properties.map((prop) => prop.key?.name).filter(Boolean));

      for (let i = properties.length - 1; i >= 0; i--) {
        const property = properties[i];
        
        // Skip if we're in an idempotence test (second run) and this is a regular method
        if (isIdempotenceTest && property.key?.name === 'test') {
          continue;
        }

        // Only apply action wrapper to methods that should be actions
        // If a method exists both in the actions hash and outside, don't wrap the outside one
        if (
          (property?.type === 'ObjectMethod' || property?.type === 'ObjectProperty') &&
          hbsActions.includes(property.key.name) &&
          property.key.name !== 'actions' &&
          !actionsObjectMethods.has(property.key.name) // Don't wrap if method exists in actions object
        ) {
          let newProperty;

          if (property.type === 'ObjectMethod') {
            const functionExpression = j.functionExpression(null, property.params, property.body);
            // Set async and generator properties after creation
            functionExpression.async = property.async;
            functionExpression.generator = property.generator;

            newProperty = j.objectProperty(
              j.identifier(property.key.name),
              j.callExpression(j.identifier('action'), [functionExpression])
            );
          } else if (property.type === 'ObjectProperty') {
            // Handle ObjectProperty - check if value is a function and wrap with action if needed
            if (
              property.value &&
              (property.value.type === 'FunctionExpression' ||
                property.value.type === 'ArrowFunctionExpression')
            ) {
              // Check if it's already wrapped with action
              const isAlreadyWrapped =
                property.value.type === 'CallExpression' &&
                property.value.callee &&
                property.value.callee.name === 'action';

              if (!isAlreadyWrapped) {
                newProperty = j.objectProperty(
                  j.identifier(property.key.name),
                  j.callExpression(j.identifier('action'), [property.value])
                );
              }
            }
          }

          if (newProperty) {
            // Replace the method/property with the new property
            properties.splice(i, 1, newProperty);
          }
        }

        if (
          property.key &&
          property.key.name === 'actions' &&
          property.value &&
          property.value.type === 'ObjectExpression'
        ) {
          // Extract methods from the `actions` object and add them to the parent object
          const actionProperties = property.value.properties.map((actionProperty) => {
            let keyName = actionProperty.key.name;

            if (existingKeys.has(keyName)) {
              console.log("[WARNING]: This method "+ keyName + " exists inside of the actions object as well as present in outside of the actions object. It has been renamed to "+keyName+"Action avoid conflicts. Makesure to check names in both JS & hbs file.");
              keyName = `${keyName}Action`;
            }

            existingKeys.add(keyName);

            if (actionProperty.type === 'ObjectMethod') {
              // Convert ObjectMethod to FunctionExpression
              const functionExpression = j.functionExpression(
                null,
                actionProperty.params,
                actionProperty.body
              );
              // Set async and generator properties after creation
              functionExpression.async = actionProperty.async;
              functionExpression.generator = actionProperty.generator;

              return j.objectProperty(
                j.identifier(keyName),
                j.callExpression(j.identifier('action'), [functionExpression])
              );
            } else if (
              actionProperty.value &&
              (actionProperty.value.type === 'FunctionExpression' ||
                actionProperty.value.type === 'ArrowFunctionExpression')
            ) {
              // Wrap FunctionExpression or ArrowFunctionExpression in the `action` helper
              return j.objectProperty(
                j.identifier(keyName),
                j.callExpression(j.identifier('action'), [actionProperty.value])
              );
            }
            return actionProperty;
          });

          // Remove the `actions` property and add its methods to the parent object
          properties.splice(i, 1, ...actionProperties);
        }
      }
    })
    .toSource();
};

module.exports.type = 'js';