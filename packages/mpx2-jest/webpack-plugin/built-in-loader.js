const parseComponent = require('./parser')
const loaderUtils = require('loader-utils')
const parseRequest = require('./utils/parse-request')
const normalize = require('./utils/normalize')
const selectorPath = normalize.lib('selector')
const genComponentTag = require('./utils/gen-component-tag')
const getMainCompilation = require('./utils/get-main-compilation')

module.exports = function (content) {
  this.cacheable()
  const mainCompilation = getMainCompilation(this._compilation)
  const mpx = mainCompilation.__mpx__
  if (!mpx) {
    return content
  }
  const mode = mpx.mode
  const env = mpx.env
  const defs = mpx.defs
  const resourcePath = parseRequest(this.resource).resourcePath
  const parts = parseComponent(content, {
    filePath: resourcePath,
    needMap: this.sourceMap,
    mode,
    defs,
    env
  })

  let output = ''

  // 内建组件编写规范比较统一，不需要处理太多情况
  if (parts.template) {
    output += genComponentTag(parts.template)
  }

  if (parts.script) {
    output += '\n' + genComponentTag(parts.script, (script) => {
      let content = ''
      if (parts.styles && parts.styles.length) {
        parts.styles.forEach((style, i) => {
          const requestString = loaderUtils.stringifyRequest(this, `builtInComponent.styl!=!${selectorPath}?type=styles&index=${i}!${loaderUtils.getRemainingRequest(this)}`)
          content += `\n  import ${requestString}`
        })
      }
      content += script.content
      return content
    })
  }
  return output
}
