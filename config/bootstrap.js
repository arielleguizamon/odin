"use strict";

/**
 * An asynchronous bootstrap function that runs before your Sails app gets lifted.
 * This gives you an opportunity to set up your data model, run jobs, or perform some special logic.
 * @param {Function} cb This function should always be called, so DON'T REMOVE IT
 */
const fs = require('fs');
const winston = require('winston');
const path = require('path');
const mkdirp = require('mkdirp');
const exec = require('child_process').exec;
const moment = require('moment');
// const CronJob = require('cron').CronJob;
const CategorySeed = require('../seeds/CategorySeed');
const dataJsonS = require('../api/services/DataJsonService.js');

module.exports = {
    bootstrap: cb => {

        console.dir('Inside bootstrap function');

        // Calls seed functions
        // CategorySeed.load();

        // Create the upload folder

        mkdirp(sails.config.odin.uploadFolder, function(err) {
            if (err) console.error(err);
            else console.log('Upload folder created on: ' + sails.config.odin.uploadFolder)
        });

        mkdirp(sails.config.odin.datasetZipFolder, function(err) {
            if (err) console.error(err);
            else console.log('Zip folder created on: ' + sails.config.odin.datasetZipFolder)
        });


        // Create the logs folder
        var logCompletePath = path.join(sails.config.odin.logFolder, sails.config.odin.logFile);

        mkdirp(sails.config.odin.logFolder, function(err) {
            if (err) console.error(err);
            else {
                console.log('Log folder created on: ' + sails.config.odin.logFolder);
                fs.lstat(logCompletePath, function(err, stats) {
                    if (err || !stats.isFile()) {
                        var fd = fs.openSync(logCompletePath, 'w');
                    }
                });
            }
        });

        // create the backup folder
        mkdirp(sails.config.odin.backupFolder, function(err) {
            if (err) console.error(err);
            else console.log('backup folder created on: ' + sails.config.odin.backupFolder)
        });

        // create stats folder which will contain the statistics of the site

        mkdirp(sails.config.odin.statisticsPath, function(err) {
            if (err) console.error(err);
            else console.log('Stats path created on: ' + sails.config.odin.statisticsPath)
        });

        // Require and configure Winston with File
        winston.add(winston.transports.File, {
            filename: logCompletePath,
            level: sails.config.odin.logLevel
        });
        winston.remove(winston.transports.Console);

        // log the app has lifted
        sails.on('lifted', function() {
            LogService.winstonLog('info', 'Sails has lifted!');

        // data.json dataJsonConstructor
          try {
            let path = 'files/dataJson';
            if (!(fs.existsSync(path))) {
              mkdirp(path, (err) => {
                  if (err) console.error(err);
                  else console.log('dataJson folder created on: ' + path)
              });
                dataJsonS.dataJsonConstructor();
              }
          } catch (e) {
            console.log(e);
              throw e;
          }
            /* crons
            // cron databases and files backup
            var currentDate = moment().format("MM.DD.YYYY");

            // files backup
            var filesCommand = 'tar -zcvf ' + sails.config.odin.backupFolder + '/odin_files_backup_' + currentDate + '.tar.gz ' + sails.config.odin.uploadFolder

            // mongo backup
            var mongoCommand = 'mongodump --out ' + sails.config.odin.backupFolder + '/odin_mongo_backup_' + currentDate
                // postgres connection data
            var pgConnection = sails.config.connections[sails.config.models.connection];
            // path where pg dump will be saved
            var pgOutputPath = sails.config.odin.backupFolder + '/odin_pg_backup_' + currentDate + '.sql';

            // command for backing up postgres database
            var pgCommand = 'PGPASSWORD=' + pgConnection.password + ' pg_dump ' + pgConnection.database + ' -h ' + pgConnection.host +
                ' -p ' + pgConnection.port + ' -U ' + pgConnection.user + ' > ' + pgOutputPath;

            new CronJob('00 00 00 * * 0-6', function() {
                var pgBackup = exec(pgCommand, function(error, stdout, stderr) {
                    if (error) console.log(error);
                    process.stdout.write(stdout);
                    process.stderr.write(stderr);
                    console.log('Postgres backup executed on: ' + currentDate)
                });
                var filesBackup = exec(filesCommand, function(error, stdout, stderr) {
                    if (error) console.log(error);
                    process.stdout.write(stdout);
                    process.stderr.write(stderr);
                    console.log('Files backup executed on: ' + currentDate)
                });
                var mongoBackup = exec(mongoCommand, function(error, stdout, stderr) {
                    if (error) console.log(error);
                    process.stdout.write(stdout);
                    process.stderr.write(stderr);
                    console.log('Mongo backup executed on: ' + currentDate)
                });


            }, null, true);
            */

        });

        cb();
    }
};
