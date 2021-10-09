
function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : {default: obj};
}

var _Object$fromEntries;

function _getRequireWildcardCache() {
  if (typeof WeakMap !== 'function') return null;
  var cache = new WeakMap();
  _getRequireWildcardCache = function () {
    return cache;
  };
  return cache;
}

function _interopRequireWildcard(obj) {
  if (obj && obj.__esModule) {
    return obj;
  }
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) {
    return {default: obj};
  }
  var cache = _getRequireWildcardCache();
  if (cache && cache.has(obj)) {
    return cache.get(obj);
  }
  var newObj = {};
  var hasPropertyDescriptor =
    Object.defineProperty && Object.getOwnPropertyDescriptor;
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      var desc = hasPropertyDescriptor
        ? Object.getOwnPropertyDescriptor(obj, key)
        : null;
      if (desc && (desc.get || desc.set)) {
        Object.defineProperty(newObj, key, desc);
      } else {
        newObj[key] = obj[key];
      }
    }
  }
  newObj.default = obj;
  if (cache) {
    cache.set(obj, newObj);
  }
  return newObj;
}

const fromEntries =
  (_Object$fromEntries = Object.fromEntries) !== null &&
  _Object$fromEntries !== void 0
    ? _Object$fromEntries
    : function fromEntries(iterable) {
      return [...iterable].reduce((obj, [key, val]) => {
        obj[key] = val;
        return obj;
      }, {});
    };

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }
  return obj;
}

function _transform() {
  const data = require('@jest/transform')
  _transform = function () {
    return data
  }
  return data
}

function _vm() {
  const data = require('vm');

  _vm = function () {
    return data;
  };

  return data;
}

function path() {
  const data = _interopRequireWildcard(require('path'));

  path = function () {
    return data;
  };

  return data;
}

const unmockRegExpCache = new WeakMap()
const EVAL_RESULT_VARIABLE = 'Object.<anonymous>'
const runtimeSupportsVmModules = typeof _vm().SyntheticModule === 'function'

class RequireFromString{
  constructor(
    resolver,
    config,
    environment,
    coverageOptions
  ) {
    _defineProperty(this, '_scriptTransformer', void 0);
    this._resolver = resolver
    this._scriptTransformer = new (_transform().ScriptTransformer)(config)
    this._config = config
    this._environment = environment
    this._moduleMocker = this._environment.moduleMocker;
    this._coverageOptions = coverageOptions || {
      changedFiles: undefined,
      collectCoverage: false,
      collectCoverageFrom: [],
      collectCoverageOnlyFrom: undefined,
      coverageProvider: 'babel',
      sourcesRelatedToTestsInChangedFiles: undefined
    }
    this._virtualMocks = new Map();
    this._require = null
  }

  require(code, modulePath, _require) {
    this._require = _require
    this._execModule(code, modulePath)
  }

  wrapCodeInModuleWrapper(content) {
    return this.constructModuleWrapperStart() + content + '\n}});';
  }

  constructModuleWrapperStart() {
    const args = this.constructInjectedModuleParameters();
    return '({"' + EVAL_RESULT_VARIABLE + `":function(${args.join(',')}){`;
  }

  constructInjectedModuleParameters() {
    return [
      'module',
      'exports',
      'require',
      '__dirname',
      '__filename',
      'global',
      this._config.injectGlobals ? 'jest' : undefined,
      ...this._config.extraGlobals
    ].filter(notEmpty);
  }

  _execModule(code, modulePath, options, moduleRegistry, from) {

    const localModule = {
      children: [],
      exports: {},
      filename: modulePath,
      id: modulePath,
      loaded: false,
      path: path().dirname(modulePath)
    };

    // If the environment was disposed, prevent this module from being executed.
    if (!this._environment.global) {
      return;
    }

    const module = localModule;
    const filename = module.filename;
    const lastExecutingModulePath = this._currentlyExecutingModulePath;
    this._currentlyExecutingModulePath = filename;
    const origCurrExecutingManualMock = this._isCurrentlyExecutingManualMock;
    this._isCurrentlyExecutingManualMock = filename;
    module.children = [];
    Object.defineProperty(module, 'parent', {
      enumerable: true,
      get() {
        const key = from || '';
        return moduleRegistry.get(key) || null;
      }
    });
    module.paths = this._resolver.getModulePaths(module.path);
    // module.paths = []
    Object.defineProperty(module, 'require', {
      value: this._require
    });
    const transformedCode = code
    let compiledFunction = null;
    const script = this.createScriptFromCode(transformedCode, filename);
    let runScript = null; // Use this if available instead of deprecated `JestEnvironment.runScript`

    if (typeof this._environment.getVmContext === 'function') {
      const vmContext = this._environment.getVmContext();

      if (vmContext) {
        runScript = script.runInContext(vmContext, {
          filename
        });
      }
    } else {
      runScript = this._environment.runScript(script);
    }

    if (runScript !== null) {
      compiledFunction = runScript[EVAL_RESULT_VARIABLE];
    }

    if (compiledFunction === null) {
      this._logFormattedReferenceError(
        'You are trying to `import` a file after the Jest environment has been torn down.'
      );

      process.exitCode = 1;
      return;
    }

    const jestObject = this._createJestObjectFor(filename)

    //TODO 待填补
    // this.jestObjectCaches.set(filename, jestObject)
    const lastArgs = [
      this._config.injectGlobals ? jestObject : undefined, // jest object
      ...this._config.extraGlobals.map(globalVariable => {
        if (this._environment.global[globalVariable]) {
          return this._environment.global[globalVariable];
        }

        throw new Error(
          `You have requested '${globalVariable}' as a global variable, but it was not present. Please check your config or your global environment.`
        );
      })
    ];

    this._mainModule = module.require.main

    Object.defineProperty(module, 'main', {
      enumerable: true,
      value: this._mainModule
    });


    try {
      compiledFunction.call(
        this._environment.global,
        module, // module object
        module.exports, // module exports
        module.require, // require implementation
        module.path, // __dirname
        module.filename, // __filename
        this._environment.global, // global object
        // @ts-expect-error
        ...lastArgs.filter(notEmpty)
      );
    } catch (error) {
      this.handleExecutionError(error, module);
    }

    this._isCurrentlyExecutingManualMock = origCurrExecutingManualMock;
    this._currentlyExecutingModulePath = lastExecutingModulePath;
  }

  transformFile(code, filename, options) {
    const source = code;

    // if (
    //   options === null || options === void 0 ? void 0 : options.isInternalModule
    // ) {
    //   return source;
    // }

    const transformedFile = this._scriptTransformer.transform(
      filename,
      this._getFullTransformationOptions(options),
      source
    );

    // this._fileTransforms.set(filename, {
    //   ...transformedFile,
    //   wrapperLength: this.constructModuleWrapperStart().length
    // });
    //
    // if (transformedFile.sourceMapPath) {
    //   this._sourceMapRegistry.set(filename, transformedFile.sourceMapPath);
    // }
    return transformedFile.code;
  }

  _getFullTransformationOptions(options = defaultTransformOptions) {
    return {...options, ...this._coverageOptions};
  }

  _createJestObjectFor(from) {
    const disableAutomock = () => {
      this._shouldAutoMock = false;
      return jestObject;
    };

    const enableAutomock = () => {
      this._shouldAutoMock = true;
      return jestObject;
    };

    const unmock = moduleName => {
      const moduleID = this._resolver.getModuleID(
        fromEntries(this._virtualMocks),
        from,
        moduleName
      );

      this._explicitShouldMock.set(moduleID, false);

      return jestObject;
    };

    const deepUnmock = moduleName => {
      const moduleID = this._resolver.getModuleID(
        fromEntries(this._virtualMocks),
        from,
        moduleName
      );

      this._explicitShouldMock.set(moduleID, false);

      this._transitiveShouldMock.set(moduleID, false);

      return jestObject;
    };

    const mock = (moduleName, mockFactory, options) => {
      if (mockFactory !== undefined) {
        return setMockFactory(moduleName, mockFactory, options);
      }

      const moduleID = this._resolver.getModuleID(
        fromEntries(this._virtualMocks),
        from,
        moduleName
      );

      this._explicitShouldMock.set(moduleID, true);

      return jestObject;
    };

    const setMockFactory = (moduleName, mockFactory, options) => {
      this.setMock(from, moduleName, mockFactory, options);
      return jestObject;
    };

    const clearAllMocks = () => {
      this.clearAllMocks();
      return jestObject;
    };

    const resetAllMocks = () => {
      this.resetAllMocks();
      return jestObject;
    };

    const restoreAllMocks = () => {
      this.restoreAllMocks();
      return jestObject;
    };

    const _getFakeTimers = () => {
      if (
        !(this._environment.fakeTimers || this._environment.fakeTimersModern)
      ) {
        this._logFormattedReferenceError(
          'You are trying to access a property or method of the Jest environment after it has been torn down.'
        );

        process.exitCode = 1;
      }

      return this._fakeTimersImplementation;
    };

    const useFakeTimers = (type = 'legacy') => {
      if (type === 'modern') {
        this._fakeTimersImplementation = this._environment.fakeTimersModern;
      } else {
        this._fakeTimersImplementation = this._environment.fakeTimers;
      }

      this._fakeTimersImplementation.useFakeTimers();

      return jestObject;
    };

    const useRealTimers = () => {
      _getFakeTimers().useRealTimers();

      return jestObject;
    };

    const resetModules = () => {
      this.resetModules();
      return jestObject;
    };

    const isolateModules = fn => {
      this.isolateModules(fn);
      return jestObject;
    };

    const fn = this._moduleMocker.fn.bind(this._moduleMocker);

    const spyOn = this._moduleMocker.spyOn.bind(this._moduleMocker);

    const setTimeout = timeout => {
      if (this._environment.global.jasmine) {
        this._environment.global.jasmine._DEFAULT_TIMEOUT_INTERVAL = timeout;
      } else {
        // @ts-expect-error: https://github.com/Microsoft/TypeScript/issues/24587
        this._environment.global[testTimeoutSymbol] = timeout;
      }

      return jestObject;
    };

    const retryTimes = numTestRetries => {
      // @ts-expect-error: https://github.com/Microsoft/TypeScript/issues/24587
      this._environment.global[retryTimesSymbol] = numTestRetries;
      return jestObject;
    };

    const jestObject = {
      addMatchers: matchers =>
        this._environment.global.jasmine.addMatchers(matchers),
      advanceTimersByTime: msToRun =>
        _getFakeTimers().advanceTimersByTime(msToRun),
      advanceTimersToNextTimer: steps =>
        _getFakeTimers().advanceTimersToNextTimer(steps),
      autoMockOff: disableAutomock,
      autoMockOn: enableAutomock,
      clearAllMocks,
      clearAllTimers: () => _getFakeTimers().clearAllTimers(),
      createMockFromModule: moduleName => this._generateMock(from, moduleName),
      deepUnmock,
      disableAutomock,
      doMock: mock,
      dontMock: unmock,
      enableAutomock,
      fn,
      genMockFromModule: moduleName => this._generateMock(from, moduleName),
      getRealSystemTime: () => {
        const fakeTimers = _getFakeTimers();

        if (fakeTimers instanceof _fakeTimers().ModernFakeTimers) {
          return fakeTimers.getRealSystemTime();
        } else {
          throw new TypeError(
            'getRealSystemTime is not available when not using modern timers'
          );
        }
      },
      getTimerCount: () => _getFakeTimers().getTimerCount(),
      isMockFunction: this._moduleMocker.isMockFunction,
      isolateModules,
      mock,
      requireActual: this.requireActual.bind(this, from),
      requireMock: this.requireMock.bind(this, from),
      resetAllMocks,
      resetModuleRegistry: resetModules,
      resetModules,
      restoreAllMocks,
      retryTimes,
      runAllImmediates: () => {
        const fakeTimers = _getFakeTimers();

        if (fakeTimers instanceof _fakeTimers().LegacyFakeTimers) {
          fakeTimers.runAllImmediates();
        } else {
          throw new TypeError(
            'runAllImmediates is not available when using modern timers'
          );
        }
      },
      runAllTicks: () => _getFakeTimers().runAllTicks(),
      runAllTimers: () => _getFakeTimers().runAllTimers(),
      runOnlyPendingTimers: () => _getFakeTimers().runOnlyPendingTimers(),
      runTimersToTime: msToRun => _getFakeTimers().advanceTimersByTime(msToRun),
      setMock: (moduleName, mock) => setMockFactory(moduleName, () => mock),
      setSystemTime: now => {
        const fakeTimers = _getFakeTimers();

        if (fakeTimers instanceof _fakeTimers().ModernFakeTimers) {
          fakeTimers.setSystemTime(now);
        } else {
          throw new TypeError(
            'setSystemTime is not available when not using modern timers'
          );
        }
      },
      setTimeout,
      spyOn,
      unmock,
      useFakeTimers,
      useRealTimers
    };
    return jestObject;
  }

  requireActual(from, moduleName) {
    return this.requireModule(from, moduleName, undefined, true);
  }

  requireModule(from, moduleName, options, isRequireActual) {
    const moduleID = this._resolver.getModuleID(
      fromEntries(this._virtualMocks),
      from,
      moduleName
    );

    let modulePath; // Some old tests rely on this mocking behavior. Ideally we'll change this
    // to be more explicit.

    const moduleResource = moduleName && this._resolver.getModule(moduleName);

    const manualMock =
      moduleName && this._resolver.getMockModule(from, moduleName);

    if (
      !(options === null || options === void 0
        ? void 0
        : options.isInternalModule) &&
      !isRequireActual &&
      !moduleResource &&
      manualMock &&
      manualMock !== this._isCurrentlyExecutingManualMock &&
      this._explicitShouldMock.get(moduleID) !== false
    ) {
      modulePath = manualMock;
    }

    if (moduleName && this._resolver.isCoreModule(moduleName)) {
      return this._requireCoreModule(moduleName);
    }

    if (!modulePath) {
      modulePath = this._resolveModule(from, moduleName);
    }

    let moduleRegistry;

    if (
      options === null || options === void 0 ? void 0 : options.isInternalModule
    ) {
      moduleRegistry = this._internalModuleRegistry;
    } else {
      if (
        this._moduleRegistry.get(modulePath) ||
        !this._isolatedModuleRegistry
      ) {
        moduleRegistry = this._moduleRegistry;
      } else {
        moduleRegistry = this._isolatedModuleRegistry;
      }
    }

    const module = moduleRegistry.get(modulePath);

    if (module) {
      return module.exports;
    } // We must register the pre-allocated module object first so that any
    // circular dependencies that may arise while evaluating the module can
    // be satisfied.

    const localModule = {
      children: [],
      exports: {},
      filename: modulePath,
      id: modulePath,
      loaded: false,
      path: path().dirname(modulePath)
    };
    moduleRegistry.set(modulePath, localModule);

    this._loadModule(
      localModule,
      from,
      moduleName,
      modulePath,
      options,
      moduleRegistry
    );

    return localModule.exports;
  }

  requireMock(from, moduleName) {
    const moduleID = this._resolver.getModuleID(
      fromEntries(this._virtualMocks),
      from,
      moduleName
    );

    if (
      this._isolatedMockRegistry &&
      this._isolatedMockRegistry.get(moduleID)
    ) {
      return this._isolatedMockRegistry.get(moduleID);
    } else if (this._mockRegistry.get(moduleID)) {
      return this._mockRegistry.get(moduleID);
    }

    const mockRegistry = this._isolatedMockRegistry || this._mockRegistry;

    if (this._mockFactories.has(moduleID)) {
      // has check above makes this ok
      const module = this._mockFactories.get(moduleID)();

      mockRegistry.set(moduleID, module);
      return module;
    }

    const manualMockOrStub = this._resolver.getMockModule(from, moduleName);

    let modulePath =
      this._resolver.getMockModule(from, moduleName) ||
      this._resolveModule(from, moduleName);

    let isManualMock =
      manualMockOrStub &&
      !this._resolver.resolveStubModuleName(from, moduleName);

    if (!isManualMock) {
      // If the actual module file has a __mocks__ dir sitting immediately next
      // to it, look to see if there is a manual mock for this file.
      //
      // subDir1/my_module.js
      // subDir1/__mocks__/my_module.js
      // subDir2/my_module.js
      // subDir2/__mocks__/my_module.js
      //
      // Where some other module does a relative require into each of the
      // respective subDir{1,2} directories and expects a manual mock
      // corresponding to that particular my_module.js file.
      const moduleDir = path().dirname(modulePath);
      const moduleFileName = path().basename(modulePath);
      const potentialManualMock = path().join(
        moduleDir,
        '__mocks__',
        moduleFileName
      );

      if (fs().existsSync(potentialManualMock)) {
        isManualMock = true;
        modulePath = potentialManualMock;
      }
    }

    if (isManualMock) {
      const localModule = {
        children: [],
        exports: {},
        filename: modulePath,
        id: modulePath,
        loaded: false,
        path: path().dirname(modulePath)
      };

      this._loadModule(
        localModule,
        from,
        moduleName,
        modulePath,
        undefined,
        mockRegistry
      );

      mockRegistry.set(moduleID, localModule.exports);
    } else {
      // Look for a real module to generate an automock from
      mockRegistry.set(moduleID, this._generateMock(from, moduleName));
    }

    return mockRegistry.get(moduleID);
  }

  _createRequireImplementation(from, options) {
    const resolve = (moduleName, resolveOptions) => {
      const resolved = this._requireResolve(
        from.filename,
        moduleName,
        resolveOptions
      );

      if (
        (resolveOptions === null || resolveOptions === void 0
          ? void 0
          : resolveOptions[OUTSIDE_JEST_VM_RESOLVE_OPTION]) &&
        (options === null || options === void 0
          ? void 0
          : options.isInternalModule)
      ) {
        return (0, _helpers.createOutsideJestVmPath)(resolved);
      }

      return resolved;
    };

    resolve.paths = moduleName =>
      this._requireResolvePaths(from.filename, moduleName);

    const moduleRequire = (
      options === null || options === void 0 ? void 0 : options.isInternalModule
    )
      ? moduleName => this.requireInternalModule(from.filename, moduleName)
      : this.requireModuleOrMock.bind(this, from.filename)
    moduleRequire.extensions = Object.create(null);
    moduleRequire.resolve = resolve;

    moduleRequire.cache = (() => {
      // TODO: consider warning somehow that this does nothing. We should support deletions, anyways
      const notPermittedMethod = () => true;

      return new Proxy(Object.create(null), {
        defineProperty: notPermittedMethod,
        deleteProperty: notPermittedMethod,
        get: (_target, key) =>
          typeof key === 'string' ? this._moduleRegistry.get(key) : undefined,

        getOwnPropertyDescriptor() {
          return {
            configurable: true,
            enumerable: true
          };
        },

        has: (_target, key) =>
          typeof key === 'string' && this._moduleRegistry.has(key),
        ownKeys: () => Array.from(this._moduleRegistry.keys()),
        set: notPermittedMethod
      });
    })();

    Object.defineProperty(moduleRequire, 'main', {
      enumerable: true,
      value: this._mainModule
    });
    return moduleRequire;
  }

  createScriptFromCode(scriptSource, filename) {
    try {
      const scriptFilename = this._resolver.isCoreModule(filename)
        ? `jest-nodejs-core-${filename}`
        : filename;
      // eval()
      return new (_vm().Script)(this.wrapCodeInModuleWrapper(scriptSource), {
        displayErrors: true,
        filename: scriptFilename,
        // @ts-expect-error: Experimental ESM API
        importModuleDynamically: specifier => {
          var _this$_environment$ge, _this$_environment;

          const context =
            (_this$_environment$ge = (_this$_environment = this._environment)
              .getVmContext) === null || _this$_environment$ge === void 0
              ? void 0
              : _this$_environment$ge.call(_this$_environment);
          invariant(context);
          return this.linkModules(specifier, scriptFilename, context);
        }
      });
    } catch (e) {
      throw (0, _transform().handlePotentialSyntaxError)(e);
    }
  }

  getGlobalsForCjs(from) {
    const jest = this.jestObjectCaches.get(from);
    invariant(jest, 'There should always be a Jest object already');
    return {...this.getGlobalsFromEnvironment(), jest};
  }

  _shouldMock(from, moduleName) {
    // TODO 待修改
    return false
    const explicitShouldMock = this._explicitShouldMock;

    const moduleID = this._resolver.getModuleID(
      fromEntries(this._virtualMocks),
      from,
      moduleName
    );

    const key = from + path().delimiter + moduleID;

    if (explicitShouldMock.has(moduleID)) {
      // guaranteed by `has` above
      return explicitShouldMock.get(moduleID);
    }

    if (
      !this._shouldAutoMock ||
      this._resolver.isCoreModule(moduleName) ||
      this._shouldUnmockTransitiveDependenciesCache.get(key)
    ) {
      return false;
    }

    if (this._shouldMockModuleCache.has(moduleID)) {
      // guaranteed by `has` above
      return this._shouldMockModuleCache.get(moduleID);
    }

    let modulePath;

    try {
      modulePath = this._resolveModule(from, moduleName);
    } catch (e) {
      const manualMock = this._resolver.getMockModule(from, moduleName);

      if (manualMock) {
        this._shouldMockModuleCache.set(moduleID, true);

        return true;
      }

      throw e;
    }

    if (this._unmockList && this._unmockList.test(modulePath)) {
      this._shouldMockModuleCache.set(moduleID, false);

      return false;
    } // transitive unmocking for package managers that store flat packages (npm3)

    const currentModuleID = this._resolver.getModuleID(
      fromEntries(this._virtualMocks),
      from
    );

    if (
      this._transitiveShouldMock.get(currentModuleID) === false ||
      (from.includes(NODE_MODULES) &&
        modulePath.includes(NODE_MODULES) &&
        ((this._unmockList && this._unmockList.test(from)) ||
          explicitShouldMock.get(currentModuleID) === false))
    ) {
      this._transitiveShouldMock.set(moduleID, false);

      this._shouldUnmockTransitiveDependenciesCache.set(key, true);

      return false;
    }

    this._shouldMockModuleCache.set(moduleID, true);

    return true;
  }

  requireModuleOrMock(from, moduleName) {
    // this module is unmockable
    if (moduleName === '@jest/globals') {
      // @ts-expect-error: we don't care that it's not assignable to T
      return this.getGlobalsForCjs(from);
    }

    try {
      if (this._shouldMock(from, moduleName)) {
        return this.requireMock(from, moduleName)
      } else {
        return this.requireModule(from, moduleName)
      }
    } catch (e) {
      const moduleNotFound = _jestResolve().default.tryCastModuleNotFoundError(
        e
      );

      if (moduleNotFound) {
        if (
          moduleNotFound.siblingWithSimilarExtensionFound === null ||
          moduleNotFound.siblingWithSimilarExtensionFound === undefined
        ) {
          moduleNotFound.hint = (0, _helpers.findSiblingsWithFileExtension)(
            this._config.moduleFileExtensions,
            from,
            moduleNotFound.moduleName || moduleName
          );
          moduleNotFound.siblingWithSimilarExtensionFound = Boolean(
            moduleNotFound.hint
          );
        }

        moduleNotFound.buildMessage(this._config.rootDir);
        throw moduleNotFound;
      }

      throw e;
    }
  }


}

function notEmpty(value) {
  return value !== null && value !== undefined;
}

module.exports = RequireFromString
