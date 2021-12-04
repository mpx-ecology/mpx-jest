const JsdomEnvironment = require('jest-environment-jsdom')

class CustomEnvironment extends JsdomEnvironment {
  constructor(config, options) {
    super(config)
    this.global.getCurrentPages = options.global.getCurrentPages
    this.global.getApp = options.global.getApp
    try {
      options.global.defs ? null : options.global.defs = {}
      const keys = Object.keys(options.global.defs)
      for (let key of keys) {
        this.global[key] = options.global.defs[key]
      }
    } catch (e) {
      console.error(e)
    }
  }
}

module.exports = CustomEnvironment
