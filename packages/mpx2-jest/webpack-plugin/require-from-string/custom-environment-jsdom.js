const JsdomEnvironment = require('jest-environment-jsdom')

function mergeGlobal(optionsGlobal, global) {
  try {
    const optionsGlobalKeys = Object.keys(optionsGlobal)
    optionsGlobalKeys.forEach((key) => {
      try {
        if (!global[key] && optionsGlobal[key]) {
          global[key] = optionsGlobal[key]
        }
      } catch (e) {
      }
    })
  } catch (e) {
    console.log('jest-environment-jsdom mergeGlobal', e)
  }
  return global
}

class CustomEnvironment extends JsdomEnvironment {
  constructor(config, options) {
    super(config)
    this.global.getCurrentPages = options.global.getCurrentPages
    this.global.getApp = options.global.getApp
    this.global = mergeGlobal(options.global, this.global)
  }
}

module.exports = CustomEnvironment
