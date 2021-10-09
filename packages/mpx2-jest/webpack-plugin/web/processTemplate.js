const templateCompiler = require('../template-compiler/compiler')
const genComponentTag = require('../utils/gen-component-tag')
const addQuery = require('../utils/add-query')
const path = require('path')
const parseRequest = require('../utils/parse-request')
const getMainCompilation = require('../utils/get-main-compilation')

function calculateRootEleChild (arr) {
  if (!arr) {
    return 0
  }
  return arr.reduce((total, item) => {
    if (item.type === 1) {
      if (item.tag === 'template') {
        total += calculateRootEleChild(item.children)
      } else {
        total += 1
      }
    }
    return total
  }, 0)
}

module.exports = function (template, options, callback) {
  const mode = options.mode
  const srcMode = options.srcMode
  const defs = options.defs
  const moduleId = options.moduleId
  const loaderContext = options.loaderContext
  const ctorType = options.ctorType
  const resourcePath = parseRequest(loaderContext.resource).resourcePath
  const builtInComponentsMap = {}
  const compilation = loaderContext._compilation
  const mainCompilation = getMainCompilation(compilation)
  const mpx = mainCompilation.__mpx__
  const wxsContentMap = mpx.wxsContentMap
  let wxsModuleMap, genericsInfo
  let output = '/* template */\n'

  if (ctorType === 'app') {
    template = {
      tag: 'template',
      content: '<div class="app"><mpx-keep-alive><router-view class="page"></router-view></mpx-keep-alive></div>'
    }
    builtInComponentsMap['mpx-keep-alive'] = {
      resource: addQuery('@mpxjs/webpack-plugin/lib/runtime/components/web/mpx-keep-alive.vue', { component: true })
    }
  }

  if (template) {
    // 由于远端src template资源引用的相对路径可能发生变化，暂时不支持。
    if (template.src) {
      return callback(new Error('[mpx loader][' + loaderContext.resource + ']: ' + 'template content must be inline in .mpx files!'))
    }
    if (template.lang) {
      return callback(new Error('[mpx loader][' + loaderContext.resource + ']: ' + 'template lang is not supported in trans web mode temporarily, we will support it in the future!'))
    }

    output += genComponentTag(template, (template) => {
      if (ctorType === 'app') {
        return template.content
      }
      if (template.content) {
        const templateSrcMode = template.mode || srcMode
        const parsed = templateCompiler.parse(template.content, {
          warn: (msg) => {
            loaderContext.emitWarning(
              new Error('[template compiler][' + loaderContext.resource + ']: ' + msg)
            )
          },
          error: (msg) => {
            loaderContext.emitError(
              new Error('[template compiler][' + loaderContext.resource + ']: ' + msg)
            )
          },
          usingComponents: options.usingComponents,
          hasComment: options.hasComment,
          isNative: options.isNative,
          basename: path.basename(resourcePath),
          isComponent: ctorType === 'component',
          mode,
          srcMode: templateSrcMode,
          defs,
          decodeHTMLText: options.decodeHTMLText,
          externalClasses: options.externalClasses,
          hasScoped: false,
          moduleId,
          filePath: loaderContext.resourcePath,
          i18n: null,
          checkUsingComponents: options.checkUsingComponents,
          // web模式下全局组件不会被合入usingComponents中，故globalComponents可以传空
          globalComponents: [],
          // web模式下实现抽象组件
          componentGenerics: options.componentGenerics
        })
        if (parsed.meta.wxsModuleMap) {
          wxsModuleMap = parsed.meta.wxsModuleMap
        }
        if (parsed.meta.wxsContentMap) {
          for (let module in parsed.meta.wxsContentMap) {
            wxsContentMap[`${resourcePath}~${module}`] = parsed.meta.wxsContentMap[module]
          }
        }
        if (parsed.meta.builtInComponentsMap) {
          Object.keys(parsed.meta.builtInComponentsMap).forEach((name) => {
            builtInComponentsMap[name] = {
              resource: addQuery(parsed.meta.builtInComponentsMap[name], { component: true })
            }
          })
        }
        if (parsed.meta.genericsInfo) {
          genericsInfo = parsed.meta.genericsInfo
        }
        // 输出H5有多个root element时, 使用div标签包裹
        if (parsed.root.tag === 'temp-node') {
          const childLen = calculateRootEleChild(parsed.root.children)
          if (childLen >= 2) {
            parsed.root.tag = 'div'
          }
        }
        return templateCompiler.serialize(parsed.root)
      }
    })
    output += '\n\n'
  }

  callback(null, {
    output,
    builtInComponentsMap,
    genericsInfo,
    wxsModuleMap
  })
}
