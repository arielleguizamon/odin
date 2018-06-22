"use strict";

/**
 * Dataset
 * @description :: Model for storing Dataset records
 */

const shortId = require('shortid');
const slug = require('slug');
const fs = require('fs');
const mkdirp = require('mkdirp');
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
        name: {
            type: 'string',
            required: true,
            unique: true,
            size: 150,
            minLength: 1
        },
        slug: {
            unique: true,
            type: 'string'
        },
        description: {
            type: 'string',
            size: 350,
            required: true
        },
        notes: {
            type: 'string',
            size: 500
        },
        visible: {
            type: 'boolean',
            defaultsTo: false
        },
        starred: {
            type: 'boolean',
            defaultsTo: false,
            boolean: true
        },
        optionals: {
            type: 'json'
        },
        publishedAt: {
            type: 'datetime'
        },
        unPublishedAt: {
            type: 'datetime'
        },
        categories: {
            collection: 'category',
            via: 'datasets',
            dominant: true
        },
        subcategories: {
            collection: 'category',
            via: 'datasetsSubcategories',
            dominant: true
        },
        status: {
            model: 'status'
        },
        deletedAt: {
            type: 'datetime'
        },
        files: {
            collection: 'file',
            via: 'dataset'
        },
        tags: {
            collection: 'tag',
            via: 'datasets',
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

    removeEmptyAssociations: true,

    searchables: ['name', 'description', 'slug'],

    ignoredAssociations: ['subcategories'],

    beforeUpdate: (values, next) => {

        if (values.id) {

            Dataset.find(values.id).limit(1).then(function (originalDataset) {
                originalDataset = originalDataset[0];

                if (originalDataset.name !== values.name) {

                    var originalDirname = sails.config.odin.uploadFolder + "/" + slug(originalDataset.name, {
                        lower: true
                    });
                    var newDirname = sails.config.odin.uploadFolder + "/" + slug(values.name, {
                        lower: true
                    });
                    fs.rename(originalDirname, newDirname, function (err) {
                        if (err) throw err;
                        console.log('Datasets folder renamed');
                    });
                }
            });

        }
        if (values.name) {
            values.slug = slug(values.name, {
                lower: true
            });
        }
        values.operationExplicit = "afterUpdate";
        if (values.wasCreated) {
          values.wasCreated = true;
        }
        UpdateDataJsonService.updateJson(values, CURRENT_FILE);
        next()
    },
    beforeCreate: (values, next) => {
        if (values.name) {
            values.slug = slug(values.name, {
                lower: true
            });
        }
        Config.findOne({
            key: 'defaultStatus'
        }).exec(function (err, record) {
            values.status = record.value;
            values.operationExplicit = "afterCreate";
            values.wasCreated = false;
            UpdateDataJsonService.updateJson(values, CURRENT_FILE);
            next();
        });
    },
    saveDatasetAssociatedFile: (dataset) => {

        Dataset.find(dataset.id).populate(['categories', 'tags']).limit(1).then(function (dataset) {
            dataset = dataset[0];

            var datasetFolder = sails.config.odin.uploadFolder + "/" + dataset.slug;
            var datasetFile = datasetFolder + '/' + dataset.slug + '.txt'
            // Make the dataset folder
            mkdirp(datasetFolder, function (err) {
                if (err) console.error(err);
                else console.log('Dataset folder created on : ' + datasetFolder)

                // Get list of categories and tags
                var categories = _.reduce(dataset.categories, function (names, category) {
                    return names + ' ' + category.name

                }, '');
                var tags = _.reduce(dataset.tags, function (names, tag) {
                    return names + ' ' + tag.name
                }, '');

                // Text to write on file
                var fileText = 'Nombre: ' + dataset.name +
                    '\n Descripcion: ' + dataset.description +
                    '\n Notas: ' + dataset.notes +
                    '\n Categorias: ' + categories +
                    '\n Etiquetas: ' + tags +
                    '\n Publicacion: ' + dataset.publishedAt +
                    '\n Ultima modificacion: ' + dataset.updatedAt;

                fs.writeFile(datasetFile, fileText, function (err) {
                    if (err) {
                        return console.log(err);
                    }

                    console.log("The file was saved!");
                });
            });
        });

    },
    afterCreate: (values, next) => {
        Dataset.saveDatasetAssociatedFile(values);
        next()
    },
    afterUpdate: (values, next) => {
        Dataset.saveDatasetAssociatedFile(values);
        next()
    },
    afterDestroy: (values, next) => {
      values.operationExplicit = "afterDestroy";
      UpdateDataJsonService.updateJson(values, CURRENT_FILE);
      next();
    }
};
