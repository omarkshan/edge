'use strict'

/*
 * adonis-edge
 *
 * (c) Harminder Virk <virk@adonisjs.com>
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
*/

const path = require('path')
const test = require('japa')
const cheerio = require('cheerio')
const dedent = require('dedent-js')
const Template = require('../../src/Template')
const Loader = require('../../src/Loader')
const Context = require('../../src/Context')

test.group('Template Compiler', (group) => {
  group.before(() => {
    require('../../test-helpers/transform-tags')(this, require('../../src/Tags'))
  })

  test('parse a simple template string without tags', (assert) => {
    const statement = `{{ username }}`
    const template = new Template({})
    const output = template.compileString(statement)
    assert.equal(output, dedent`
    return (function templateFn () {
      let out = new String()
      out += \`\${this.context.escape(this.context.resolve('username'))}\\n\`
      return out
    }).bind(this)()
    `)
  })

  test('parse a simple template string with tags', (assert) => {
    const statement = dedent`
    @if(username)
      {{ username }}
    @endif
    `
    const template = new Template(this.tags)
    const output = template.compileString(statement)
    assert.equal(output, dedent`
    return (function templateFn () {
      let out = new String()
      if (this.context.resolve('username')) {
        out += \`  \${this.context.escape(this.context.resolve('username'))}\\n\`
      }
      return out
    }).bind(this)()
    `)
  })

  test('report error with correct lineno when string has error', (assert) => {
    const statement = dedent`
    @if(username, age)
      {{ username }}
    @endif
    `
    const template = new Template(this.tags)
    const output = () => template.compileString(statement)
    assert.throw(output, 'lineno:1 charno:0 E_INVALID_EXPRESSION: Invalid expression <username, age> passed to (if) block')
  })

  test('parse a template by reading it via loader', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const template = new Template(this.tags, {}, loader)
    const output = template.compile('ifView')
    assert.equal(output, dedent`
    module.exports = function () {
      let out = new String()
      if (this.context.resolve('username')) {
        out += \`  \${this.context.escape(this.context.resolve('username'))}\\n\`
      }
      return out
    }
    `)
  })

  test('report error with correct lineno when file has error', (assert) => {
    assert.plan(2)
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const template = new Template(this.tags, {}, loader)
    template.sourceView('ifErrorView')
    const output = () => template.compile('ifErrorView')
    try {
      output()
    } catch (error) {
      assert.equal(error.message, 'E_INVALID_EXPRESSION: Invalid expression <username, age> passed to (if) block')
      assert.equal(error.stack.split('\n')[2], `at (${loader.getViewPath('ifErrorView')}:8:0)`)
    }
  })

  test('do not parse layout when it is not in the first line', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    Hello world
    @layout('layouts.master')
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = template.renderString(statement)
    assert.equal(output, dedent`
    Hello world
    @layout('layouts.master')

    `)
  })

  test('ignore everything not inside sections when a layout is defined', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    @layout('layouts.master')
    <h2> Hello world </h2>
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = template.renderString(statement)
    const $ = cheerio.load(output)
    assert.equal($('h2').length, 0)
  })

  test('replace layout section value with template section', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    @layout('layouts.master')
    @section('content')
      <h2> Hello world </h2>
    @endsection
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = template.renderString(statement)
    const $ = cheerio.load(output)
    assert.equal($('h2').length, 1)
    assert.equal($('p').length, 0)
    assert.equal($('h2').text().trim(), 'Hello world')
  })

  test('throw exception when a section is called twice', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    @layout('layouts.master')
    @section('content')
      <h2> Hello world </h2>
    @endsection

    @section('content')
      <h2> Hello world </h2>
    @endsection
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = () => template.renderString(statement)
    assert.throw(output, `lineno:6 charno:0 E_INVALID_EXPRESSION: Section <@section('content')> has been called multiple times. A section can only be called once`)
  })

  test('throw exception when a section name is not a literal', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    @layout('layouts.master')
    @section(content)
      <h2> Hello world </h2>
    @endsection
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = () => template.renderString(statement)
    assert.throw(output, `lineno:2 charno:0 E_INVALID_EXPRESSION: Invalid expression <content> passed to a section. Make sure section name must be a valid string`)
  })

  test('throw exception when layout file has invalid section name', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    @layout('layouts.invalid.master')
    @section('content')
      <h2> Hello world </h2>
    @endsection
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = () => template.renderString(statement)
    assert.throw(output, `lineno:8 charno:0 E_INVALID_EXPRESSION: Invalid expression <content> passed to (section) block`)
  })

  test('define dynamic layout name', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const statement = dedent`
    @layout(masterLayout)
    @section('content')
      <h2> Hello world </h2>
    @endsection
    `

    this.tags.section.run(Context)
    const template = new Template(this.tags, {}, loader)
    const output = template.renderString(statement, {
      masterLayout: 'layouts.master'
    })
    const $ = cheerio.load(output)
    assert.equal($('h2').length, 1)
    assert.equal($('p').length, 0)
    assert.equal($('h2').text().trim(), 'Hello world')
  })
})

test.group('Template Runner', () => {
  test('render a template by loading it from file', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const template = new Template(this.tags, {}, loader)
    template.sourceView('welcome')
    const output = template.render('welcome', { username: 'virk' })
    assert.equal(output.trim(), 'virk')
  })

  test('render a template from string', (assert) => {
    const loader = new Loader(path.join(__dirname, '../../test-helpers/views'))
    const template = new Template(this.tags, {}, loader)
    const output = template.renderString('{{ username }}', { username: 'virk' })
    assert.equal(output.trim(), 'virk')
  })

  test('make use of presenter when rendering the view', (assert) => {
    const loader = new Loader(
      path.join(__dirname, '../../test-helpers/views'),
      path.join(__dirname, '../../test-helpers/presenters')
    )
    const template = new Template(this.tags, {}, loader)
    const output = template.presenter('User').renderString('{{ username }}', { username: 'virk' })
    assert.equal(output.trim(), 'VIRK')
  })

  test('pass locals when rendering the view', (assert) => {
    const loader = new Loader(
      path.join(__dirname, '../../test-helpers/views'),
      path.join(__dirname, '../../test-helpers/presenters')
    )
    const template = new Template(this.tags, {}, loader)
    const output = template.share({username: 'virk'}).renderString('{{ username }}')
    assert.equal(output.trim(), 'virk')
  })
})
