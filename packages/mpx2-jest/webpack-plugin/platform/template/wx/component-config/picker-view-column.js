const TAG_NAME = 'picker-view-column'

module.exports = function () {
  return {
    test: TAG_NAME,
    web (tag, { el }) {
      el.isBuiltIn = true
      return 'mpx-picker-view-column'
    }
  }
}
