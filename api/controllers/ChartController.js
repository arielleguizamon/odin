"use strict";

/**
 * ChartController
 * @description :: Server-side logic for ...
 */
const actionUtil = require('sails/lib/hooks/blueprints/actionUtil');
const _ = require('lodash');

module.exports = {
    unpublish: (req, res) => {
        const pk = actionUtil.requirePk(req);
        return PublishService.publishModel(Chart, pk, 'unpublished', res)
    },
    reject: (req, res) => {
        const pk = actionUtil.requirePk(req);
        return PublishService.publishModel(Chart, pk, 'rejected', res)
    },
    create: function (req, res){
        this.createChart(req, res, (values) => {
            UploadService.metadataSave(Chart, values, 'chart', req, res);
        });
    },
    update: function(req, res){
        this.createChart(req, res, (values) => {
            UploadService.metadataUpdate(Chart, values, 'chart', req, res);
        });
    },

    createChart (req, res, cb) {

        const values = actionUtil.parseValues(req);

        let link = _.get(values, 'link', null);

        if (link !== null) {
            cb(values);
        } else {

            let fileId = _.get(values, 'file', '');
            let type = _.get(values, 'type', '');
            let dataType = _.get(values, 'dataType', '');
            values.dataSeries = _.split(_.get(values, 'dataSeries', ''), ',');

            fileId = values.file;
            type = values.type;
            dataType = values.dataType;
            let dataSeries = values.dataSeries

            let base = _.take(dataSeries);
            let elements = dataSeries.length;
            dataSeries = _.slice(dataSeries, 1, elements);

            let element1 = values.dataSeries[0];
            let element2 = values.dataSeries[1];
            // var serie = [element1];
            File.findOne(fileId).exec(function (err, record) {

                if (err)
                    return res.negotiate(err);
                DataStorageService.mongoContents(record.dataset, record.fileName, 0, 0, function (err, table) {
                    if (err)
                        return res.negotiate(err)
                    this.generateChartData(table, dataType, element1, element2, function (chartData) {
                        values.data = {
                            labels: _.keys(chartData),
                            data: (dataType === 'quantitative')
                                ? _.values(chartData)
                                : _.map(_.values(chartData), _.size)
                        };

                        cb(values);
                    });
                }.bind(this));
            }.bind(this));
        }
    },
    generateChartData: (data, dataType, element1, element2, cb) => {
        let chartData;
        if (dataType === 'qualitative') {

            //if the chart is qualitative we group all the data referenced by the element asked
            chartData = _.groupBy(data, (value) => {
                return value[element1];
            });
        } else {
            if (dataType === 'quantitative') {
                //if the chart is quantitative return associative array
                let groupedData = _.groupBy(data, (value) => {
                    return value[element1];
                });
                console.log('groupedData \n')
                console.log(groupedData);
                console.log('end groupedData \n\n')
                chartData = _.transform(groupedData, (result, value) => {
                    console.log('value = ' + value)
                    let key = value[0][element1];
                    let val = _.sumBy(value, (each) => {
                        // in case a number is like 192123,522, transform it to 192123.522
                        return _.toNumber(_.replace(each[element2], ',', '.'));
                    });
                    result[key] = _.round(val, 2);
                }, {});
            }
        }
        cb(chartData)
    }
};
