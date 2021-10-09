import { inBrowser } from '../utils/env'

export default function processOption (
  option,
  ctorType,
  firstPage,
  componentId,
  pageConfig,
  pagesMap,
  componentsMap,
  tabBarMap,
  componentGenerics,
  genericsInfo,
  mixin,
  Vue,
  VueRouter,
  i18n
) {
  if (ctorType === 'app') {
    // 对于app中的组件需要全局注册
    for (const componentName in componentsMap) {
      if (componentsMap.hasOwnProperty(componentName)) {
        const component = componentsMap[componentName]
        Vue.component(componentName, component)
      }
    }

    // 注册v-ex-classes自定义指令处理externalClasses
    Vue.directive('ex-classes', (el, binding, vnode) => {
      const context = vnode.context
      if (context) {
        const externalClasses = context.$options.externalClasses || []
        const classList = el.classList
        binding.value.forEach((className) => {
          const actualExternalClassNames = context.$attrs[className]
          if (externalClasses.indexOf(className) !== -1 && actualExternalClassNames) {
            classList.remove(className)
            actualExternalClassNames.split(/\s+/).forEach((actualExternalClassName) => {
              if (actualExternalClassName) classList.add(actualExternalClassName)
            })
          }
        })
      }
    })
    Vue.directive('animation', (el, binding) => {
      const newActions = binding?.value?.actions
      if (el.actions === newActions) {
        Promise.resolve().then(() => {
          Object.assign(el.style, el.lastDynamicStyle)
        })
        return
      }
      el.actions = newActions
      if (typeof el.setAnimation === 'function') {
        el.removeEventListener('transitionend', el.setAnimation, false)
        el.setAnimation = undefined
      }
      el.dynamicStyleQueue = []
      el.lastDynamicStyle = undefined
      if (Array.isArray(newActions) && newActions.length) {
        newActions.forEach((item) => {
          const property = []
          const { animates, option } = item
          // 存储动画需要改变的样式属性
          const dynamicStyle = {
            transform: ''
          }
          animates.forEach((itemAnimation) => {
            switch (itemAnimation.type) {
              case 'style':
                const [key, value] = itemAnimation.args
                dynamicStyle[key] = value
                property.push(key)
                break
              default:
                dynamicStyle.transform += `${itemAnimation.type}(${itemAnimation.args}) `
                if (!property.includes('transform')) {
                  property.push('transform')
                }
            }
          })
          Object.assign(dynamicStyle, {
            transition: `${parseInt(option.duration)}ms ${option.timingFunction} ${parseInt(option.delay)}ms`,
            transitionProperty: `${property}`,
            transformOrigin: option.transformOrigin
          })
          el.dynamicStyleQueue.push(dynamicStyle)
        })
        el.setAnimation = function () {
          if (!el.dynamicStyleQueue.length) {
            el.removeEventListener('transitionend', el.setAnimation, false)
            return
          }
          const dynamicStyle = el.dynamicStyleQueue.shift()
          Object.assign(el.style, dynamicStyle)
          el.lastDynamicStyle = dynamicStyle
        }
        // 首次动画属性设置
        setTimeout(el.setAnimation, 0)
        // 在transitionend事件内设置动画样式
        el.addEventListener('transitionend', el.setAnimation, false)
      }
    })

    const routes = []

    for (const pagePath in pagesMap) {
      if (pagesMap.hasOwnProperty(pagePath)) {
        const page = pagesMap[pagePath]
        routes.push({
          path: '/' + pagePath,
          component: page
        })
      }
    }

    if (routes.length) {
      if (firstPage) {
        routes.push({
          path: '/',
          redirect: '/' + firstPage
        })
      }
      global.__mpxRouter = option.router = new VueRouter({
        routes: routes
      })
      global.__mpxRouter.stack = []
      global.__mpxRouter.needCache = null
      global.__mpxRouter.needRemove = []
      // 处理reLaunch中传递的url并非首页时的replace逻辑
      global.__mpxRouter.beforeEach(function (to, from, next) {
        let action = global.__mpxRouter.__mpxAction
        const stack = global.__mpxRouter.stack

        // 处理人为操作
        if (!action) {
          if (stack.length > 1 && stack[stack.length - 2].path === to.path) {
            action = {
              type: 'back',
              delta: 1
            }
          } else {
            action = {
              type: 'to'
            }
          }
        }

        const pageInRoutes = routes.some(item => item.path === to.path)
        if (!pageInRoutes) {
          if (stack.length < 1) {
            if (global.__mpxRouter.app.$options.onPageNotFound) {
              // onPageNotFound，仅首次进入时生效
              global.__mpxRouter.app.$options.onPageNotFound({
                path: to.path,
                query: to.query,
                isEntryPage: true
              })
              return
            } else {
              console.warn(`[Mpx runtime warn]: the ${to.path} path does not exist in the application，will redirect to the home page path ${firstPage}`)
              return next({
                path: firstPage,
                replace: true
              })
            }
          } else {
            let methods = ''
            switch (action.type) {
              case 'to':
                methods = 'navigateTo'
                break
              case 'redirect':
                methods = 'redirectTo'
                break
              case 'back':
                methods = 'navigateBack'
                break
              case 'reLaunch':
                methods = 'reLaunch'
                break
              default:
                methods = 'navigateTo'
            }
            throw new Error(`${methods}:fail page "${to.path}" is not found`)
          }
        }

        const insertItem = {
          path: to.path
        }
        // 构建历史栈
        switch (action.type) {
          case 'to':
            stack.push(insertItem)
            global.__mpxRouter.needCache = insertItem
            break
          case 'back':
            global.__mpxRouter.needRemove = stack.splice(stack.length - action.delta, action.delta)
            break
          case 'redirect':
            global.__mpxRouter.needRemove = stack.splice(stack.length - 1, 1, insertItem)
            global.__mpxRouter.needCache = insertItem
            break
          case 'switch':
            if (!action.replaced) {
              action.replaced = true
              return next({
                path: action.path,
                replace: true
              })
            } else {
              // 将非tabBar页面remove
              let tabItem = null
              global.__mpxRouter.needRemove = stack.filter((item) => {
                if (tabBarMap[item.path.slice(1)]) {
                  tabItem = item
                  return false
                }
                return true
              })
              if (tabItem) {
                global.__mpxRouter.stack = [tabItem]
              } else {
                global.__mpxRouter.stack = [insertItem]
                global.__mpxRouter.needCache = insertItem
              }
            }
            break
          case 'reLaunch':
            if (!action.replaced) {
              action.replaced = true
              return next({
                path: action.path,
                query: {
                  reLaunchCount: action.reLaunchCount
                },
                replace: true
              })
            } else {
              global.__mpxRouter.needRemove = stack
              global.__mpxRouter.stack = [insertItem]
              global.__mpxRouter.needCache = insertItem
            }
        }
        next()
      })
      // 处理visibilitychange时触发当前活跃页面组件的onshow/onhide
      if (inBrowser) {
        const errorHandler = function (e) {
          if (global.__mpxAppCbs && global.__mpxAppCbs.error) {
            global.__mpxAppCbs.error.forEach((cb) => {
              cb(e)
            })
          }
        }
        Vue.config.errorHandler = errorHandler
        window.addEventListener('error', errorHandler)
        window.addEventListener('unhandledrejection', event => {
          errorHandler(event.reason)
        })
        document.addEventListener('visibilitychange', function () {
          const vnode = global.__mpxRouter && global.__mpxRouter.__mpxActiveVnode
          if (vnode && vnode.componentInstance) {
            const currentPage = vnode.tag.endsWith('mpx-tab-bar-container') ? vnode.componentInstance.$refs.tabBarPage : vnode.componentInstance
            if (document.hidden) {
              if (global.__mpxAppCbs && global.__mpxAppCbs.hide) {
                global.__mpxAppCbs.hide.forEach((cb) => {
                  cb()
                })
              }
              if (currentPage) {
                currentPage.mpxPageStatus = 'hide'
                currentPage.onHide && currentPage.onHide()
              }
            } else {
              if (global.__mpxAppCbs && global.__mpxAppCbs.show) {
                global.__mpxAppCbs.show.forEach((cb) => {
                  // todo 实现app.onShow参数
                  /* eslint-disable standard/no-callback-literal */
                  cb({})
                })
              }
              if (currentPage) {
                currentPage.mpxPageStatus = 'show'
                currentPage.onShow && currentPage.onShow()
              }
            }
          }
        })
        // 初始化length
        global.__mpxRouter.__mpxHistoryLength = global.history.length
      }
    }

    if (i18n) {
      option.i18n = i18n
    }
  } else {
    // 局部注册页面和组件中依赖的组件
    for (const componentName in componentsMap) {
      if (componentsMap.hasOwnProperty(componentName)) {
        const component = componentsMap[componentName]
        if (!option.components) {
          option.components = {}
        }
        option.components[componentName] = component
      }
    }

    if (genericsInfo) {
      const genericHash = genericsInfo.hash
      global.__mpxGenericsMap[genericHash] = {}
      Object.keys(genericsInfo.map).forEach((genericValue) => {
        if (componentsMap[genericValue]) {
          global.__mpxGenericsMap[genericHash][genericValue] = componentsMap[genericValue]
        } else {
          console.log(option)
          console.warn(`[Mpx runtime warn]: generic value "${genericValue}" must be
registered in parent context!`)
        }
      })
    }

    if (componentGenerics) {
      option.props = option.props || {}
      option.props.generichash = String
      Object.keys(componentGenerics).forEach((genericName) => {
        if (componentGenerics[genericName].default) {
          option.props[`generic${genericName}`] = {
            type: String,
            default: `${genericName}default`
          }
        } else {
          option.props[`generic${genericName}`] = String
        }
      })
    }

    if (ctorType === 'page') {
      option.__mpxPageConfig = Object.assign({}, global.__mpxPageConfig, pageConfig)
    }
  }

  if (option.mixins) {
    option.mixins.push(mixin)
  } else {
    option.mixins = [mixin]
  }

  if (componentId) {
    option.componentPath = '/' + componentId
  }

  return option
}

export function getComponent (component, extendOptions) {
  component = component.__esModule ? component.default : component
  // eslint-disable-next-line
  if (extendOptions) Object.assign(component, extendOptions)
  return component
}

export function getWxsMixin (wxsModules) {
  if (!wxsModules) return {}
  return {
    created () {
      Object.keys(wxsModules).forEach((key) => {
        if (key in this) {
          console.error(`[Mpx runtime error]: The wxs module key [${key}] exist in the component/page instance already, please check and rename it!`)
        } else {
          this[key] = wxsModules[key]
        }
      })
    }
  }
}
