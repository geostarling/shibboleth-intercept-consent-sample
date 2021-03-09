var when = require('../lib/policy-dsl/policy.js').when;
var not = require('../lib/policy-dsl/policy.js').not;
var permit = require('../lib/policy-dsl/policy.js').permit;
var deny = require('../lib/policy-dsl/policy.js').deny;
var denyOverrides = require('../lib/policy-dsl/policy.js').denyOverrides;

var hasAttribute  = require('./utils.js').hasAttribute;
var relyingParty  = require('./utils.js').relyingParty;
var principal = require('./utils.js').principal;

function consentsAttrDef (attributes) {
  var roles = attributes['isMemberOf'];
  if (!roles) {
    return null;
  }
  var re = /^cn=B-18000-OSOBA-SOUHLASICI-S-([^,]+),ou=groups,o=example\.com$/i;

  return roles.reduce(function(acc, val) {
    var match = re.exec(val);
    if (match !== null) {
      acc.push(match[1]);
    }
    return acc;
   }, []);
}

function rolesAttrDef (attributes) {
  var roles = attributes['isMemberOf'];
  if (!roles) {
    return null;
  }
  var re = /^cn=([^,]+),([^,]+,)*ou=groups,o=fit\.cvut\.cz$/i;

  return roles.reduce(function(acc, val) {
    var match = re.exec(val);
    if (match !== null) {
      acc.push(match[1]);
    }
    return acc;
  }, []);
}

// this policy ensures that users with role alumni-context-member (ie. those from ou=alumni,o=example.com context)
// can login only to SP that publishes corresponding ..../allowedRoles extension in its metadata
var alumniPolicy =
    when(
        principal().attribute(rolesAttrDef).containsAll('alumni-context-member')
            .and(
                not(
                    relyingParty()
                        .hasAttribute('https://idp.fit.cvut.cz/attribute-def/metadata/allowedRoles')
                        .and(
                            relyingParty()
                                .attribute('https://idp.fit.cvut.cz/attribute-def/metadata/allowedRoles')
                                .containsAll('alumni-context-member')))))
    .then(deny())
    .otherwise(permit());

// this policy ensures that users with role B-18000-OSOBA-S-DOCASNYM-UCTEM (ie. those with temporary-person affiliation in IDM)
// can login only to SP that publishes corresponding ..../allowedRoles extension in its metadata
var temporaryAccountsPolicy =
    when(
        principal().attribute(rolesAttrDef).containsAll('B-18000-OSOBA-S-DOCASNYM-UCTEM')
            .and(
                not(
                    relyingParty()
                        .hasAttribute('https://idp.fit.cvut.cz/attribute-def/metadata/allowedRoles')
                        .and(
                            relyingParty()
                                .attribute('https://idp.fit.cvut.cz/attribute-def/metadata/allowedRoles')
                                .containsAll('B-18000-OSOBA-S-DOCASNYM-UCTEM')))))
    .then(deny())
    .otherwise(permit());

// this policy ensures that users with alumni-context-member role can successfuly log in only if they granted consent beforehand
var consentPolicy =
    when(
        principal().attribute(rolesAttrDef).containsAll('alumni-context-member')
            .and(
                not(
                    principal().attribute(consentsAttrDef).containsAll('ZPRACOVANI-OSOBNICH-UDAJU'))))
    .then(
        //setErrorContext('errId', 'MISSING_CONSENT')
        deny())
    .otherwise(permit());

exports.consentPolicy = denyOverrides(alumniPolicy, temporaryAccountsPolicy, consentPolicy);
