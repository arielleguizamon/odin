"use strict";

class ParamsProcessor {
    constructor(req) {
        this.req = req;
    }

    parse() {
        // Should return the final object
    }

    parseCriteria() {

    }

    parseSort() {

    }

    parseInclude() {

    }

    toString() {
        return this.req.query;
    }
}

module.exports = {
    ParamsProcessor
};