"use strict";

/**
 * UserController
 * @description :: Server-side logic for manage users
 */
const _ = require('lodash');
const passport = require('passport');
const requestify = require('requestify');
const jwt = require('jwt-simple');
const findone = require('../blueprints/findone');

module.exports = {

    /**
     * Sign in by email\password
     * @param req
     * @param res
     */

    login(req, res) {

                passport.authenticate('local', _.partial(sails.config.passport.onPassportAuth, req, res))(req, res);

    },

    refreshToken(req, res) {

        var consumerId = req.param('consumerId');
        var consumerUsername = req.param('consumer');
        if (process.env.NODE_ENV === 'development' ) {
          return res.ok('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiI1MTUwMmU4MDc2YzI0NjI4YjhlMzg0ODRkODM3ZGY1MSJ9.mfboawm5_jJkFLmbefeA_jIm_uwy_dJjAJnpf89qtNY')
        }
        if (_.isUndefined(consumerId) || _.isUndefined(consumerUsername)) {
            return res.badRequest(null, {message: 'consumerId & consumer parameters are mandatory'});
        } else {
            requestify.post(sails.config.odin.kongAdmin + '/consumers/' + consumerUsername + '/jwt', {consumer_id: consumerId}).then(function(response) {
                // Get the response body
                var credential = response.getBody();
                var payload = {
                    iss: credential.key
                };
                var secret = credential.secret;
                var token = jwt.encode(payload, secret);
                return res.ok(token);
            });
        }
    },

    me(req, res) {
        req.params.id = req.user.id;
        findone(req, res);
    }
};
