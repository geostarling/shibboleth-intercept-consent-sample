'use strict';

if (!exports) {
  // just to shut nashorn up while running in the strict mode
  var exports = {};
}

var extend = require('./utils').extend;
var reduce = require('./utils').reduce;
var map = require('./utils').map;
var keys = require('./utils').keys;
var mapObjIndexed = require('./utils').mapObjIndexed;
var applyAll = require('./utils').applyAll;
var argsToArray = require('./utils').argsToArray;
var clone = require('./utils').clone;

exports.not = makePredicate(not);
exports.when = when;
exports.permitOverrides = permitOverrides;
exports.denyOverrides = denyOverrides;

exports.isPermit = isPermit;
exports.isDeny = isDeny;
exports.isIndeterminate = isIndeterminate;
exports.isNotApplicable = isNotApplicable;

exports.predicate = makePredicate;
exports.resolution = resolution;
exports.resolutions = resolutions;

var defPreds = require('./predicates');
var defaultPredicates = {
  t: makePredicate(defPreds.t),
  f: makePredicate(defPreds.f),
  propertyEquals: makePredicate(defPreds.propertyEquals)
};
exports.predicates = defaultPredicates;

var defaultResolutions = {
  permit: resolution(permit),
  deny: deny,
  indeterminate: indeterminate
};

// FIXME
var res = resolutions(defaultResolutions);
exports.permit = res.permit;
exports.deny = res.deny;
exports.indeterminate = res.indeterminate;
exports.notApplicable = notApplicable;

function resolutions(userResolutions) {
  var allResolutions = extend(extend({}, defaultResolutions), userResolutions);

  // shared between all of provided resolution functions
  var sharedProto = {};

  return mapObjIndexed(
    function mapper(fn, fnName) {
      // FIXME wrapper is not proper function name
      var wrapper = function wrapper() {
        var result = fn.apply(this, arguments);

        var props = keys(allResolutions);
        // we have to define all of the properties so that they will be copied to the proxy obj.
        map(
          function generatePropProxies(property) {
            var desc = {
              enumerable: true,
              get: function getFn() {
                return sharedProto[property];
              }
            };
            Object.defineProperty(result, property, desc);
          },
          props);

        return result;
      };
      sharedProto[fnName] = wrapper;
      return wrapper;
    },
    allResolutions);
}

function resolution(resFn) {
  return function resolutionWrapper() {
    // FIXME change var names to something sane you slacker!
    var prevFn = this;
    if (!prevFn || typeof prevFn !== 'function') {
      prevFn = function defaultFn() {
        return {};
      };
    }
    // evaluate resolution function to resolutionFn instance
    var resInst  = resFn.apply(null, arguments);
    return function wrap(ctx) {
      // evaluate resolution chain (aka prevFn(ctx)) and pass it to resolution instance as resultSioFar parameter (also clone it so it cannot be modified by current resolution)
      return resInst(ctx, clone(prevFn(ctx)));
    };
  };
}

// predicates
function when(pred) {
  var builder = function predBuilder(ctx) {
    if (!pred) {
      return false;
    }
    return pred(ctx);
  };
  return extend(builder, predicateBuilderProto);
}

function and(pred) {
  var that = this;
  return function andPredicate(ctx) {
    return that(ctx) && pred(ctx);
  };
}

function or(pred) {
  var that = this;
  return function orPredicate(ctx) {
    return that(ctx) || pred(ctx);
  };
}

function not(pred) {
  return function notPredicate(ctx) {
    return !pred(ctx);
  };
}

function isPermit(result) {
  return result._resolution === 'Permit';
}

function isDeny(result) {
  return result._resolution === 'Deny';
}

function isIndeterminate(result) {
  return !result._resolution || result._resolution === 'Indeterminate';
}

function isNotApplicable(result) {
  return result._resolution === 'Not Applicable';
}

function notApplicable() {
  return function notApplicableFn() {
    return {
      _resolution: 'Not Applicable'
    };
  };
}

// policy builder
function then(resolutionChain) {
  var predicate = this;
  var thenPolicy = function thenPolicyFn(ctx) {
    if (predicate(ctx)) {
      if (typeof resolutionChain === 'undefined') {
        return indeterminate()();
      }
      return resolutionChain(ctx);
    }
    return notApplicable()();
  };
  return extend(thenPolicy, thenPolicyProto);
}

function otherwise(elseChain) {
  var thenPolicy = this;
  return function thenOtherwisePolicy(ctx) {
    var thenResult = thenPolicy(ctx);
    if (isNotApplicable(thenResult)) {
      return elseChain(ctx);
    }
    return thenResult;
  };
}

// resolutions
function permit() {
  return function permitFn(ctx, resultSoFar) {
    // FIXME remove constants
    resultSoFar._resolution = 'Permit';
    return resultSoFar;
  };
}

// FIXME deduplicate
function deny() {
  var prevFn = this;
  if (!prevFn || typeof prevFn !== 'function') {
    prevFn = function defaultFn() {
      return {};
    };
  }
  return function denyFn(ctx) {
    var resultSoFar = prevFn(ctx);
    resultSoFar._resolution = 'Deny';
    return resultSoFar;
  };
}

// FIXME deduplicate
function indeterminate() {
  var prevFn = this;
  if (!prevFn || typeof prevFn !== 'function') {
    prevFn = function defaultFn() {
      return {};
    };
  }
  return function indeterminateFn(ctx) {
    var resultSoFar = prevFn(ctx);
    resultSoFar._resolution = 'Indeterminate';
    return resultSoFar;
  };
}

// combining policies
function permitOverrides() {
  var policies = argsToArray(arguments);

  return function permitOverridesPolicy(ctx) {
    function reducer(resultSoFar, nextResult) {
      var newResult = extend(clone(resultSoFar), nextResult);
      if (isPermit(resultSoFar) || isPermit(nextResult)) {
        // FIXME no string literals
        newResult._resolution = 'Permit';
        return newResult;
      }
      if (isNotApplicable(resultSoFar) && isNotApplicable(nextResult)) {
        newResult._resolution = 'Not Applicable';
        return newResult;
      }
      if (isDeny(resultSoFar) || isDeny(nextResult)) {
        newResult._resolution = 'Deny';
        return newResult;
      }
      newResult._resolution = 'Indeterminate';
      return newResult;
    }
    var partialResults = applyAll([ctx], policies);
    return reduce(reducer, partialResults.slice(0, 1)[0], partialResults.slice(1));
  };
}

function denyOverrides() {
  var policies = argsToArray(arguments);

  return function denyOverridesPolicy(ctx) {
    function reducer(resultSoFar, nextResult) {
      var newResult = extend(clone(resultSoFar), nextResult);
      if (isDeny(resultSoFar) || isDeny(nextResult)) {
        // FIXME no string literals
        newResult._resolution = 'Deny';
        return newResult;
      }
      if (isNotApplicable(resultSoFar) && isNotApplicable(resultSoFar)) {
        // FIXME no string literals
        newResult._resolution = 'Not Applicable';
        return newResult;
      }
      if (isPermit(resultSoFar) || isPermit(resultSoFar)) {
        // FIXME no string literals
        newResult._resolution = 'Permit';
        return newResult;
      }
      newResult._resolution = 'Indeterminate';
      return newResult;
    }
    var partialResults = applyAll([ctx], policies);
    return reduce(reducer, partialResults.slice(0, 1)[0], partialResults.slice(1));
  };
}

var predicateBuilderProto = {
  then: then
};

var thenPolicyProto = {
  otherwise: otherwise
};

var predicateProto = {
  or: or,
  and: and
};

// FIXME
function makePredicate(predFn, predProto) {
  return function predicateWrapper() {
    var pred = predFn.apply(this, arguments);
    var proto;
    if (predProto) {
      proto = extend(clone(predProto), predicateProto);
    } else {
      proto = clone(predicateProto);
    }
    return extend(pred, proto);
  };
}
