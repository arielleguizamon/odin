const _ = require('lodash');
const fs = require('fs');

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
  datasetN(datasetData){
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
       dataset = _.transform(datasetData,(result,value)=>{
         //  normalizador de tags
         let theme = _.transform(value.categories,(result,value)=>{
           result.push(value.name)
         },[]);
         //  normalizador de tags
         let keyword = _.transform(value.tags,(result,value)=>{
           result.push(value.name)
         },[]);
        // normalizador de categories
        let categories = _.transform(value.categories,(result,value)=>{
          result.push(value.name)
        },[]);

        //  buscador de accrualPeriodicity
        let accrualPeriodicity = _.transform(value.files,(result,value)=>{
          result.push(value.updateFrequency)
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
          superTheme: categories,
          temporal: 'falta temporal',
          accrualPeriodicity,
          language: ['falta language'],
          theme,
        }
        result.push(dataNorm);
      },[])
    }
    return dataset
  },

  uploadDataJson(filepath,dataJson){
    let content = JSON.stringify(dataJson);
    fs.writeFile(filepath, content, (err) => {
        if (err) throw err;
    console.log("The file was succesfully saved!");
    });
  },

  dataJsonConstructor(){
    //  busqueda en modelos (dataset y categorys)

    let data;
    let datasets =  Dataset.find().populate(['files','categories','tags'])
    .then((datasetData)=>{
      console.log("dataset ",datasetData);
      let categories =  Category.find()
      .then((categories)=>{
        // normalizacion de datos (category y dataset)
        let themeTaxonomy = this.categoryN(categories);
        let dataset = this.datasetN(datasetData);
        // construccion de el dataJson
        let dataJson = {
          title: "Datos Producción",
          description: "En este portal podrás obtener datos numéricos y estadísticos del sector de Producción. Ingresá periódicamente y descubrí nuestros datos.",
          superThemeTaxonomy: "http://datos.gob.ar/superThemeTaxonomy.json",
          publisher: {},
          themeTaxonomy,
          dataset
        }

        data = dataJson;

        // creacion de el dataJson en el directorio
        this.uploadDataJson("files/dataJson/dataJson.json",dataJson)
      });
    });
      return data;
  }
}
