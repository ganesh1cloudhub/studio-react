const Html = require('../Html.js')
const ExtendJS = require('../ExtendJS.js')
const ParseCommon = require('./ParseCommon.js')

module.exports = {
  injectOverrides (node, ref, overrides, data, document) {
    // attributes before the rest
    this.injectAttributes(node, ref, overrides, data)
    node = this.injectTag(node, ref, overrides, data, document)
    node = this.injectComponent(node, ref, overrides, data, document)
    this.injectInner(node, ref, overrides, data)
    this.injectUnrender(node, ref, overrides, data, document)
  },

  injectAttributes (node, ref, overrides, data) {
    if (!overrides?.attributes) return
    for (const [name, type] of Object.entries(overrides.attributes)) {
      this.injectAttribute(node, ref, name, type, data)
    }
  },

  // name is already in the `readOnly` format
  injectAttribute (node, ref, name, type, data) {
    this.setAttributeRegex(node, ref, name, type, data.regex)
    this.attributeRemove(node, name)
    // we will replace this value later with regex
    node.setAttributeNS(null, `__OVERRIDE_ATTR__${ref}__${name}`, '')
  },

  setAttributeRegex (node, ref, name, type, regex) {
    if (!regex[ref]) regex[ref] = {}
    if (!regex[ref].attributes) regex[ref].attributes = {}
    const exists = this.attributeExists(node, name)
    const value = this.attributeValue(node, name)
    regex[ref].attributes[name] = this.getAttributeCode(ref, name, value, type, exists)
  },

  // we need to revert them from `defaultChecked` to `checked`
  attributeExists (node, name) {
    const map = ExtendJS.objectFlip(ParseCommon.getCamelCaseAttributeMap())
    return node.hasAttributeNS(null, name) ||
      (name in map && node.hasAttributeNS(null, map[name]))
  },

  attributeValue (node, name) {
    const map = ExtendJS.objectFlip(ParseCommon.getCamelCaseAttributeMap())
    if (name in map && node.hasAttributeNS(null, map[name])) {
      return node.getAttributeNS(null, map[name])
    } else {
      return node.getAttributeNS(null, name)
    }
  },

  attributeRemove (node, name) {
    node.removeAttributeNS(null, name)
    const map = ExtendJS.objectFlip(ParseCommon.getCamelCaseAttributeMap())
    if (name in map) node.removeAttributeNS(null, map[name])
  },

  getAttributeCode (ref, name, value, type, exists, filter = false) {
    const i = this.getIndexes(ref, name, 'Attr')
    value = Html.escapeQuotedHtml(ParseCommon.getAttributeValue(name, value), "'")
    if (filter) name = name.replace(/[^a-zA-Z0-9-_]/g, '')
    if (type === 'update' && !exists) { // create
      return '{...DS.e(d.' + i.default + ') && {\'' + name + '\': d.' + i.default + '}}'
    } else if (type === 'update') {
      return name + '={DS.e(d.' + i.default + ') ? d.' + i.default + ' : \'' + value + '\'}'
    } else if (type === 'delete') {
      return '{...!d.' + i.delete + ' && {\'' + name + '\': \'' + value + '\'}}'
    } else if (type === 'update-delete') {
      return '{...!d.' + i.delete + ' && {\'' + name + '\': DS.e(d.' + i.default +
        ') ? d.' + i.default + ' : \'' + value + '\'}}'
    }
  },

  getIndexes (ref, name, type) {
    const label = ExtendJS.toPascalCase(name)
    return {
      default: ref + type + label,
      delete: ref + type + 'del' + label
    }
  },

  injectTag (node, ref, overrides, data, document) {
    if (!overrides?.tag) return node
    if (!data.defaults[ref]) data.defaults[ref] = {}
    data.defaults[ref].tag = Html.getTag(node)
    // we will replace this value later with regex
    return Html.changeTag(node, `d.${ref}Tag`, document)
  },

  // swapping components with other components
  injectComponent (node, ref, overrides, data, document) {
    if (!overrides?.component) return node
    if (!data.defaults[ref]) data.defaults[ref] = {}
    data.defaults[ref].component = node.tagName
    // we will replace this value later with regex
    return Html.changeTag(node, `d.${ref}Component`, document)
  },

  injectInner (node, ref, overrides, data) {
    if (!overrides?.inner) return
    if (!data.regex[ref]) data.regex[ref] = {}
    const defaultValue = Html.escapeQuotedHtml(node.innerHTML)
    node.innerHTML = ''
    data.regex[ref].inner = `{{__html: DS.e(d.${ref}Inner) ? d.${ref}Inner : \`${defaultValue}\`}}`
    // we will replace this value later with regex
    node.setAttributeNS(null, 'dangerouslySetInnerHTML', '__OVERRIDE_INNER__' + ref)
  },

  injectUnrender (node, ref, overrides, data, document) {
    // this deals with overrides, but also with default unrender attributes
    if (!overrides?.unrender && !node.hasAttributeNS(null, 'data-ss-unrender')) return
    this.setUnrenderDefaults(node, ref, data)
    this.setUnrenderRegex(node, ref, data)
    // we will replace this value later with regex
    ParseCommon.wrapNode(node, '__OVERRIDE_UNRENDER__' + ref, document)
  },

  setUnrenderDefaults (node, ref, data) {
    if (!node.hasAttributeNS(null, 'data-ss-unrender')) return
    node.removeAttributeNS(null, 'data-ss-unrender')
    if (!data.defaults[ref]) data.defaults[ref] = {}
    data.defaults[ref].unrender = true
  },

  setUnrenderRegex (node, ref, data) {
    if (!data.regex[ref]) data.regex[ref] = {}
    // if we have code blocks like reactIf, etc, then we need to forget about the wrapping `{}`
    if (this.hasCodeTags(node.parentNode)) {
      data.regex[ref].unrender = {
        start: `!d.${ref}Unrender && `,
        end: ''
      }
    } else {
      data.regex[ref].unrender = {
        start: `{!d.${ref}Unrender && `,
        end: '}'
      }
    }
  },

  hasCodeTags (node) {
    const codeTags = this.getCodeTags().map(value => value.toLowerCase())
    const tag = Html.getTag(node)
    return codeTags.includes(tag)
  },

  getCodeTags () {
    return ['desechIf', 'desechFor', 'desechIfFor', 'desechForIf']
  },

  replaceOverrides (html, data) {
    html = this.replaceOverridesAttributes(html, data)
    html = this.replaceOverridesInner(html, data)
    html = this.replaceOverridesUnrender(html, data)
    return html
  },

  replaceOverridesAttributes (html, data) {
    return html.replace(/__OVERRIDE_ATTR__(e0[a-z0-9]+)__(.*?)=""/g, (match, ref, name) => {
      return data.regex[ref].attributes[name]
    })
  },

  replaceOverridesInner (html, data) {
    return html.replace(/(dangerouslySetInnerHTML)="__OVERRIDE_INNER__(e0[a-z0-9]+)"/g,
      (match, attr, ref) => `${attr}=${data.regex[ref].inner}`)
  },

  replaceOverridesUnrender (html, data) {
    return html.replace(/<__OVERRIDE_UNRENDER__(e0[a-z0-9]+)>/g, (match, ref) => {
      return data.regex[ref].unrender.start
    }).replace(/<\/__OVERRIDE_UNRENDER__(e0[a-z0-9]+)>/g, (match, ref) => {
      return data.regex[ref].unrender.end
    })
  },

  // this one is done during the html regex replace
  overrideExistingProperty (ref, name, value, overrides) {
    if (!overrides?.properties || !overrides.properties[name]) return
    return this.getAttributeCode(ref, name, value, overrides.properties[name], true, true)
  },

  overrideNewProperties (ref, existingProps, overrides, attrs) {
    if (!overrides?.properties) return
    for (const [name, type] of Object.entries(overrides.properties)) {
      if (name in existingProps) continue
      const code = this.getAttributeCode(ref, name, existingProps[name], type, false, true)
      attrs.push(code)
    }
  },

  overrideClasses (ref, stringClasses, overrides) {
    if (!overrides?.classes) return
    const codeClasses = []
    for (const [name, action] of Object.entries(overrides.classes)) {
      const code = this.getOverrideClassCode(ref, name, action)
      codeClasses.push(code)
      ExtendJS.removeFromArray(stringClasses, name)
    }
    return codeClasses
  },

  getOverrideClassCode (ref, name, action) {
    const i = this.getIndexes(ref, name, 'Cls')
    return (action === 'create')
      ? '${d.' + i.default + ' || \'\'}'
      : '${d.' + i.delete + ' ? \'\' : \'' + name + '\'}'
  }
}