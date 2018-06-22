"use strict";

/**
 * MapController
 * @description :: Server-side logic for ...
 */

const actionUtil = require('sails/lib/hooks/blueprints/actionUtil');
const _ = require('lodash');
const path = require('path');
let tj = require('@mapbox/togeojson'),
    fs = require('fs'),
    DOMParser = require('xmldom').DOMParser;

module.exports = {
    // publish: function(req, res) {
    //     const pk = actionUtil.requirePk(req);
    //     return PublishService.publishModel(_Map, pk, 'publishedStatus', res)
    // },
    unpublish: (req, res) => {
        const pk = actionUtil.requirePk(req);
        return PublishService.publishModel(_Map, pk, 'unpublished', res)
    },
    reject: (req, res) => {
        const pk = actionUtil.requirePk(req);
        return PublishService.publishModel(_Map, pk, 'rejected', res)
    },
    create: (req, res) => {
        const values = actionUtil.parseValues(req);
        // find the fileid within the parameters
        let fileId = _.get(values, 'file', '');
        let latitude = _.get(values, 'latitudeKey', '');
        let longitude = _.get(values, 'longitudeKey', '');

        let properties = _.get(values, 'properties', '');

        let propertiesArray = _.split(properties, ',');

        let link = _.get(values, 'link', null);

        if (fileId === '')
            return res.notFound();

        // look for the file with given id
        File.findOne(fileId).populate('type').populate('dataset').exec(function (err, record) {
            if (err)
                return res.negotiate(err);

            // check if file is kml ; if not
            if (_.indexOf(record.type.mimetype, 'application/vnd.google-earth.kml+xml') === -1) {
                // if link is given, iframe is asumed, then geojson won't be created
                if (link !== null) {
                    this.mapCreate(values, req, res)
                } else {
                    // fetch the collection data of the file
                    // TODO: check if this can be accomplished with streams
                    DataStorageService.mongoContents(record.dataset.id, record.fileName, 0, 0, function (err, data) {
                        if (err)
                            return res.negotiate(err)
                        this.generateGeoJson(data, latitude, longitude, propertiesArray, function (geoJson, incorrect, correct) {
                            values.geojson = geoJson;
                            // Once the geoJson is created, we create the map
                            UploadService.metadataSave(_Map, values, 'maps', req, res, {
                                incorrect: incorrect,
                                correct: correct
                            });

                        }.bind(this));
                    }.bind(this)); // else, is a kml;
                }
            } else {
                // TODO: fix crash on big files
                this.kmlToGeoJson(record, (geoJson) => {
                    values.geojson = geoJson;
                    UploadService.metadataSave(_Map, values, 'maps', req, res, {
                        incorrect: 0,
                        correct: 0
                    });
                })
            }

        }.bind(this));

    },

    update: (req, res) => {
        const values = actionUtil.parseValues(req);
        // find the fileid within the parameters
        let fileId = _.get(values, 'file', '');
        let latitude = _.get(values, 'latitudeKey', '');
        let longitude = _.get(values, 'longitudeKey', '');
        let kml = _.get(values, 'kml', false);

        let properties = _.get(values, 'properties', '');

        let propertiesArray = _.split(properties, ',');

        let link = _.get(values, 'link', null);

        if (fileId === '')
            return res.notFound();

        // look for the file with given id
        File.findOne(fileId).exec(function (err, record) {
            if (err)
                return res.negotiate(err);

            if (link !== null || kml === true) {
                UploadService.metadataUpdate(_Map, values, 'maps', req, res);
            } else {
                // fetch the collection data of the file
                DataStorageService.mongoContents(record.dataset, record.fileName, 0, 0, function (err, data) {
                    if (err)
                        return res.negotiate(err)

                    this.generateGeoJson(data, latitude, longitude, propertiesArray, (geoJson, incorrect, correct) => {
                        values.geojson = geoJson;
                        // Once the geoJson is created, we create the map
                        UploadService.metadataUpdate(_Map, values, 'maps', req, res, {
                            incorrect: incorrect,
                            correct: correct
                        });
                    });
                }.bind(this));
            }
        }.bind(this));
    },

    generateGeoJson(data, latitude, longitude, propertiesArray, cb) {
        let incorrect = 0;
        let correct = 0;
        let geoJson = {
            type: "FeatureCollection",
            features: []
        };

        _.forEach(data, function (value, index) {
            let propertiesMap = {};
            // for each property sent we add it to the map
            _.forEach(propertiesArray, (property) => {
                propertiesMap[property] = value[property];
            });
            // if commas are present, replace them with dots
            value[longitude] = _.toNumber(_.replace(value[longitude], ',', '.'));
            value[latitude] = _.toNumber(_.replace(value[latitude], ',', '.'));
            if (this.isInvalidCoordinate(value[latitude]) || this.isInvalidCoordinate(value[longitude])) {
                incorrect++;
            } else {
                correct++;
                let point = {
                    geometry: {
                        type: "Point",
                        coordinates: [value[longitude], value[latitude]]
                    },
                    type: 'Feature',
                    id: index + 1,
                    properties: propertiesMap
                };
                geoJson.features.push(point);
            }
        }.bind(this));
        cb(geoJson, incorrect, correct);
    },

    mapCreate: (values, req, res) => {
        _Map.create(values).exec(function created(err, newInstance) {
            if (err)
                return res.negotiate(err);

            if (req._sails.hooks.pubsub) {
                if (req.isSocket) {
                    Model.subscribe(req, newInstance);
                    Model.introduce(newInstance);
                }
                // Make sure data is JSON-serializable before publishing
                let publishData = _.isArray(newInstance)
                    ? _.map(newInstance, (instance) => {
                        return instance.toJSON();
                    })
                    : newInstance.toJSON();
                Model.publishCreate(publishData, !req.options.mirror && req);
            }

            // Send JSONP-friendly response if it's supported
            res.created(newInstance, {
                meta: {
                    code: sails.config.success.CREATED.code,
                    message: sails.config.success.CREATED.message
                },
                links: {
                    record: sails.config.odin.baseUrl + '/maps/' + newInstance.id,
                    all: sails.config.odin.baseUrl + '/maps'
                }
            });
        });
    },

    kmlToGeoJson(record, cb) {
        let filePath = path.resolve(sails.config.odin.uploadFolder + '/' + record.dataset.slug + '/' + record.fileName);

        let kml = new DOMParser().parseFromString(fs.readFileSync(filePath, 'utf8'));

        let converted = tj.kml(kml);

        let convertedWithStyles = tj.kml(kml, {styles: true});
        cb(convertedWithStyles)
    },

    isInvalidCoordinate(coordinate) {
        return (!_.isNumber(coordinate) || coordinate == 0 || isNaN(coordinate))
    }

};
