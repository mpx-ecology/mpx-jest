const ModuleDependency = require('webpack/lib/dependencies//ModuleDependency')

class RemovedModuleDependency extends ModuleDependency {
  constructor (request, removedModule, range) {
    super(request)
    this.removedModule = removedModule
    this.range = range
  }

  get type () {
    return 'removed module'
  }
}

RemovedModuleDependency.Template = class RemovedModuleDependencyTemplate {
  apply (dep, source) {
    if (dep.range) {
      source.replace(dep.range[0], dep.range[1] - 1, '')
    }
  }
}

module.exports = RemovedModuleDependency
