"use strict";

/**
 * Status
 * @description :: Model for storing Status records
 */

var shortId = require('shortid');

module.exports = {
    schema: true,

    attributes: {
        id: {
            type: 'string',
            unique: true,
            index: true,
            defaultsTo: shortId.generate,
            primaryKey: true,
            size: 15
        },
        name: {
            type: 'string',
            required: true,
            size: 150,
            unique: true,
            minLength: 1
        },
        files: {
            collection: 'file',
            via: 'status'
        },
        createdBy: {
            model: 'user'
        },
        datasets: {
            collection: 'dataset',
            via: 'status'
        },

        toJSON() {
            return this.toObject();
        }
    },

    searchables: ['name'],

    beforeUpdate: (values, next) => next(),
    beforeCreate: (values, next) => next()
};
