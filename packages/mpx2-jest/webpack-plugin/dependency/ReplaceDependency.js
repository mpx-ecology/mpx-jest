const NullDependency = require('webpack/lib/dependencies/NullDependency')

class ReplaceDependency extends NullDependency {
  constructor (replacement, range) {
    super()
    this.replacement = replacement
    this.range = range
  }

  get type () {
    return 'mpx replace'
  }

  updateHash (hash) {
    super.updateHash(hash)
    hash.update(this.replacement)
  }
}

ReplaceDependency.Template = class ReplaceDependencyTemplate {
  apply (dep, source) {
    source.replace(dep.range[0], dep.range[1] - 1, '/* mpx replace */ ' + dep.replacement)
  }
}

module.exports = ReplaceDependency
