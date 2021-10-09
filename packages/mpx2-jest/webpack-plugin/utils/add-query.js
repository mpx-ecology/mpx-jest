const parseRequest = require('./parse-request')
const stringifyQuery = require('./stringify-query')
const type = require('./type')

// 默认为非强行覆盖原query，如需强行覆盖传递force为true
module.exports = function (request, data = {}, force, removeKeys) {
  const { rawResourcePath: resourcePath, loaderString, queryObj: queryObjRaw } = parseRequest(request)
  const queryObj = Object.assign({}, queryObjRaw)
  if (force) {
    Object.assign(queryObj, data)
  } else {
    Object.keys(data).forEach((key) => {
      if (!queryObj.hasOwnProperty(key)) {
        queryObj[key] = data[key]
      }
    })
  }

  if (removeKeys) {
    if (type(removeKeys) === 'String') {
      removeKeys = [removeKeys]
    }
    removeKeys.forEach((key) => {
      delete queryObj[key]
    })
  }

  return (loaderString ? `${loaderString}!` : '') + resourcePath + stringifyQuery(queryObj)
}
