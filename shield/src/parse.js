'use strict';

const { parse: acornParse } = require('acorn');

const OPTIONS = {
  ecmaVersion: 'latest',
  locations: true,
  allowHashBang: true,
  allowReturnOutsideFunction: true,
  allowAwaitOutsideFunction: true,
};

function parse(source) {
  try {
    return acornParse(source, { ...OPTIONS, sourceType: 'module' });
  } catch (moduleErr) {
    try {
      return acornParse(source, { ...OPTIONS, sourceType: 'script' });
    } catch {
      throw moduleErr;
    }
  }
}

function patternNames(pattern, out = []) {
  if (!pattern) return out;
  switch (pattern.type) {
    case 'Identifier':
      out.push(pattern.name);
      break;
    case 'ObjectPattern':
      for (const prop of pattern.properties) {
        patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out);
      }
      break;
    case 'ArrayPattern':
      for (const element of pattern.elements) if (element) patternNames(element, out);
      break;
    case 'AssignmentPattern':
      patternNames(pattern.left, out);
      break;
    case 'RestElement':
      patternNames(pattern.argument, out);
      break;
    default:
      break;
  }
  return out;
}

function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked).join('');
  }
  return null;
}

function requireTarget(node) {
  if (!node || node.type !== 'CallExpression') return null;
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'require') return null;
  return staticString(node.arguments[0]);
}

// name -> module for `const fs = require('fs')`
// name -> { module, prop } for `const { exec } = require('child_process')`
function collectBindings(ast) {
  const modules = new Map();
  const members = new Map();

  const bindImport = (specifiers, source) => {
    for (const spec of specifiers) {
      if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportNamespaceSpecifier') {
        modules.set(spec.local.name, source);
      } else if (spec.type === 'ImportSpecifier') {
        const imported = spec.imported.name || spec.imported.value;
        members.set(spec.local.name, { module: source, prop: imported });
      }
    }
  };

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      bindImport(node.specifiers, node.source.value);
      continue;
    }
    if (node.type !== 'VariableDeclaration') continue;
    for (const decl of node.declarations) {
      const source = requireTarget(decl.init);
      if (!source) continue;
      if (decl.id.type === 'Identifier') {
        modules.set(decl.id.name, source);
      } else if (decl.id.type === 'ObjectPattern') {
        for (const prop of decl.id.properties) {
          if (prop.type !== 'Property' || prop.value.type !== 'Identifier') continue;
          const key = prop.key.name || prop.key.value;
          members.set(prop.value.name, { module: source, prop: key });
        }
      }
    }
  }

  return { modules, members };
}

module.exports = { parse, patternNames, staticString, requireTarget, collectBindings };
