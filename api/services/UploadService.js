/*
 * This service handles the file uploads.
 * Performs validation and encodes text files with the encoding specified in config/odin.js.
 * And, if the file contents can be exposed via the API, inserts them into the non relational database.
 */

const actionUtil = require('sails/lib/hooks/blueprints/actionUtil');
const fs = require('fs');
const path = require('path');
const mime = require('mime');
const Converter = require("csvtojson").Converter;
const iconv = require('iconv-lite');
const XLSX = require('xlsx');
const pluralize = require('pluralize');
const slug = require('slug');
const jsonfile = require('jsonfile');
const _ = require('lodash');
const bulkMongo = require('bulk-mongo');
let Promise = require('bluebird');

module.exports = {
    createFile: (req, fileRequired, cb) => {
        // Set timeout to 15 minutes to let files convert to json and be uploaded
        req.setTimeout(15 * 60 * 1000);

        let uploadedFile = req.file('uploadFile').on('error', (err) => {
            console.log("uploadedFile");
        });
        if (uploadedFile.isNoop && fileRequired) {
            let err = {
                message: 'No file was uploaded'
            }
            return cb(err);
        } else {
            // a file was uploaded or is not required
            UploadService.uploadFile(req, uploadedFile, fileRequired, cb);
        }
    },

    uploadFile: (req, uploadedFile, fileRequired, cb) => {
        let data = actionUtil.parseValues(req);
        // Clean null on dates, else the ORM will crash
        data = UploadService.cleanDates(data)

        // if we are updating a file find the original
        if (!fileRequired) {
            let fileId = actionUtil.requirePk(req)
            File.findOne(fileId).populate('dataset').populate('type').then((file) => {
                // if the dataset has changed, find the new one
                if (file.dataset !== data.dataset) {
                    Dataset.findOne(data.dataset).then((dataset) => {
                        UploadService.updateFile(uploadedFile, data, file, dataset, fileRequired, req, cb)
                    });
                } else {
                    UploadService.updateFile(uploadedFile, data, file, file.dataset, fileRequired, req, cb)
                }
            });
        } else {
            // if is a new file, find the associated dataset and proceed with the upload
            Dataset.findOne(data.dataset).then((dataset) => {
                UploadService.uploadAndParseFile(uploadedFile, data, dataset, fileRequired, null, req, cb)
            });
        }

    },

    updateFile: (uploadedFile, data, file, newDataset, fileRequired, req, cb) => {
        if (uploadedFile.isNoop) {
            // if metadata has changed, but the name and the dataset is the same, nothing else to do
            if (data.name === file.name && newDataset.id === file.dataset.id) {
                return cb(null, data)
            }
            // If the file metadata was updated but no new file was added
            // update the fileName in case the name changed
            let oldExtension = data.fileName.split('.').pop();
            data.fileName = slug(data.name, {lower: true});
            data.fileName += '.' + oldExtension;

            // change physical file and mongo collection
            UploadService.changeMongoAndPhysicalFile(data, file, newDataset, cb)
        } else {
            UploadService.updateNewPhysicalFile(file, data, uploadedFile, newDataset, fileRequired, req, cb)
        }
    },

    updateNewPhysicalFile: (file, data, uploadedFile, newDataset, fileRequired, req, cb) => {
        // TODO: this should be done if the file is urgent, else should be done on the cron
        // DataStorageService.deleteCollection(file.dataset.id, file.fileName, (err) => cb(err));

        // if the uploaded name is the same of the one saved on the filesystem
        // don't deleted, just overwrite it
        if (file.fileName !== data.fileName) {
            let upath = UploadService.getFilePath(file.dataset, file);
            fs.lstat(upath, (err, stats) => {
                if (!err && stats.isFile()) {
                    UploadService.deleteFile(file.dataset, file.fileName, cb);
                }
            });
        }
        UploadService.uploadAndParseFile(uploadedFile, data, newDataset, fileRequired, file.fileName, req, cb)
    },

    uploadAndParseFile: (uploadedFile, data, newDataset, fileRequired, oldName, req, cb) => {
        let mimetype;
        let extension;
        FileType.find({
            select: ['mimetype', 'api', 'id']
        }).then(filetypes => {
            // Create an object for each allowed filetype
            let allowedTypes = _.transform(filetypes, (allowedTypes, filetype) => {
                _.forEach(filetype.mimetype, (mime) => {
                    allowedTypes[mime] = {
                        api: filetype.api,
                        id: filetype.id
                    }
                })
            }, {});

            // Physically upload the file
            uploadedFile.upload({
                saveAs: (uploadedFile, saveCb) => {
                    data.fileName = slug(data.name, {lower: true});
                    //Get the mime and the extension of the file
                    extension = uploadedFile.filename.split('.').pop();
                    mimetype = mime.lookup(extension);
                    data.fileName += '.' + extension;

                    // If the mime is present on the array of allowed types we can save it
                    if (_.isUndefined(allowedTypes[mimetype])) {
                        let err = {
                            status: 415,
                            code: 415,
                            message: 'filetype not allowed'
                        }
                        return cb(err);
                    }
                    return saveCb(null, data.fileName);

                },
                dirname: UploadService.getDatasetPath(newDataset),
                maxBytes: 4000000000
            }, function onUploadComplete(err, files) {
                if (err) {
                    return cb(err);
                }
                if (files.length === 0) {
                    let err = {
                        status: 400,
                        code: 400,
                        meessage: 'No file was uploaded'
                    }
                    return cb(err);
                }

                // Get the file mimetype and if it's available to parse to non-relational db
                let currentMimetype = allowedTypes[mimetype]
                data.type = currentMimetype.id

                // If the file is consumable via the API
                if (currentMimetype.api) {
                    if (data.urgent === 'false') {
                        if (data.id) {
                            FileJob.destroy({file: data.id, finish: false}).then((filejobs) => console.log('file jobs deleted', filejobs))

                            FileJob.create({file: data.id, new: false}).then((fileJob) => {
                                console.log(fileJob)
                                return cb(null, data);
                            }).catch((err) => cb(err))
                        } else {
                            return cb(null, data);
                        }

                    } else {
                        if (!fileRequired) {
                            DataStorageService.deleteCollection(data.dataset, oldName, (err) => cb(err));
                        }
                        let filePath = UploadService.getFilePath(newDataset, data);
                        let readStream = fs.createReadStream(filePath);

                        // TODO: add json support
                        if (extension === 'xls' || extension === 'xlsx') {
                            UploadService.xlsToJson(data, readStream, filePath, cb)
                        } else {
                            UploadService.csvToJson(newDataset.id, data, readStream, cb)
                        }
                    }
                } else {
                    return cb(null, data);

                }
            });
        }).catch(err => cb(err));
    },

    xlsToJson: (data, readStream, files, cb) => {
        readStream.pipe(iconv.decodeStream(sails.config.odin.defaultEncoding)).collect((err, result) => {
            if (err)
                return cb(err);
            if (sails.config.odin.defaultEncoding === 'utf8')
                result = '\ufeff' + result;

            //Convert XLS to json, store on nosql database
            try {
                let workbook = XLSX.readFile(files);
                //Join all the worksheets on one json
                let json = _.reduce(workbook.SheetNames, function(result, sheetName) {
                    let worksheet = workbook.Sheets[sheetName];   
                    let currentJson = XLSX.utils.sheet_to_json(worksheet, {header:1});
                    result = _.concat(result, currentJson);
                    return result;
                }, []);         
                 console.log('json',json);
                // Solucion a los headers

                let headers = _.slice(json,0,1)[0]
                
                let dataLineas = _.slice(json, 1, json.length)
                console.log(headers);
                console.log(dataLineas);
                let headersFinal = _.transform(dataLineas, (function(acc, each){
                    let lineaJson = {}
                    for (let i = 0; i < headers.length; i++){
                        let clave = headers[i]
                        lineaJson[clave] = each[i]
                        console.log('lineasJson',lineaJson)
                     }
                     acc.push(lineaJson)
                }),[])
                console.log('headersFinal', headersFinal);


                DataStorageService.mongoSave(data.dataset, data.fileName, headersFinal, (err, done) => {
                    if (err)
                        cb(err)
                    cb(null, data)
                });
            } catch (err) {
                return cb(err)
            }
            readStream.destroy();
            // return cb(null, data);
        });

    },

    csvToJson: (dataset, data, readStream, cb) => {
        let params = {
            constructResult: false,
            delimiter: 'auto',
            workerNum: 1
        };

        let converter = new Converter(params, {
            objectMode: true,
            highWaterMark: 65535
        });

        DataStorageService.mongoConnect(dataset, data.fileName, (err, db) => {
            console.log('Uploading: ', data.fileName)
            if (err)
                return cb(err)
            let factory_function = bulkMongo(db);
            let bulkWriter = factory_function(data.fileName);

            readStream.pipe(converter).pipe(bulkWriter);

            bulkWriter.on('error', (err) => {
                console.log('Error: ')
                console.log(err)
            })
            bulkWriter.on('done', () => {
                console.log('Finish uploading ', data.fileName)
                readStream.destroy();
                cb(null, data);
            })
        });
    },

    uploadImage: (req, res, cb) => {
        let data = actionUtil.parseValues(req);
        let savePath = path.resolve(sails.config.odin.uploadFolder + '/categories');
        let uploadFile = req.file('uploadImage').on('error', (err) => {});
        if (!uploadFile.isNoop) {
            data.fileName = slug(data.name, {lower: true});

            uploadFile.upload({
                saveAs: (file, cb) => {
                    let mimetype = mime.lookup(file.filename.split('.').pop());

                    if (mimetype !== 'image/svg+xml') {
                        return res.negotiate({status: 415, code: 415, message: 'filetype not allowed'});
                    } else {
                        data.fileName += '.svg';
                        return cb(null, data.fileName);
                    }
                },
                dirname: savePath
            }, function onUploadComplete(err, files) {
                if (err)
                    return res.serverError(err);
                if (files.length === 0) {
                    return res.badRequest(null, {message: 'No file was uploaded'});
                }
                cb(data);
            });
        } else {
            if (data.deleteImage === 'true') {
                UploadService.deleteImage(data.fileName);
                data.fileName = null;
            }
            return cb(data);
        }
    },

    changeMongoAndPhysicalFile: (data, file, newDataset, cb) => {
        // in case the fileName changed, rename the physical file
        let hasSameName = file.fileName === data.fileName;
        let isSameDataset = data.dataset === file.dataset.id;

        let originalPath = UploadService.getDatasetPath(file.dataset) + "/" + file.fileName;
        if (!isSameDataset) {
            // if the file changed of dataset
            DataStorageService.mongoReplace(file.dataset.id, newDataset.id, file.fileName, data.fileName, (err) => {
                if (err)
                    return cb(err)
            });
            let newPath = UploadService.getDatasetPath(newDataset) + "/" + data.fileName;
            UploadService.changeFileName(originalPath, newPath);
            return cb(null, data);
        }
        if (!hasSameName) {
            DataStorageService.mongoRename(file.dataset.id, file.fileName, data.fileName, (err) => cb(err));
            let newPath = UploadService.getDatasetPath(file.dataset) + "/" + data.fileName;
            UploadService.changeFileName(originalPath, newPath);
            return cb(null, data);
        }

    },

    uploadServiceFile: (file, json, callback) => {
        //TODO: Double check if we need https://www.npmjs.com/package/jsonfile
        let extension = 'json';
        file.fileName = slug(file.name, {lower: true});
        file.fileName += '.' + extension;
        let upath = UploadService.getFilePath(file.dataset, file);
        fs.lstat(upath, (err, stats) => {
            if (!err && stats.isFile()) {
                UploadService.deleteFile(file.dataset, file.fileName, {});
            }

            jsonfile.writeFile(upath, json, (err) => {
                if (err)
                    return callback(err, null);

                // Connect to the db
                DataStorageService.mongoSave(file.dataset.id, file.fileName, json, (err) => callback(err, null));

                // Update their visualizations
                file.dataset = file.dataset.id;
                VisualizationsUpdateService.update(file)

                callback(null, file);
            })
        });
    },

    getDatasetPath: (dataset) => {
        dataset = _.isObject(dataset)
            ? dataset.name
            : dataset
        return path.resolve(sails.config.odin.uploadFolder + '/' + slug(dataset, {lower: true}));
    },

    getFilePath: (dataset, file) => {
        return UploadService.getDatasetPath(dataset) + '/' + file.fileName;
    },

    // TODO: To be removed
    metadataSave: (model, data, modelName, req, res, extraRecordsResponse) => {
        model.create(data).exec(function created(err, newInstance) {
            if (err) {
                return res.negotiate(err);
            }
            LogService.log(req, newInstance.id);

            // Log to winston
            LogService.winstonLog('info', modelName + ' created', {
                ip: req.ip,
                resource: newInstance.id
            });

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

            let associations = [];

            _.forEach(model.definition, (value, key) => {
                if (value.foreignKey) {
                    associations.push(key);
                }
            });

            model.find(newInstance.id).populate(associations).exec((err, record) => {
                if (!_.isUndefined(extraRecordsResponse)) {
                    record[0] = _.merge(record[0], extraRecordsResponse);
                }
                if (err) {
                    res.negotiate(err);
                }
                res.created(record[0], {
                    meta: {
                        code: sails.config.success.CREATED.code,
                        message: sails.config.success.CREATED.message
                    },
                    links: {
                        record: sails.config.odin.baseUrl + '/' + pluralize(modelName) + ' /' + newInstance.id,
                        all: sails.config.odin.baseUrl + '/' + pluralize(modelName)
                    }
                });

            });
        });

    },

    // TODO: To be removed
    metadataUpdate: (model, data, modelName, req, res, extraRecordsResponse) => {
        // Look up the model
        model.update(data.id, data).exec(function updated(err, records) {

            // Differentiate between waterline-originated validation errors
            // and serious underlying issues. Respond with badRequest if a
            // validation error is encountered, w/ validation info.
            if (err) {
                return res.negotiate(err);
            }

            // Because this should only update a single record and update
            // returns an array, just use the first item.  If more than one
            // record was returned, something is amiss.
            if (!records || !records.length || records.length > 1) {
                req._sails.log.warn(util.format('Unexpected output from `%s.update`.', Model.globalId));
            }

            let updatedRecord = records[0];

            // If we have the pubsub hook, use the Model's publish method
            // to notify all subscribers about the update.
            if (req._sails.hooks.pubsub) {
                if (req.isSocket) {
                    model.subscribe(req, records);
                }
                model.publishUpdate(updatedRecord.id, _.cloneDeep(data), !req.options.mirror && req, {
                    previous: _.cloneDeep(matchingRecord.toJSON())
                });
            }

            LogService.log(req, updatedRecord.id);

            LogService.winstonLog('info', modelName + ' updated', {
                ip: req.ip,
                resource: updatedRecord.id
            });

            let associations = [];

            _.forEach(model.definition, (value, key) => {
                if (value.foreignKey) {
                    associations.push(key);
                }
            });
            //populate the response
            model.find(updatedRecord.id).populate(associations).exec((err, record) => {
                if (err) {
                    return res.negotiate(err);
                }

                //if we have any extraRecords to add to the response,
                // we merge it to the response
                if (!_.isUndefined(extraRecordsResponse)) {
                    record[0] = _.merge(record[0], extraRecordsResponse);
                }
                return res.updated(record[0], {
                    meta: {
                        code: sails.config.success.OK.code,
                        message: sails.config.success.OK.message
                    },
                    links: {
                        all: sails.config.odin.baseUrl + '/' + modelName,
                        record: sails.config.odin.baseUrl + '/' + modelName + '/' + record.id
                    }
                });

            });

        }); // </updated>

    },

    deleteFile: (dataset, fileName, cb) => {
        Promise.try(() => {
            if (_.isString(dataset)) {
                return Dataset.findOne(dataset).then((dataset) => dataset)
            }
            return dataset
        }).then((dataset) => {
            let path = sails.config.odin.uploadFolder + '/' + slug(dataset.name, {lower: true}) + '/' + fileName;

            fs.unlink(path, ()=> {
                DataStorageService.deleteCollection(dataset.id, fileName, (err) => cb(err));
                ZipService.createZip(dataset.id);
            });
        })
    },

    deleteImage: (fileName) => {
        let categoryPath = path.resolve(sails.config.odin.uploadFolder + '/categories/' + fileName);
        fs.unlink(categoryPath, (err) => {
            console.log(err)
            console.log('Category image deleted');
        })
    },

    changeFileName: (originalPath, newPath) => {
        fs.rename(originalPath, newPath, (err) => {
            if (err)
                throw err;
            console.log('File renamed');
        });
    },

    cleanDates: (data) => {
        // In case that publishedAt or gatheringDate values are 'null'
        // Set it to null, otherwise the ORM will crash
        data.publishedAt = data.publishedAt === 'null'
            ? null
            : data.publishedAt
        data.gatheringDate = data.gatheringDate === 'null'
            ? null
            : data.gatheringDate
        data.cancelledAt = data.cancelledAt === 'null'
            ? null
            : data.cancelledAt
        return data
    }
};
