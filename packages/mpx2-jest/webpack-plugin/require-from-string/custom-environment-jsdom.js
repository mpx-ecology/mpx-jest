const JsdomEnvironment = require('jest-environment-jsdom')

class CustomEnvironment extends JsdomEnvironment {
  constructor(config, options) {
    super(config)
    this.global.getCurrentPages = options.global.getCurrentPages
    this.global.getApp = options.global.getApp
  }
}

module.exports = CustomEnvironment
