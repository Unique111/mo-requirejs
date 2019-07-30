let modId = 0         // 模块ID
let taskId = 0
const modules = {}
const tasks = {}
const mapDepToModuleOrTask = {}

const MSTATUS = {
  INITED: 'INITED',
  FETCHING: 'FETCHING',
  FETCHED: 'FETCHED',
  EXECUTING: 'EXECUTING',
  EXECUTED: 'EXECUTED',
  ERROR: 'ERROR'
}

class Module {
  constructor(name, deps, onSucceed, onError) {
    if (!name) return   // 用于区分task
    this.modId = ++modId
    this.init(name, deps, onSucceed, onError)
    this.fetch()
  }

  init(name, deps, onSucceed, onError) {
    this.name = name
    this.src = utils.moduleNameToModulePath(name)
    this.deps = deps
    this.onSucceed = onSucceed
    this.onError = onError
    this.statusHook(MSTATUS.INITED)
  }

  fetch() {
    const node = document.createElement('script')
    node.type = 'text/javascript'
    node.onload = this.fetchSucceed.bind(this)
    node.onerror = this.fetchFailed.bind(this)
    node.src = this.src

    const head = document.getElementsByTagName('head')[0]
    head.appendChild(node)
    this.statusHook(MSTATUS.FETCHING)
  }

  fetchSucceed() {
    this.onSucceed && this.onSucceed()
    this.statusHook(MSTATUS.FETCHED)
  }

  fetchFailed() {
    this.statusHook(MSTATUS.ERROR)
    if (this.onError) {
      this.onError()
    } else {
      throw new Error(`Load script: ${this.src} failed!`)
    }
  }

  statusHook(mStatus) {
    let status = mStatus
    if (!this.status) {
      Object.defineProperty(this, 'status', {
        get() {
          return status
        },
        set(newStatus) {
          status = newStatus
          if (newStatus === MSTATUS.EXECUTED) {
            let depModules = mapDepToModuleOrTask[this.name]
            if (!depModules) return
            depModules.forEach((mod) => {
              setTimeout(() => {
                mod.depCount--
              })
            })
          }
        }
      })
    } else {
      this.status = mStatus
    }
  }

  analyzeDeps() {
    let depCount = this.deps ? this.deps.length : 0

    console.log('depCount => ', depCount)

    // // 处理dep中包含'require'的特殊情况
    // let requireInDep = (this.dep || []).indexOf('require')
    // if (requireInDep !== -1) {
    //   depCount--
    //   this.requireInDep = requireInDep
    //   this.dep.splice(requireInDep, 1)
    // }

    // // 处理循环依赖情况
    // let cycleArray = this.checkCycle()
    // if (cycleArray) {
    //   depCount = depCount - cycleArray.length
    // }

    if (depCount === 0) {
      this.execute()
      return
    }

    this.depCount = depCount
    if (!this.depCount) return

    Object.defineProperty(this, 'depCount', {
      get() {
        return depCount
      },
      set(newDepCount) {
        depCount = newDepCount
        if (newDepCount === 0) {
          if (this.modId) {
            console.log(`模块${this.name}的依赖已经全部准备好`)
          } else if (this.taskId) {
            console.log(`任务${this.taskId}的依赖已经全部准备好`)
          }
          this.execute()
        }
      }
    })

    this.deps.forEach((depModuleName) => {
      if (!modules[depModuleName]) {
        const mod = new Module(depModuleName)
        modules[mod.name] = mod
      }

      if (!mapDepToModuleOrTask[depModuleName]) {
        mapDepToModuleOrTask[depModuleName] = []
      }

      mapDepToModuleOrTask[depModuleName].push(this)
    })
  }

  execute() {
    this.statusHook(MSTATUS.EXECUTING);
    // 根据依赖数组向依赖模块收集exports当做参数
    let arg = (this.deps || []).map((dep) => {
      return modules[dep].exports
    })

    // 插入require到回调函数的参数列表中
    // if (this.requireInDep !== -1 && this.requireInDep !== undefined) {
    //   arg.splice(this.requireInDep, 0, require)
    // }

    this.exports = this.onSucceed.apply(this, arg)
    if (this.taskId) {
      console.log(`任务${this.taskId}执行完成`)
    } else if (this.modId) {
      console.log(`模块${this.name}执行完成`)
    }
    this.statusHook(MSTATUS.EXECUTED)
  }
}

class Task extends Module {
  constructor(deps, onSucceed, onError) {
    super(undefined, deps, onSucceed, onError)
    this.taskId = ++taskId
    this.init(deps, onSucceed, onError)
  }

  init(deps, onSucceed, onError) {
    this.deps = deps
    this.onSucceed = onSucceed
    this.onError = onError
    tasks[this.taskId] = this
  }
}

const utils = {
  getEntryName: function() {
    const entry = document.currentScript.getAttribute('data-main')
    return utils.modulePathToModuleName(entry)
  },
  moduleNameToModulePath: function(name) {
    let reg = /\w*.js/
    let output = reg.exec(name)
    if (!output) {
      return `./${name}.js`
    } else {
      return name
    }
  },
  modulePathToModuleName: function(path) {
    let reg = /\w*.js/
    let output = reg.exec(path)
    if (!output) {
      return path
    } else {
      return output[0].split('.')[0]
    }
  },
  getCurrentModuleName: function() {
    const src = document.currentScript.getAttribute('src')
    return utils.modulePathToModuleName(src)
  },
  isFunction: function(fn) {
    return typeof fn === 'function'
  },
  isString: function(str) {
    return typeof str === 'string'
  }
}

const define = function(name, deps, onSucceed, onError) {
  if (utils.isFunction(name)) {
    onSucceed = name
    name = utils.getCurrentModuleName()
  } else if (Array.isArray(name) && utils.isFunction(deps)) {
    onSucceed = deps
    deps = name
    name = utils.getCurrentModuleName()
  } else if (utils.isString(name) && Array.isArray(deps) && utils.isFunction(onSucceed)) {
  }

  let mod = modules[name]
  if (!mod) {
    mod = new Module(name, deps, onSucceed, onError)
  } else {
    // 这里需要重新赋值，因为一开始入口文件的依赖模块新建时，并不知道该依赖模块的回调函数及其自身所依赖的模块
    mod.name = name
    mod.deps = deps
    mod.onSucceed = onSucceed
    mod.onError = onError
  }
  mod.analyzeDeps()
}

const require = function(deps, onSucceed, onError) {
  if (utils.isFunction(deps)) {
    onSucceed = deps
    deps = undefined
  }

  const task = new Task(deps, onSucceed, onError)
  task.analyzeDeps()
}

window.define = define
window.require = require

const entryModule = new Module(utils.getEntryName())
modules[entryModule.name] = entryModule
console.log('modules => ', modules)
console.log('tasks => ', tasks)
