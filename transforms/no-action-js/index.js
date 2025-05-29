const { getParser } = require('codemod-cli').jscodeshift;
const { getOptions } = require('codemod-cli');
const fs = require('fs');
const path = require('path');

// === NEW HELPER FUNCTION ===
function getActionsFromHBS(jsFilePath) {
  const hbsFilePath = jsFilePath
    .replace('/components/', '/templates/components/')
    .replace('.js', '.hbs');

  if (!fs.existsSync(hbsFilePath)) {
    return [];
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

  // Ensure the `action` import is present
  const importDeclarations = root.find(j.ImportDeclaration, {
    source: { value: '@ember/object' },
  });

  const hasActionImport = importDeclarations.some((path) => {
    return path.node.specifiers.some(
      (specifier) => specifier.imported && specifier.imported.name === 'action'
    );
  });

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

        if(
          property?.type === 'ObjectMethod'  && 
          hbsActions.includes(property.key.name) &&
          property.key.name !== 'actions'
        ){
          const functionExpression = j.functionExpression(
            null,            
            property.params,   
            property.body
          );
          // Set async and generator properties after creation
          functionExpression.async = property.async;
          functionExpression.generator = property.generator;
          
          const newProperty = j.objectProperty(
            j.identifier(property.key.name),
            j.callExpression(
              j.identifier('action'),
              [functionExpression]
            )
          );
    
          // Replace the method with the new property
          properties.splice(i, 1, newProperty);
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