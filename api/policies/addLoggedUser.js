"use strict";

/**
 * addLoggedUser
 * @description :: Policy that injects user in `req` via JSON Web Token. In case there's no header,
 * continues as guest user.
 */

const passport = require('passport');

module.exports = (req, res, next) => {
    passport.authenticate('jwt', (error, user, info) => {
        if (error || !user) {
            next();
            return;
        }

        req.user = user;
        next();
    })(req, res);
};
