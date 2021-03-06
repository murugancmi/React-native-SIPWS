'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Utils = require('./Utils');
var debug = require('react-native-debug')('JsSIP:DigestAuthentication');
var debugerror = require('react-native-debug')('JsSIP:ERROR:DigestAuthentication');

debugerror.log = console.warn.bind(console);

module.exports = function () {
  function DigestAuthentication(credentials) {
    _classCallCheck(this, DigestAuthentication);

    this._credentials = credentials;
    this._cnonce = null;
    this._nc = 0;
    this._ncHex = '00000000';
    this._algorithm = null;
    this._realm = null;
    this._nonce = null;
    this._opaque = null;
    this._stale = null;
    this._qop = null;
    this._method = null;
    this._uri = null;
    this._ha1 = null;
    this._response = null;
  }

  _createClass(DigestAuthentication, [{
    key: 'get',
    value: function get(parameter) {
      switch (parameter) {
        case 'realm':
          return this._realm;

        case 'ha1':
          return this._ha1;

        default:
          debugerror('get() | cannot get "%s" parameter', parameter);

          return undefined;
      }
    }

    /**
    * Performs Digest authentication given a SIP request and the challenge
    * received in a response to that request.
    * Returns true if auth was successfully generated, false otherwise.
    */

  }, {
    key: 'authenticate',
    value: function authenticate(_ref, challenge) /* test interface */{
      var method = _ref.method,
          ruri = _ref.ruri,
          body = _ref.body;
      var cnonce = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : null;

      this._algorithm = challenge.algorithm;
      this._realm = challenge.realm;
      this._nonce = challenge.nonce;
      this._opaque = challenge.opaque;
      this._stale = challenge.stale;

      if (this._algorithm) {
        if (this._algorithm !== 'MD5') {
          debugerror('authenticate() | challenge with Digest algorithm different than "MD5", authentication aborted');

          return false;
        }
      } else {
        this._algorithm = 'MD5';
      }

      if (!this._nonce) {
        debugerror('authenticate() | challenge without Digest nonce, authentication aborted');

        return false;
      }

      if (!this._realm) {
        debugerror('authenticate() | challenge without Digest realm, authentication aborted');

        return false;
      }

      // If no plain SIP password is provided.
      if (!this._credentials.password) {
        // If ha1 is not provided we cannot authenticate.
        if (!this._credentials.ha1) {
          debugerror('authenticate() | no plain SIP password nor ha1 provided, authentication aborted');

          return false;
        }

        // If the realm does not match the stored realm we cannot authenticate.
        if (this._credentials.realm !== this._realm) {
          debugerror('authenticate() | no plain SIP password, and stored `realm` does not match the given `realm`, cannot authenticate [stored:"%s", given:"%s"]', this._credentials.realm, this._realm);

          return false;
        }
      }

      // 'qop' can contain a list of values (Array). Let's choose just one.
      if (challenge.qop) {
        if (challenge.qop.indexOf('auth-int') > -1) {
          this._qop = 'auth-int';
        } else if (challenge.qop.indexOf('auth') > -1) {
          this._qop = 'auth';
        } else {
          // Otherwise 'qop' is present but does not contain 'auth' or 'auth-int', so abort here.
          debugerror('authenticate() | challenge without Digest qop different than "auth" or "auth-int", authentication aborted');

          return false;
        }
      } else {
        this._qop = null;
      }

      // Fill other attributes.

      this._method = method;
      this._uri = ruri;
      this._cnonce = cnonce || Utils.createRandomToken(12);
      this._nc += 1;
      var hex = Number(this._nc).toString(16);

      this._ncHex = '00000000'.substr(0, 8 - hex.length) + hex;

      // Nc-value = 8LHEX. Max value = 'FFFFFFFF'.
      if (this._nc === 4294967296) {
        this._nc = 1;
        this._ncHex = '00000001';
      }

      // Calculate the Digest "response" value.

      // If we have plain SIP password then regenerate ha1.
      if (this._credentials.password) {
        // HA1 = MD5(A1) = MD5(username:realm:password).
        this._ha1 = Utils.calculateMD5(this._credentials.username + ':' + this._realm + ':' + this._credentials.password);
      }
      // Otherwise reuse the stored ha1.
      else {
          this._ha1 = this._credentials.ha1;
        }

      var ha2 = void 0;

      if (this._qop === 'auth') {
        // HA2 = MD5(A2) = MD5(method:digestURI).
        ha2 = Utils.calculateMD5(this._method + ':' + this._uri);
        // Response = MD5(HA1:nonce:nonceCount:credentialsNonce:qop:HA2).
        this._response = Utils.calculateMD5(this._ha1 + ':' + this._nonce + ':' + this._ncHex + ':' + this._cnonce + ':auth:' + ha2);
      } else if (this._qop === 'auth-int') {
        // HA2 = MD5(A2) = MD5(method:digestURI:MD5(entityBody)).
        ha2 = Utils.calculateMD5(this._method + ':' + this._uri + ':' + Utils.calculateMD5(body ? body : ''));
        // Response = MD5(HA1:nonce:nonceCount:credentialsNonce:qop:HA2).
        this._response = Utils.calculateMD5(this._ha1 + ':' + this._nonce + ':' + this._ncHex + ':' + this._cnonce + ':auth-int:' + ha2);
      } else if (this._qop === null) {
        // HA2 = MD5(A2) = MD5(method:digestURI).
        ha2 = Utils.calculateMD5(this._method + ':' + this._uri);
        // Response = MD5(HA1:nonce:HA2).
        this._response = Utils.calculateMD5(this._ha1 + ':' + this._nonce + ':' + ha2);
      }

      debug('authenticate() | response generated');

      return true;
    }

    /**
    * Return the Proxy-Authorization or WWW-Authorization header value.
    */

  }, {
    key: 'toString',
    value: function toString() {
      var auth_params = [];

      if (!this._response) {
        throw new Error('response field does not exist, cannot generate Authorization header');
      }

      auth_params.push('algorithm=' + this._algorithm);
      auth_params.push('username="' + this._credentials.username + '"');
      auth_params.push('realm="' + this._realm + '"');
      auth_params.push('nonce="' + this._nonce + '"');
      auth_params.push('uri="' + this._uri + '"');
      auth_params.push('response="' + this._response + '"');
      if (this._opaque) {
        auth_params.push('opaque="' + this._opaque + '"');
      }
      if (this._qop) {
        auth_params.push('qop=' + this._qop);
        auth_params.push('cnonce="' + this._cnonce + '"');
        auth_params.push('nc=' + this._ncHex);
      }

      return 'Digest ' + auth_params.join(', ');
    }
  }]);

  return DigestAuthentication;
}();