const _ = require('lodash');
const fs = require('fs');
const Promise = require("bluebird");
module.exports = {
  // normalizador de categorias
  categoryN(catalogData){
    let themeTaxonomy
    if (catalogData.originUpdate) {

       themeTaxonomy = {
        label: catalogData.name,
        id: catalogData.id,
        description: catalogData.description
      }
    }else {
       themeTaxonomy = _.transform(catalogData,(result,value)=>{
        let theme = {
          label: value.name,
          id: value.id,
          description: value.description
        }
        result.push(theme);
      },[])
    }
      return themeTaxonomy
  },
  // normalizador de Recursos
  fileN(file){
    let format = _.split(file.fileName,'.',2)
    let fileN = {
      format: _.toUpper(format[1]),
      title: file.name,
      description: file.description,
      issued: file.publishedAt,
      modified: file.updatedAt,
      license: 'falta license',
      downloadURL: file.url,
      accessURL:  file.url
    }
    return fileN;
  },
  // generador de dataset
  async datasetN(datasetData){
    let dataset;
    // normalizador por cambio
    if (datasetData.originUpdate) {
       dataset = {
        title: datasetData.name,
        description: datasetData.description,
        modified: datasetData.updatedAt,
        identifier: datasetData.id,
        issued: datasetData.publishedAt,
        landingPage: null,
        license: null,
        publisher: null,
        distribution: 'recurso',
        keyword: 'falta keyword',
        superTheme: 'categories',
        temporal: 'falta temporal',
        accrualPeriodicity:'accrualPeriodicity',
        language: 'falta language',
        theme: 'falta theme',
      }
    }else {
      // normalizador de dataset
      return new Promise((resolve,reject)=>{
        Promise.reduce(datasetData, async (result,value)=>{
          //  normalizador de tags
          let theme = _.transform(value.categories,(result,value)=>{
            result.push(value.name)
          },[]);
          //  normalizador de tags
          let keyword = _.transform(value.tags,(result,value)=>{
            result.push(value.name)
          },[]);
          // normalizador de categories
          let superTheme = _.transform(value.categories,(result,value)=>{
            result.push(value.name)
          },[]);
          // normalizador de recursos
          let recurso = _.transform(value.files,(result,value)=>{
            // separacion de nombrefile para obtener formato
            let format = _.split(value.fileName,'.',2)
            let distribution = {
              format: _.toUpper(format[1]),
              title: value.name,
              description: value.description,
              issued: value.publishedAt,
              modified: value.updatedAt,
              license: 'falta license',
              downloadURL: value.url,
              accessURL:  value.url
            }
            result.push(distribution);
          },[]);
          //  busqueda de nombres de accrualPeriodicity
          let accrualPeriodicity = await this.accrualPeriodicity(value.files)
          // normalizacion de todo el dataset
          let dataNorm = {
            title: value.name,
            description: value.description,
            modified: value.updatedAt,
            identifier: value.id,
            issued: value.publishedAt,
            landingPage: `${sails.config.odin.baseUrl}/datasets/${value.id}/download`,
            license: null,
            publisher: value.createdBy,
            distribution: recurso,
            keyword,
            superTheme,
            temporal: 'falta temporal',
            accrualPeriodicity,
            language: ['falta language'],
            theme,
          }
          result.push(dataNorm);
          return result
        },[])
        .then((dataset)=>{
          resolve(dataset)
        })
      })
    }

  },
  // find de accrualPeriodicity async
   async accrualPeriodicity(files){
     let accrualPeriodicity = []
      for (var i = 0; i < files.length; i++) {
        let frequency = await UpdateFrequency.findOne(files[i].updateFrequency)
        accrualPeriodicity.push(frequency.name)
      }
      return accrualPeriodicity
  },

  uploadDataJson(filepath,dataJson){
    let content = JSON.stringify(dataJson);
    fs.writeFile(filepath, content, (err) => {
        if (err) throw err;
    console.log("The file was succesfully saved!");
    });
  },

   dataJsonConstructor(){
      let data;
      let datasets =  Dataset.find().populate(['files','categories','tags'])
      .then((datasetData)=>{
        // console.log(datasetData);
        let categories =  Category.find()
        .then(async (categories)=>{
          // console.log(datasetData);
          // normalizacion de datos (category y dataset)
          let themeTaxonomy = this.categoryN(categories);
          this.datasetN(datasetData).then((dataset)=>{

            let dataJson = {
              title: "Datos Producción",
              description: "En este portal podrás obtener datos numéricos y estadísticos del sector de Producción. Ingresá periódicamente y descubrí nuestros datos.",
              superThemeTaxonomy: "http://datos.gob.ar/superThemeTaxonomy.json",
              publisher: {},
              themeTaxonomy,
              dataset
            }
            // // creacion de el dataJson en el directorio
            this.uploadDataJson("files/dataJson/dataJson.json",dataJson)
          })
        });
      });
  }
}
