const MongoClient = require('mongodb').MongoClient;
const _ = require('lodash');
let bulkConnectionDb;

module.exports = {

    mongoConnect (dataset, filename, cb) {
        // Connect to the db
        MongoClient.connect("mongodb://" + sails.config.odin.dataStorage.host + ":" + sails.config.odin.dataStorage.port + "/" + dataset, (err, db)=> {
            if (err)
                return cb(err);
            cb(null, db);
        });
    },
    mongoSave (dataset, filename, json, cb) {
        json = _.transform(json, (result, each) => {
            result.push(_.mapKeys(each, (value, key) => {
                return _.replace(key, ".", " ");
            }));
        }, [])
        DataStorageService.mongoConnect(dataset, filename, (err, db) => {
            if (err)
                return cb(err)
            var collection = db.collection(filename);
            collection.insert(json, {
                w: 1
            }, (err) => {
                if (err)
                    return cb(err);
                db.close();
                cb(null, true)
            });
        });
    },
    mongoCount (dataset, filename, cb) {
        if (!_.isNull(filename)) {
            DataStorageService.mongoConnect(dataset, filename, (err, db) => {
                if (err)
                    return cb(err)
                var collection = db.collection(filename);
                collection.count({}, (err, count) => {
                    if (err)
                        console.error(err);
                    db.close();
                    cb(null, count);
                });
            });
        }
    },
    mongoRename (dataset, filename, newfilename, cb) {
        if (!_.isNull(filename)) {
            DataStorageService.mongoConnect(dataset, filename, (err, db) => {
                if (err)
                    return cb(err)
                var collection = db.collection(filename);
                collection.rename(newfilename).then(() => db.close());
                // db.close();
            });
        }
    },
    mongoReplace (oldDataset, newDataset, oldFilename, newFilename, cb) {
        return DataStorageService.mongoContents(oldDataset, oldFilename, 0, 0, function (err, json)  {
            if (err)
                return cb(err)

            this.deleteCollection(oldDataset, oldFilename, (err) => {
                if (err)
                    return cb(err)
            });
            this.mongoSave(newDataset, newFilename, json, (err, finished) => {
                if (err)
                    return cb(err)
                if (finished)
                    return cb(null, finished)
            })
        }.bind(this))

    },
    deleteCollection (dataset, filename, cb) {
        if (!_.isNull(filename)) {
            DataStorageService.mongoConnect(dataset, filename, (err, db) => {
                if (err)
                    return cb(err)
                var collection = db.collection(filename);
                collection.drop( (err, reply) => {
                    if (err)
                        console.error(err);
                    db.close();
                });
            });
        }
    },
    // TODO: should this be donde with streams?
    mongoContents (dataset, filename, limit, skip, cb) {
        DataStorageService.mongoConnect(dataset, filename, (err, db)=> {
            if (err)
                return cb(err)
            var data = [];

            var collection = db.collection(filename);
            var cursor = collection.find().skip(skip).limit(limit);

            cursor.each((err, doc) => {
                if (err)
                    console.error(err);
                if (doc !== null) {
                    data.push(doc);
                } else {
                    db.close();
                    return cb(null, data);
                }
            });
        });
    }
};
