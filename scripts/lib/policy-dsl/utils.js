if (!exports) {
  // just to shut nashorn up while running in the strict mode
  var exports = {};
}

exports.argsToArray = argsToArray;
exports.applyAll = applyAll;
exports.map = map;
exports.mapObjIndexed = mapObjIndexed;
exports.keys = keys;
exports.reduce = reduce;
exports.extend = extend;
exports.clone = clone;

// internal utils
function argsToArray(args) {
  var result = [];
  for (var idx = 0; idx < args.length; idx++) {
    result.push(args[idx]);
  }
  return result;
}

function applyAll(args, fns) {
  return map(
    function mapFn(fn) {
      return fn.apply(null, args);
    }, fns);
}

function map(fn, args) {
  var result = [];
  for (var idx = 0; idx < args.length; idx++) {
    result.push(fn(args[idx]));
  }
  return result;
}

function mapObjIndexed(mapFn, obj) {
  var result = {};
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      result[i] = mapFn(obj[i], i, obj);
    }
  }
  return result;
}

function reduce(reducer, init, arr) {
  var valSoFar = init;
  for (var idx = 0; idx < arr.length; idx++) {
    valSoFar = reducer(valSoFar, arr[idx]);
  }
  return valSoFar;
}

function extend(base, mix) {
  for (var i in mix) {
    if (mix.hasOwnProperty(i)) {
      base[i] = mix[i];
    }
  }
  return base;
}

function keys(obj) {
  var result = [];
  for (var i in obj) {
    if (obj.hasOwnProperty(i)) {
      result.push(i);
    }
  }
  return result;
}

function clone(obj) {
  if (obj === null || typeof obj !== 'object' || 'isActiveClone' in obj) {
    return obj;
  }

  var temp;
  if (obj instanceof Date) {
    temp = new obj.constructor();
  } else {
    temp = obj.constructor();
  }

  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      obj.isActiveClone = null;
      temp[key] = clone(obj[key]);
      delete obj.isActiveClone;
    }
  }
  return temp;
}
