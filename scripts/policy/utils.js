
var isDeny = require('../lib//policy-dsl/policy.js').isDeny;
var predicate = require('../lib/policy-dsl/policy.js').predicate;

function collectExtensionAttrs(descr) {
  var result = {};
  var exts = descr.getExtensions();

  var EntityAttributes = Java.type('org.opensaml.saml.ext.saml2mdattr.EntityAttributes');

  function processAttrs(samlAttrs) {
    var result = {};

    function processVals(attrVals) {
      var result = [];
      for each (var val in attrVals) {
        // FIXME handle other types of content
        result.push(val.getTextContent());
      }
      return result;
    }

    for each (var attr in samlAttrs) {
      if(!result[attr.getName()]) {
        result[attr.getName()] = []
      }
      result[attr.getName()] = result[attr.getName()].concat(processVals(attr.getAttributeValues()));
    }
    return result;
  }

  if(exts) {
    var group = exts.getUnknownXMLObjects(EntityAttributes.DEFAULT_ELEMENT_NAME);

    if(group !== null && !group.isEmpty() && group.get(0) instanceof EntityAttributes) {
      var samlAttrs = group.get(0).getAttributes();
      if(samlAttrs) {
        var processedAttrs = processAttrs(samlAttrs);
        for (var attrName in processedAttrs) {
          result[attrName] = processedAttrs[attrName];
        }
      }
    }
  }

  // collect attributes recursively from all parent entities descriptors
  for(var parent = descr.getParent(); parent !== null; parent = parent.getParent()) {
    var parentAttrs = collectExtensionAttrs(parent);
    for (var parentAttrName in parentAttrs) {
      result[parentAttrName] = parentAttrs[parentAttrName];
    }
  }
  return result;
}

function createMetadataContext(entityDescr) {
  return {
    extensionAttributes: collectExtensionAttrs(entityDescr),
    wantAssertionsSigned: entityDescr.getSPSSODescriptor('urn:oasis:names:tc:SAML:2.0:protocol').getWantAssertionsSigned()
  };
}

function createRpContext(ctx) {
  var mdCtxt = ctx.getSubcontext('net.shibboleth.idp.profile.context.RelyingPartyContext').getRelyingPartyIdContextTree().getSubcontext('org.opensaml.saml.common.messaging.context.SAMLMetadataContext');
  return {
    entityId: ctx.getSubcontext('net.shibboleth.idp.profile.context.RelyingPartyContext'),
    metadata: createMetadataContext(mdCtxt.getEntityDescriptor())
  };
}

function createPrincipalContext(ctx) {
  var attrsCtx = ctx.getSubcontext('net.shibboleth.idp.profile.context.RelyingPartyContext').getSubcontext('net.shibboleth.idp.attribute.context.AttributeContext');
  var attrs = attrsCtx.getUnfilteredIdPAttributes();
  var result = {};

  function getAttrValues(idpAttribute) {
    var result = [];
    for each (var val in idpAttribute.getValues()) {
      result.push(val.getValue());
    }
    return result;
  }
  if (attrs) {
    result.attributes = {};
    for each (var attr in attrs.entrySet()) {
      result.attributes[attr.key] = getAttrValues(attr.value);
    }
  }
  return result;
}

// FIXME rename
function createValidationContext(ctx) {
  return {
    relyingParty: createRpContext(ctx),
    principal: createPrincipalContext(ctx)
    // TODO
    // provider: createProviderContext(reqCtx),
  };
}

function hasAttribute(attributeName) {
  return (function(ctx) {
    var rpCtx = this(ctx);
    var attributes = rpCtx.metadata.extensionAttributes;
    return attributes[attributeName] !== void 0;
  }).bind(this);
}

function getAsArray(attributeSource, ctx) {
    if (Array.isArray(attributeSource)) {
        return attributeSource;
    } else if (typeof attributeSource === 'function') {
        return attributeSource(ctx);
    } else if (attributeSource == null) {
        return [];
    }
    return [attributeSource];
}

function contains(thisVal, arr) {
  return arr.filter(function (val) { return val === thisVal; }).length;
}

function isIn(attributeSource) {
  return (function (ctx) {
    var thisAttrVals = this(ctx) || [];
    var otherAttrVals = getAsArray(attributeSource, ctx) || [];

    for each (var thisVal in thisAttrVals) {
      if (!contains(thisVal, otherAttrVals)){
        return false;
      }
    }
    return true;
  }).bind(this);
}

// TODO containsAll is nothing but isIn called with arguments this and other switched
function containsAll(attributeSource) {
    return (function (ctx) {
        var thisAttrVals = this(ctx) || [];
        var otherAttrVals = getAsArray(attributeSource, ctx) || [];

        for each (var otherVal in otherAttrVals) {
            if (!contains(otherVal, thisAttrVals)) {
                return false;
            }
        }
        return true;
    }).bind(this);
}

function relyingParty() {
  var lookupFn = function(ctx) {
    return ctx.relyingParty;
  };
  // populate "prototype" of relyingParty lookup fn
  lookupFn.hasAttribute = predicate(hasAttribute).bind(lookupFn);
  lookupFn.attribute = function attribute(attributeName) {
    var attrLookupFn = function(ctx) {
      return this(ctx).metadata.extensionAttributes[attributeName];
    };
    attrLookupFn =  attrLookupFn.bind(lookupFn);
    attrLookupFn.isIn = isIn;
    attrLookupFn.containsAll = containsAll;
    return attrLookupFn;
  };
  return lookupFn;
}

function principal() {
  var lookupFn = function(ctx) {
    return ctx.principal;
  };
  // populate "prototype" of principal lookup fn
  lookupFn.hasAttribute = predicate(hasAttribute).bind(lookupFn);
  lookupFn.attribute = function attribute(attrLookup) {
    var attrLookupFn = function(ctx) {
      if (typeof attrLookup === 'function') {
        return attrLookup(this(ctx).attributes);
      } else {
          // assume string
          return this(ctx).attributes[attrLookup];
      }
    };
    attrLookupFn = attrLookupFn.bind(this);
    attrLookupFn.isIn = isIn;
    attrLookupFn.containsAll = predicate(containsAll).bind(attrLookupFn);
    return attrLookupFn;
  };
  lookupFn.attribute.isIn = predicate(isIn).bind(lookupFn);

  return lookupFn;
}

function assertPolicy(policy, profileContext) {
  var ctx = createValidationContext(profileContext);
  var result = policy(ctx);
 return !isDeny(result);
// return true;
}

exports.relyingParty = relyingParty;
exports.principal = principal;
exports.assertPolicy = assertPolicy;
