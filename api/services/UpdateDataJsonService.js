"use strict";

const _ = require('lodash');
const fs = require('fs');
const util = require('util');
const CURRENT_FILE = __filename.slice(__dirname.length + 1, -3);

module.exports = {

    updateJson : async (values, modelType) => {
      // This service will receive CRUD ops in Datasets, Categories or Files and then will
      // overwrite the JSON specified
      if (arguments.length === 0 || values.wasCreated) {
        return false
      }

      const idDataset = values.dataset || false

      let id = ""
      let JSONRefreshed = {}
      const operation = values.operationExplicit
      if (modelType !== "File") {
        id = (operation === 'afterDestroy') ? values[0].id : values.id
      } else {
        id = values.id;
      }

      values.originUpdate = true
      modelType = modelType.toLowerCase()
      const model = (modelType === 'category') ? 'themeTaxonomy' : modelType
      // normalize values
      const normalizedValues = UpdateDataJsonService.normalizeValues(values, model)

      normalizedValues.operationExplicit = operation
      normalizedValues.model = model
      // Read file and use normalized data JSON to overwrite DataJsonFile.
      try {
        const route = 'files/dataJson/dataJson.json'
        await fs.readFile(route, 'utf8', (err, data) => {
          // Modify JSON
            if (err) throw err
            const JSONantique = JSON.parse(data)
            const JSONRefreshed = (values.operationExplicit === 'afterDestroy')
              ? UpdateDataJsonService.removeElement(JSONantique, model, id, idDataset)
              : UpdateDataJsonService.refreshJSON(JSONantique, normalizedValues, id, idDataset)

            fs.writeFile(route, JSON.stringify(JSONRefreshed), (err, succ) => {
              if (err) throw err
              console.log('¡JSONUpdate service completed!')
            })
          })
      } catch (err) {
          throw err
      }
      return
    },

    normalizeValues(values, type) {
      // use Service to normalize data
      let valuesNormalized
      switch (type) {
        case 'dataset':
          valuesNormalized = DataJsonService.datasetN(values)
          break
        case 'themeTaxonomy':
          valuesNormalized = DataJsonService.categoryN(values)
          break
        case 'file':
          valuesNormalized = DataJsonService.fileN(values)
          break
        default:
          return values
      }
      return valuesNormalized
    },

    refreshJSON(oldJSON, normalizedValues, id, idDataset) {
      const operation = normalizedValues.operationExplicit
      const model = normalizedValues.model
      delete normalizedValues.operationExplicit
      delete normalizedValues.model
      let JSONRefreshed = normalizedValues

      switch (operation) {
        case 'afterCreate':
            UpdateDataJsonService.insertElement(JSONRefreshed, oldJSON, model, id, 1, idDataset)
            // Insert id with associated data
          break
        case 'afterUpdate':
            UpdateDataJsonService.insertElement(JSONRefreshed, oldJSON, model, id, 0, idDataset)
            // Modify values, keep id
            break
        case 'afterDestroy':
            UpdateDataJsonService.removeElement(oldJSON, model, id)
            // get obj matching id and remove obj/prop
              break
        default:
            return
      }
      return oldJSON
    },

    insertElement(newValues, oldJSON, model, id, mode, idDataset) {
        const indexDataset = idDataset ? UpdateDataJsonService.getIndexDataset(oldJSON, idDataset) : false
        if (model === 'file' && mode !== 0) {
          oldJSON.dataset[indexDataset].distribution.push(newValues)
        } else if (mode === 0 && model === 'file') {
          let position = UpdateDataJsonService.getElementPosition(oldJSON, model, id, newValues)
          oldJSON.dataset[indexDataset].distribution[position] = newValues
        } else if (mode > 0 && model !== 'file') {
          oldJSON[model].push(newValues)
        } else {
          if (model === 'themeTaxonomy') {
            oldJSON = UpdateDataJsonService.updateTree(newValues, oldJSON, id);
          }
          let position = UpdateDataJsonService.getElementPosition(oldJSON, model, id, newValues)
          oldJSON[model][position] = newValues
        }
        return oldJSON
    },

    removeElement(oldJSON, model, id, idDataset) {
        const indexDataset = UpdateDataJsonService.getIndexDataset(oldJSON, idDataset)
        const structure = (model === "file") ? oldJSON.dataset[indexDataset].distribution : oldJSON[model]
        const index = structure.reduce((pos, element, i) => {
            if (element.id === id || element.identifier === id) {
              pos = i
            }
            return pos
        }, 0)

        structure.splice(index, 1);
        return oldJSON
    },

    getElementPosition(oldJSON, model, id, newValues) {
      if (model === 'file') {
        let structure = oldJSON.dataset
        const index = structure.reduce((pos, element, i) => {
            if (element.downloadURL === newValues.downloadURL || element.id === id) {
              pos = i
            }
            return pos
        }, 0)
        return index
      } else {
        let structure = oldJSON[model]
        const index = structure.reduce((pos, element, i) => {
            if (element.id === id || element.identifier === id) {
              pos = i
            }
            return pos
        }, 0)
        return index
      }
    },

    getIndexDataset(oldJSON, idDataset) {
      const index = oldJSON.dataset.reduce((pos, el, i) => {
        if (el.identifier === idDataset) {
          pos = i
        }
        return pos
      }, 0)
      return index
    },

    updateTree(newValues, oldJSON, id) {

      const oldCategory = oldJSON.themeTaxonomy.filter(el=> {
        return el.id === id
      })

      const oldName = oldCategory[0].label;
      const newName = newValues.label;

      for (let el of oldJSON.dataset){
        if (el.superTheme) {
          for (let cat in el.superTheme) {
             if (el.superTheme[cat] === oldName) {
               el.superTheme[cat] = newName;
             }
          }
        }
        if (el.theme) {
          for (let cat in el.theme) {
             if (el.theme[cat] === oldName) {
               el.theme[cat] = newName
             }
          }
        }
      }

      return oldJSON
    }

};
