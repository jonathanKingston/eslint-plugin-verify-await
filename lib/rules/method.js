/* global module */
"use strict";

function report(context, node, reason) {
  const source = context.getSourceCode().getText(node).split("\n")[0];
  context.report(node, `${reason}:  ${source}`);
}

const defaultSyncMethods = [
  "addListener",
  // Static DOM
  "getAttribute",
  "setAttribute",
  "toggleAttribute",
  "setProperty",
  "removeProperty",
  "removeAttribute",
  "appendChild",
  "removeChild",
  "addEventListener",
  "removeEventListener",
  // Is this too generic of a name?
  "closest",
  "getElementById",
  "querySelector",
  "querySelectorAll",
  "getMostRecentWindow",
  "createElement",
];

const defaultSyncFunctions = [
  "log",
  "setTimeout",
  "clearTimeout",
  "encodeURI",
  "exportFunction",
  "String",
];

const defaultNamedStaticMembers = [
  ["console", "error"],
  ["console", "log"],
  ["JSON", "stringify"],
  ["Object", "defineProperty"],
  ["Object", "create"],
  ["Object", "assign"],
  ["Math", "random"],
  ["Math", "floor"],
  ["Math", "round"],
  ["Math", "min"],
  ["performance", "now"],
];

const arrayMethods = [
  "join",
  "forEach",
];

const exemptMethod = [
  "addListener",
  "addEventListener",
];

function check(context, node) {
  const config = context.options[0] || {};
  const namedStaticMembers = defaultNamedStaticMembers.concat(config.namedStaticMembers || []);
  const syncFunctions = defaultSyncFunctions.concat(config.syncFunctions || []);
  const syncMethods = defaultSyncMethods.concat(config.syncMethods || []);

  // Code that we prevent being async
  if (node.callee.type === "MemberExpression" &&
      node.callee.property.type === "Identifier" &&
      exemptMethod.includes(node.callee.property.name) &&
      node.arguments.find(arg => arg.async)) {
    report(context, node, "Found async callback when not permitted");
    return;
  }

  // Code that is explicitly awaiting
  if (node.parent.type === "AwaitExpression" ||
      node.parent.type === "Program" ||
      node.parent.type === "ReturnStatement" ||
      node.parent.type === "ArrowFunctionExpression" ||
      (node.parent.type === "ExpressionStatement" && node.parent.parent.type === "AwaitExpression") ||
      (node.parent.type === "ExpressionStatement" && node.parent.parent.type === "ReturnStatement") ||
      (node.parent.type === "ExpressionStatement" && node.parent.parent.type === "Program")) {
    return;
  }

  // Code that is explicity calling then()
  if (node.parent.type === "MemberExpression" &&
      node.parent.property.type === "Identifier" &&
      node.parent.property.name === "then") {
    return;
  }

  // Calling super is always static
  if (node.callee.type === "Super") {
    return;
  }
 
  // Is a known sync function
  if (node.callee.type === "Identifier" &&
      syncFunctions.includes(node.callee.name)) {
    return;
  }
  
  // Methods on a regex are sync
  if (node.callee.type === "MemberExpression" &&
      node.callee.object.value instanceof RegExp) {
    return;
  }

  // Methods on an array are sync
  if (node.callee.type === "MemberExpression" &&
      node.callee.object.type === "ArrayExpression" &&
      arrayMethods.includes(node.callee.property.name)) {
    return;
  }

  // Named sync method (we ignore the object)
  if (node.callee.type === "MemberExpression" &&
      node.callee.property.type === "Identifier" &&
      syncMethods.includes(node.callee.property.name)) {
    return;
  }

  if (node.callee.type === "MemberExpression" &&
      node.callee.property.type === "Identifier" &&
      /^sync/.test(node.callee.property.name)) {
    return;
  }
  if (node.callee.type === "Identifier" &&
      /^sync/.test(node.callee.name)) {
    return;
  }

  // Checked:
  // Identifier
  if (node.callee.type === "MemberExpression") {
    // Has named object
    if (node.callee.object.type === "Identifier") {
      for (const [objectName, methodName] of namedStaticMembers) {
        if (node.callee.object.name === objectName &&
            node.callee.property.name === methodName) {
          return;
        }
      }
    }
  }

  // If we are Promise.all([...]) the call, ignore it
  if (node.parent.type === "ArrayExpression" &&
      node.parent.parent.type === "CallExpression" &&
      node.parent.parent.callee.type === "MemberExpression" &&
      node.parent.parent.callee.object.name === "Promise" &&
      (node.parent.parent.callee.property.name === "all" ||
       node.parent.parent.callee.property.name === "race")) {
    return;
  }
  //console.log("Found non await ", node, context.getSourceCode().getText(node.parent));
  report(context, node, "Found non syncronous declared function");
}

module.exports = {
  create(context) {
    return {
      CallExpression(node) {
        check(context, node);
      }
    };
  }
};
