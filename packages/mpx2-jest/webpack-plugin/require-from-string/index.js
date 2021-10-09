
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

}

function notEmpty(value) {
  return value !== null && value !== undefined;
}

module.exports = RequireFromString
