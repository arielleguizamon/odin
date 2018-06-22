/**
 * DataJsonController
 *
 * @description :: Server-side actions for handling incoming requests.
 * @help        :: See https://sailsjs.com/docs/concepts/actions
 */

const dataJsonS = require('../services/DataJsonService.js');
const fs = require('fs');

module.exports = {
     dataJson(req,res) {
       let obj;

       fs.readFile('files/dataJson/dataJson.json', (err, data) => {
        if (err) throw err;
        obj = JSON.parse(data);
        return res.json(obj)
        });
    }
};
