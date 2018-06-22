"use strict";

/**
 * File
 * @description :: Model for storing File records
 */

const shortId = require('shortid');
const fs = require('fs');
const _ = require('lodash');
const CURRENT_FILE = __filename.slice(__dirname.length + 1, -3);

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
        fileName: {
            type: 'string',
            size: 15
        },
        name: {
            type: 'string',
            required: true,
            size: 150,
            minLength: 1
        },
        description: {
            type: 'string',
            required: true,
            size: 350
        },
        notes: {
            type: 'string',
            size: 500
        },
        visible: {
            type: 'boolean',
            defaultsTo: false
        },
        url: {
            type: 'string',
            url: true,
            size: 500
        },
        deletedAt: {
            type: 'datetime'
        },
        publishedAt: {
            type: 'datetime'
        },
        unPublishedAt: {
            type: 'datetime'
        },
        rejectedAt: {
            type: 'datetime'
        },
        cancelledAt: {
            type: 'datetime'
        },
        reviewedAt: {
            type: 'datetime'
        },
        maps: {
            collection: 'map',
            via: 'file'
        },
        charts: {
            collection: 'chart',
            via: 'file'
        },
        gatheringDate: {
            type: 'date'
        },
        layout: {
            type: 'boolean',
            defaultsTo: false
        },
        urgent: {
            type: 'boolean',
            defaultsTo: false
        },
        updated: {
            type: 'boolean',
            defaultsTo: false
        },
        type: {
            model: 'filetype'
        },
        updateFrequency: {
            model: 'updatefrequency'
        },
        status: {
            model: 'status'
        },
        organization: {
            model: 'organization',
            required: true
        },
        optionals: {
            type: 'json'
        },
        dataset: {
            model: 'dataset'
        },
        restService: {
            model: 'restservice'
        },
        soapService: {
            model: 'soapservice'
        },
        tags: {
            collection: 'tag',
            via: 'files',
            dominant: true
        },
        owner: {
            model: 'user',
            required: true
        },
        createdBy: {
            model: 'user'
        },

        toJSON() {
            return this.toObject();
        }
    },

    searchables: [
        'name', 'description', 'fileName'
    ],

    beforeUpdate: (values, next) => {
        if (values.fileName)
            values.url = sails.config.odin.baseUrl + '/files/' + values.fileName + '/download';
        next()
    },
    beforeCreate: (values, next) => {
        if (_.endsWith(values.url, '/id')) {
            values.url = _.replace(values.url, 'model', 'files');
            values.url = _.replace(values.url, 'id', values.fileName);
            values.url = values.url + '/download';
        }
        if (!values.status) {
            Config.findOne({key: 'defaultStatus'}).then(record => {
                values.status = record.value;
                next();
            });
        } else {
            next();
        }
    },
    afterUpdate: (values, next) => {
        values.operationExplicit = "afterUpdate";
        UpdateDataJsonService.updateJson(values, CURRENT_FILE);
        if (values.dataset)
            ZipService.createZip(values.dataset);
        next();
    },
    afterCreate: (values, next) => {
        FileType.findOne(values.type).then((type) => {
            if (type.api) {
                FileJob.destroy({file: values.id, finish: false}).then((filejobs) => console.log('file jobs deleted', filejobs))
                // if the file is not urgent, add it to the file job queue, to be parsed on the cron
                if (values.urgent === false) {
                    FileJob.create({file: values.id}).then((fileJob) => console.log(fileJob)).catch((err) => console.log(err))
                }
            }
        })
        values.operationExplicit = "afterCreate";
        UpdateDataJsonService.updateJson(values, CURRENT_FILE);
        if (values.dataset)
            ZipService.createZip(values.dataset);

        next();
    },
    afterDestroy: (destroyedRecords, next) => {
        if (!_.isEmpty(destroyedRecords)) {
            destroyedRecords = destroyedRecords[0];
            UnpublishService.unpublish(destroyedRecords);
            UploadService.deleteFile(destroyedRecords.dataset, destroyedRecords.fileName, next);
        }
        destroyedRecords.operationExplicit = "afterDestroy";
        UpdateDataJsonService.updateJson(destroyedRecords, CURRENT_FILE);
        next();
    }
};
