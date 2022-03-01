const JSON5 = require('json5')
const path = require('path')
const parseComponent = require('@mpxjs/webpack-plugin/lib/parser')
const hash = require('hash-sum')
const parseRequest = require('@mpxjs/webpack-plugin/lib/utils/parse-request')
const fixUsingComponent = require('@mpxjs/webpack-plugin/lib/utils/fix-using-component')
const mpxJSON = require('./utils/mpx-json')
const templateCompiler = require('./template-compiler/index')
const babel = require("@babel/core")
const fs = require('fs')
const transformedFiles = new Map

function getGlobalDefs (jestConfig) {
  if (!jestConfig) return {}
  let copyGlobals = {}
  if (jestConfig.globals) {
    copyGlobals = jestConfig.globals
  } else if (jestConfig.config && jestConfig.config.globals) {
    copyGlobals = jestConfig.config.globals
  }
  const keys = Object.keys(copyGlobals)
  const defs = {}
  keys.forEach((key) => {
    if (typeof copyGlobals[key] === 'string') {
      defs[key] = copyGlobals[key]
    }
  })
  return defs
}
// content, resource, cb
//src, filePath, jestConfig
module.exports = function (src, filePath, jestConfig) {
  this.resource = filePath
  this.resourcePath = filePath
  this.context = path.dirname(filePath)
  this.resolve = path.resolve
  // mock loader，后续可以改为implement继承一个class的方式
  this.cacheable = () => {}
  this.async = () => {}
  const resource = filePath
  const defs = getGlobalDefs(jestConfig)
  let content = src
  const mainCompilation = {
    __mpx__: {
      componentsMap: {
        main: {}
      },
      pagesMap: {},
      usingComponents: {},
      mode: 'wx',
      srcMode: 'wx',
      defs: defs,
      getEntryNode: () => {},
      pathHash: (resourcePath) => {
        return hash(resourcePath)
      },
      i18n: {
        locale: 'zh-CN',
        message: ''
      }
    },
    outputOptions: {},
    compiler: {},
    _preparedEntrypoints: [
      {
        name: ''
      }
    ]
  }
  const mpx = mainCompilation.__mpx__
  this.mpx = mpx
  this._compilation = mainCompilation
  this._compiler = {
    inputFileSystem: () => {}
  }
  this._module = {
    issuer: {
      rawRequest: ''
    }
  }
  const {resourcePath, queryObj} = parseRequest(this.resource)
  const packageName = queryObj.packageName || mpx.currentPackageRoot || 'main'
  const pagesMap = mpx.pagesMap
  const componentsMap = mpx.componentsMap[packageName]
  const projectRoot = mpx.projectRoot
  const mode = mpx.mode
  const env = mpx.env
  const i18n = mpx.i18n
  const globalSrcMode = mpx.srcMode
  const localSrcMode = queryObj.mode
  const srcMode = localSrcMode || globalSrcMode
  // 整体页面构建后输出产物
  let outputRes = {
    script: '',
    template: '',
    json: '',
    style: ''
  }

  // 支持资源query传入page或component支持页面/组件单独编译
  if ((queryObj.component && !componentsMap[resourcePath]) || (queryObj.page && !pagesMap[resourcePath])) {
    let entryChunkName
    const rawRequest = this._module.rawRequest
    const _preparedEntrypoints = this._compilation._preparedEntrypoints
    for (let i = 0; i < _preparedEntrypoints.length; i++) {
      if (rawRequest === _preparedEntrypoints[i].request) {
        entryChunkName = _preparedEntrypoints[i].name
        break
      }
    }
    if (queryObj.component) {
      componentsMap[resourcePath] = entryChunkName || 'noEntryComponent'
    } else {
      pagesMap[resourcePath] = entryChunkName || 'noEntryPage'
    }
  }

  ctorType = 'component'
  const isProduction = this.minimize || process.env.NODE_ENV === 'production'

  //TODO 待调整
  const moduleId = 'm' + filePath

  const parts = parseComponent(content, {
    filePath,
    needMap: this.sourceMap,
    mode,
    defs,
    env
  })

  const hasScoped = false
  const templateAttrs = parts.template && parts.template.attrs
  const hasComment = templateAttrs && templateAttrs.comments
  const isNative = false

  let usingComponents = [].concat(Object.keys(mpx.usingComponents))
  if (parts.json && parts.json.content) {
    try {
      let ret = {}
      if (parts.json.useJSONJS) {
        text = mpxJSON.compileMPXJSONText({ source: parts.json.content, defs, filePath: this.resourcePath })
        parts.json.content = text
      }
      ret = JSON5.parse(parts.json.content)
      if (ret.usingComponents) {
        fixUsingComponent(ret.usingComponents, mode)
        usingComponents = usingComponents.concat(Object.keys(ret.usingComponents))
      }
    } catch (e) {

      console.log('error:', e)
      return e
    }
  }

  // 注入模块id及资源路径
  let globalInjectCode = `global.currentModuleId = ${JSON.stringify(moduleId)}\n`
  if (!isProduction) {
    globalInjectCode += `global.currentResource = ${JSON.stringify(filePath)}\n`
  }
  // TODO i18n 延后处理
  if (ctorType === 'app' && i18n && !mpx.forceDisableInject) {
    globalInjectCode += `global.i18n = ${JSON.stringify({locale: i18n.locale, version: 0})}\n`
    const i18nMethodsVar = 'i18nMethods'
    globalInjectCode += `global.i18nMethods = ${i18nMethodsVar}\n`
  }
  // 注入构造函数
  let ctor = 'App'
  if (ctorType === 'page') {
    if (mpx.forceUsePageCtor || mode === 'ali') {
      ctor = 'Page'
    } else {
      ctor = 'Component'
    }
  } else if (ctorType === 'component') {
    ctor = 'Component'
  }
  globalInjectCode += `global.currentCtor = global.${ctor}\n`
  globalInjectCode += `global.currentCtorType = ${JSON.stringify(ctor.replace(/^./, (match) => {
    return match.toLowerCase()
  }))}\n`

  // <script>
  outputRes.script += '/* script */\n'
  let scriptSrcMode = srcMode
  const script = parts.script
  if (script) {
    scriptSrcMode = script.mode || scriptSrcMode
    const plugins = ["@babel/plugin-transform-modules-commonjs"]
    if (script.lang === 'ts') {
      plugins.push("@babel/plugin-transform-typescript")
    }
    if (script.src) {
      // 传入resourcePath以确保后续处理中能够识别src引入的资源为组件主资源
      const basePathDir = path.dirname(filePath) + '/'
      const absolutePath = require.resolve(script.src, {paths: [basePathDir]})
      const srcContent = babel.transformSync(
        fs.readFileSync(absolutePath).toString('utf8'),
        {
          plugins: plugins
        }
      ).code
      outputRes.script = srcContent
    } else {
      const srcCode = babel.transformSync(
        script.content,
        {
          plugins: plugins
        }
      ).code
      outputRes.script += srcCode
    }
  } else {
    switch (ctorType) {
      case 'app':
        outputRes.script += 'import {createApp} from "@mpxjs/core"\n' +
          'createApp({})\n'
        break
      case 'page':
        outputRes.script += 'import {createPage} from "@mpxjs/core"\n' +
          'createPage({})\n'
        break
      case 'component':
        outputRes.script += 'import {createComponent} from "@mpxjs/core"\n' +
          'createComponent({})\n'
    }
    outputRes.script += '\n'
  }

  if (scriptSrcMode) {
    globalInjectCode += `global.currentSrcMode = ${JSON.stringify(scriptSrcMode)}\n`
  }

  // styles
  outputRes.style += '/* styles */\n'
  if (parts.styles.length) {
    let styleInjectionCode = ''
    // TODO 添加对css部分的处理，特别是外联css文件
    outputRes.style += styleInjectionCode + '\n'
  }

  // json
  // 给予json默认值, 确保生成json request以自动补全json
  const json = parts.json || {}
  outputRes.json = json

  // template
  outputRes.template += '/* template */\n'
  const template = parts.template

  if (template) {
    // template 部分这里直接走template-compiler，可不再走 selector+webpack loader 流程
    const options = {
      usingComponents,
      hasScoped,
      hasComment,
      isNative,
      moduleId,
      root: projectRoot
    }
    this.usingComponents = usingComponents
    outputRes = templateCompiler.call(this, parts.template.content, outputRes, options)
  }

  if (!mpx.forceDisableInject) {
    outputRes.script = globalInjectCode + '\n' + outputRes.script
  }

  if (transformedFiles.get(filePath)) {
    const res = require("@babel/core").transformSync(outputRes.script, {
      plugins: ["@babel/plugin-transform-modules-commonjs"],
    });
    return {
      code: res.code
    }
  }
  transformedFiles.set(filePath, true)
  return {
    code: 'module.exports = '+JSON.stringify(outputRes)
  }
}