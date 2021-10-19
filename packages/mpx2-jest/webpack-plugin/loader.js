const JSON5 = require('json5')
const path = require('path')
const parseComponent = require('./parser')
const createHelpers = require('./helpers')
const loaderUtils = require('loader-utils')
const parseRequest = require('./utils/parse-request')
const matchCondition = require('./utils/match-condition')
const fixUsingComponent = require('./utils/fix-using-component')
const addQuery = require('./utils/add-query')
const normalize = require('./utils/normalize')
const templateCompiler = require('./template-compiler/index')
const babel = require("@babel/core")

const mkdirp = require('mkdirp')
const fs = require('fs')
const getDirName = require('path').dirname
const transformedFiles = new Map
// content, resource, cb
//src, filePath, jestConfig
module.exports = function (src, filePath, jestConfig) {
  this.resource = filePath
  const resource = filePath
  let content = src
  const mainCompilation = {
    __mpx__: {
      componentsMap: {
        main: {}
      },
      pagesMap: {},
      usingComponents: {},
      mode: 'wx',
      srcMode: 'wx'
    }
  }
  const mpx = mainCompilation.__mpx__
  const {resourcePath, queryObj} = parseRequest(this.resource)
  const packageName = queryObj.packageName || mpx.currentPackageRoot || 'main'
  const pagesMap = mpx.pagesMap
  const componentsMap = mpx.componentsMap[packageName]
  const resolveMode = mpx.resolveMode
  const projectRoot = mpx.projectRoot
  const mode = mpx.mode
  const env = mpx.env
  const defs = mpx.defs
  const i18n = mpx.i18n
  const globalSrcMode = mpx.srcMode
  const localSrcMode = queryObj.mode
  const srcMode = localSrcMode || globalSrcMode
  const vueContentCache = mpx.vueContentCache || new Set()
  const autoScope = matchCondition(resourcePath, mpx.autoScopeRules)
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

  // let ctorType = 'app'
  // if (pagesMap[resourcePath]) {
  //   // page
  //   ctorType = 'page'
  // } else if (componentsMap[resourcePath]) {
  //   // component
  //   ctorType = 'component'
  // }
  ctorType = 'component'
  // mock loaderContext
  const loaderContext = {
    loaders: [{}],
    loaderIndex: 0,
    resource
  }

  function writeFile(path, contents, cb) {
    return new Promise((resolve) => {
      mkdirp(getDirName(path), function (err) {
        if (err) return cb(err);

        fs.writeFile(path, contents, () => {
          cb && cb()
          resolve()
        });
      });
    })
  }

  const stringifyRequest = r => loaderUtils.stringifyRequest(loaderContext, r)
  const isProduction = this.minimize || process.env.NODE_ENV === 'production'
  const options = loaderUtils.getOptions(this) || {}
  const processSrcQuery = (src, type) => {
    const localQuery = Object.assign({}, queryObj)
    // style src会被特殊处理为全局复用样式，不添加resourcePath，添加isStatic及issuerResource
    if (type === 'styles') {
      localQuery.isStatic = true
      localQuery.issuerResource = this.resource
    } else {
      localQuery.resourcePath = resourcePath
    }
    if (type === 'json') {
      localQuery.__component = true
    }
    return addQuery(src, localQuery)
  }


  //TODO 待调整
  const moduleId = 'm' + filePath

  const needCssSourceMap = (
    !isProduction &&
    this.sourceMap &&
    options.cssSourceMap !== false
  )

  const parts = parseComponent(content, {
    filePath,
    needMap: this.sourceMap,
    mode,
    defs,
    env
  })

  let output = ''
  const callback = () => {
    // return
    // cb(outputRes)
  }

  // web输出模式下没有任何inject，可以通过cache直接返回，由于读取src json可能会新增模块依赖，需要在之后返回缓存内容
  if (vueContentCache.has(filePath)) {
    return callback(null, vueContentCache.get(filePath))
  }
  // 只有ali才可能需要scoped
  const hasScoped = false
  const templateAttrs = parts.template && parts.template.attrs
  const hasComment = templateAttrs && templateAttrs.comments
  const isNative = false

  let usingComponents = [].concat(Object.keys(mpx.usingComponents))

  let componentGenerics = {}

  if (parts.json && parts.json.content) {
    try {
      let ret = JSON5.parse(parts.json.content)
      if (ret.usingComponents) {
        fixUsingComponent(ret.usingComponents, mode)
        usingComponents = usingComponents.concat(Object.keys(ret.usingComponents))
      }
      if (ret.componentGenerics) {
        componentGenerics = Object.assign({}, ret.componentGenerics)
      }
    } catch (e) {
      return callback(e)
    }
  }

  const {
    getRequire,
    getRequireForSrc
  } = createHelpers({
    loaderContext,
    options,
    moduleId,
    hasScoped,
    hasComment,
    usingComponents,
    needCssSourceMap,
    srcMode,
    isNative,
    projectRoot
  })

  // 触发webpack global var 注入
  output += 'global.currentModuleId\n'

  // todo loader中inject dep比较危险，watch模式下不一定靠谱，可考虑将import改为require然后通过修改loader内容注入
  // 注入模块id及资源路径
  let globalInjectCode = `global.currentModuleId = ${JSON.stringify(moduleId)}\n`
  if (!isProduction) {
    globalInjectCode += `global.currentResource = ${JSON.stringify(filePath)}\n`
  }
  // TODO i18n 延后处理
  if (ctorType === 'app' && i18n && !mpx.forceDisableInject) {
    globalInjectCode += `global.i18n = ${JSON.stringify({locale: i18n.locale, version: 0})}\n`

    const i18nMethodsVar = 'i18nMethods'
    const i18nWxsPath = normalize.lib('runtime/i18n.wxs')
    const i18nWxsLoaderPath = normalize.lib('wxs/wxs-i18n-loader.js')
    const i18nWxsRequest = i18nWxsLoaderPath + '!' + i18nWxsPath
    const expression = `require(${loaderUtils.stringifyRequest(loaderContext, i18nWxsRequest)})`
    const deps = []
    this._module.parser.parse(expression, {
      current: {
        addDependency: dep => {
          dep.userRequest = i18nMethodsVar
          deps.push(dep)
        }
      },
      module: this._module
    })
    this._module.addVariable(i18nMethodsVar, expression, deps)

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
  output += '/* script */\n'
  let scriptSrcMode = srcMode
  let scriptLang = 'js'
  const script = parts.script
  if (script) {
    scriptSrcMode = script.mode || scriptSrcMode
    const plugins = ["@babel/plugin-transform-modules-commonjs"]
    if (script.src) {
      // 传入resourcePath以确保后续处理中能够识别src引入的资源为组件主资源
      const basePathDir = path.dirname(filePath) + '/'
      const absolutePath = require.resolve(script.src, {paths: [basePathDir]})
      if (script.lang === 'ts') {
        plugins.push("@babel/plugin-transform-typescript")
      }
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
  output += '/* styles */\n'
  let cssModules
  if (parts.styles.length) {
    let styleInjectionCode = ''
    parts.styles.forEach((style, i) => {
      let scoped = hasScoped ? (style.scoped || autoScope) : false
      let requireString
      // require style
      if (style.src) {
        style.src = processSrcQuery(style.src, 'styles')
        requireString = getRequireForSrc('styles', style, -1, scoped)
      } else {
        requireString = getRequire('styles', style, i, scoped)
      }
      const hasStyleLoader = requireString.indexOf('style-loader') > -1
      const invokeStyle = code => `${code}\n`

      const moduleName = style.module === true ? '$style' : style.module
      // setCssModule
      if (moduleName) {
        if (!cssModules) {
          cssModules = {}
        }
        if (moduleName in cssModules) {
          loaderContext.emitError(
            'CSS module name "' + moduleName + '" is not unique!'
          )
          styleInjectionCode += invokeStyle(requireString)
        } else {
          cssModules[moduleName] = true

          if (!hasStyleLoader) {
            requireString += '.locals'
          }

          styleInjectionCode += invokeStyle(
            'this["' + moduleName + '"] = ' + requireString
          )
        }
      } else {
        styleInjectionCode += invokeStyle(requireString)
      }
    })
    output += styleInjectionCode + '\n'
  }

  // json
  output += '/* json */\n'
  // 给予json默认值, 确保生成json request以自动补全json
  const json = parts.json || {}
  outputRes.json = json
  // if (json.src) {
  //   json.src = processSrcQuery(json.src, 'json')
  //   output += getRequireForSrc('json', json) + '\n\n'
  // } else {
  //   output += getRequire('json', json) + '\n\n'
  // }

  // template
  output += '/* template */\n'
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
    outputRes = templateCompiler.call(this, parts.template.content, outputRes, options)
    // if (template.src) {
    //   template.src = processSrcQuery(template.src, 'template')
    //   output += getRequireForSrc('template', template) + '\n\n'
    // } else {
    //   output += getRequire('template', template) + '\n\n'
    // }
  }

  if (!mpx.forceDisableInject) {
    // TODO global inject 部分要通过 code 拼接方式来实现

    outputRes.script = globalInjectCode + '\n' + outputRes.script
    // TODO babel处理后续改为读取外部babel.config.json
    // const res = require("@babel/core").transformSync(outputRes.script, {
    //   plugins: ["@babel/plugin-transform-modules-commonjs"],
    // });
    // outputRes.script = res.code

    // const dep = new InjectDependency({
    //   content: globalInjectCode,
    //   index: -3
    // })
    // TODO 待确认
    // this._module.addDependency(dep)outputRes.template
  }

  // fs.writeFileSync('src/components/list.jest.js', outputRes.script)
  const outStr = JSON.stringify(outputRes)
  if (transformedFiles.get(filePath)) {
    const res = require("@babel/core").transformSync(outputRes.script, {
      plugins: ["@babel/plugin-transform-modules-commonjs"],
    });
    return {
      code: res.code
    }
  }
  // const res = require("@babel/core").transformSync(componentContent.script, {
  //   plugins: [
  //     "@babel/plugin-transform-modules-commonjs",
  //     "@babel/plugin-transform-typescript"
  //   ],
  // });
  transformedFiles.set(filePath, true)
  return {
    code: 'module.exports = '+JSON.stringify(outputRes)
  }

  // async.waterfall([
  //   (callback) => {
  //     const json = parts.json || {}
  //     if (json.src) {
  //       readJsonForSrc(json.src, loaderContext, (err, result) => {
  //         if (err) return callback(err)
  //         json.content = result
  //         callback()
  //       })
  //     } else {
  //       callback()
  //     }
  //   },
  // ], callback)
}
