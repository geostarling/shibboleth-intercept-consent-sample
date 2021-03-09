exports.propertyEquals = propertyEquals;
exports.t = t;
exports.f = f;

function propertyEquals(propKey, propValue) {
  return function propertyEqualsPredicate(ctx) {
    return ctx[propKey] === propValue;
  };
}

function t() {
  return function truePredicate() {
    return true;
  };
}

function f() {
  return function falsePredicate() {
    return false;
  };
}


