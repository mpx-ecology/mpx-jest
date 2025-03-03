const compiler = require('@mpxjs/webpack-plugin/lib/template-compiler/compiler')
const bindThis = require('@mpxjs/webpack-plugin/lib/template-compiler/bind-this').transform
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const matchCondition = require('@mpxjs/webpack-plugin/lib/utils/match-condition').matchCondition || require('@mpxjs/webpack-plugin/lib/utils/match-condition')
const path = require('path')

module.exports = function (raw, outputRes, options) {
  const { resourcePath, queryObj } = parseRequest(this.resource)
  const mpx = this.mpx
  const mode = mpx.mode
  const env = mpx.env
  const defs = mpx.defs
  const i18n = mpx.i18n
  const externalClasses = mpx.externalClasses
  const decodeHTMLText = mpx.decodeHTMLText
  const globalSrcMode = mpx.srcMode
  const localSrcMode = queryObj.mode
  const wxsContentMap = mpx.wxsContentMap

  const warn = (msg) => {
    console.log('[template compiler][' + this.resource + ']: ' + msg)
    // this.emitWarning(
    //   new Error('[template compiler][' + this.resource + ']: ' + msg)
    // )
  }

  const error = (msg) => {
    console.log('[template compiler][' + this.resource + ']: ' + msg)
    // this.emitError(
    //   new Error('[template compiler][' + this.resource + ']: ' + msg)
    // )
  }

  const parsed = compiler.parse(raw, {
    warn,
    error,
    usingComponents: options.usingComponents,
    usingComponentsInfo: options.usingComponentsInfo,
    hasComment: options.hasComment,
    isNative: options.isNative,
    basename: path.basename(resourcePath),
    isComponent: true, // TODO 等待处理
    mode,
    env,
    srcMode: localSrcMode || globalSrcMode,
    defs,
    decodeHTMLText,
    externalClasses,
    hasScoped: options.hasScoped,
    moduleId: options.moduleId,
    filePath: this.resourcePath,
    i18n,
    checkUsingComponents: mpx.checkUsingComponents,
    globalComponents: Object.keys(mpx.usingComponents),
    // deprecated option
    globalMpxAttrsFilter: mpx.globalMpxAttrsFilter,
    forceProxyEvent: matchCondition(this.resourcePath, mpx.forceProxyEventRules)
  })

  let ast = parsed.root
  let meta = parsed.meta

  if (meta.wxsContentMap) {
    for (let module in meta.wxsContentMap) {
      wxsContentMap[`${resourcePath}~${module}`] = meta.wxsContentMap[module]
    }
  }

  let result = compiler.serialize(ast)

  outputRes.template = result

  if (options.isNative || mpx.forceDisableInject) {
    return result
  }

  const rawCode = `global.currentInject = {
    moduleId: ${JSON.stringify(options.moduleId)},
    render: function (_i, _c, _r, _sc) {
      ${compiler.genNode(ast)}_r();
    }
};\n`

  let renderResult

  try {
    renderResult = bindThis(rawCode, {
      needCollect: true,
      ignoreMap: meta.wxsModuleMap
    })
  } catch (e) {
    error(`Invalid render function generated by the template, please check!\n
Template result:
${result}\n
Error code:
${rawCode}
Error Detail:
${e.stack}`)
    return result
  }

  let globalInjectCode = renderResult.code + '\n'

  if (meta.computed) {
    globalInjectCode += bindThis(`global.currentInject.injectComputed = {
  ${meta.computed.join(',')}
  };`).code + '\n'
  }

  if (meta.refs) {
    globalInjectCode += `global.currentInject.getRefsData = function () {
  return ${JSON.stringify(meta.refs)};
  };\n`
  }

  outputRes.script = globalInjectCode + '\n' + outputRes.script

  return outputRes
}
