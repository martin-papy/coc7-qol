import { test } from 'node:test'
import assert from 'node:assert/strict'
import showdown from 'showdown'
import { JSDOM } from 'jsdom'
import { richTextToMarkdown } from '../scripts/markdown-export/rich-text.js'

// A no-quirks document, like the one production parses in (class selectors are case-sensitive there).
const doc = new JSDOM('<!DOCTYPE html>').window.document
const converter = new showdown.Converter()
const deps = (overrides = {}) => ({
  isGM: false,
  doc,
  htmlToMarkdown: html => converter.makeMarkdown(html, doc),
  resolveName: () => undefined,
  ...overrides
})

test('converts basic formatting', () => {
  const md = richTextToMarkdown('<p>Born in <strong>Boston</strong>.</p><ul><li>One</li><li>Two</li></ul>', deps())
  assert.match(md, /Born in \*\*Boston\*\*\./)
  assert.match(md, /^- One$/m)
  assert.match(md, /^- Two$/m)
})

test('tidies converter noise', () => {
  const md = richTextToMarkdown('<p>A</p><ul><li>x</li></ul><ol><li>y</li></ol><p>B</p>', deps())
  assert.doesNotMatch(md, /<!--/)
  assert.doesNotMatch(md, /\n{3,}/)
  assert.equal(md, md.trim())
})

test('removes unrevealed secrets for a player, keeps revealed ones', () => {
  const html = '<p>Public</p><section class="secret" id="s1"><p>Hidden</p></section><section class="secret revealed"><p>Shown</p></section>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, /Public/)
  assert.match(md, /Shown/)
  assert.doesNotMatch(md, /Hidden/)
})

test('keeps every secret for a GM', () => {
  const md = richTextToMarkdown('<section class="secret"><p>Hidden</p></section>', deps({ isGM: true }))
  assert.match(md, /Hidden/)
})

test('document links become their label', () => {
  const md = richTextToMarkdown('<p>Met @UUID[Actor.abc123]{Dr. Armitage} and @Compendium[CoC7.items.xyz]{a tome}.</p>', deps())
  assert.match(md, /Met Dr\. Armitage and a tome\./)
})

test('an unlabelled link uses the resolved name, or nothing', () => {
  const resolveName = uuid => (uuid === 'Actor.abc123' ? 'Dr. Armitage' : undefined)
  assert.match(richTextToMarkdown('<p>Met @UUID[Actor.abc123].</p>', deps({ resolveName })), /Met Dr\. Armitage\./)
  assert.match(richTextToMarkdown('<p>Met @UUID[Actor.gone].</p>', deps({ resolveName })), /Met \./)
})

test('inline rolls become label or formula, never a wikilink', () => {
  const md = richTextToMarkdown('<p>Lose [[/roll 1d6]] or [[1d4+1]]{some} SAN, then [[/r 2d6 # fire]].</p>', deps())
  assert.match(md, /Lose 1d6 or some SAN, then 2d6\./)
  assert.doesNotMatch(md, /\[\[/)
})

test('no unescaped [[ survives', () => {
  const md = richTextToMarkdown('<p>See [[Arkham]] notes and a stray [[ here.</p>', deps())
  assert.match(md, /See Arkham notes/)
  assert.doesNotMatch(md, /(^|[^\\])\[\[/)
})

test('plain text with raw line breaks keeps its paragraphs', () => {
  const md = richTextToMarkdown('First line\nSecond line\n\nThird', deps())
  assert.equal(md, 'First line\n\nSecond line\n\nThird')
})

test('content with no visible text gives an empty string', () => {
  for (const html of ['', '   ', '<p></p>', '<p>&nbsp;</p>', '<section class="secret"><p>x</p></section>']) {
    assert.equal(richTextToMarkdown(html, deps()), '')
  }
  assert.equal(richTextToMarkdown(null, deps()), '')
})

test('scripts, styles and event handlers do not reach the note', () => {
  const md = richTextToMarkdown('<p>Safe</p><script>alert(1)</script><style>p{color:red}</style><img src="x" onerror="alert(2)">', deps())
  assert.match(md, /Safe/)
  assert.doesNotMatch(md, /alert|onerror|color:red/)
})

test('a secret block leaves no wrapper element, for a GM or a revealed one', () => {
  const gm = richTextToMarkdown('<p>Public</p><section class="secret" id="s"><p>Hidden [[/r 1d6]]</p></section>', deps({ isGM: true }))
  assert.match(gm, /Hidden 1d6/)
  assert.doesNotMatch(gm, /<section|<\/section|id="s"/)
  const revealed = richTextToMarkdown('<section class="secret revealed"><p>Shown</p></section>', deps())
  assert.equal(revealed, 'Shown')
})

test('wrapper and inline elements are unwrapped without losing text', () => {
  const md = richTextToMarkdown('<div><p>In a div</p></div><p><span style="color:red">span</span> <u>u</u> x<sup>2</sup> <mark>m</mark> <small>s</small></p>', deps())
  assert.doesNotMatch(md, /<\/?(div|span|u|sup|mark|small)/)
  assert.match(md, /In a div/)
  assert.match(md, /^span u x2 m s$/m)
})

test('embedding elements are removed', () => {
  const md = richTextToMarkdown('<p>Keep</p><iframe src="https://evil"></iframe><object data="x"></object><embed src="x"><template><p>t</p></template><noscript>n</noscript><video src="v"></video>', deps())
  assert.equal(md, 'Keep')
})

test('ordinary rich text leaves no raw HTML tag', () => {
  const html = '<h1>T</h1><blockquote><p>Q</p></blockquote><pre><code>x = 1</code></pre><hr><p>a<br>b <s>gone</s> <del>d</del> <em>e</em></p>' +
    '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>C</td></tr></tbody></table><p><img src="a.png" alt="x"> <a href="http://a.b">L</a></p>'
  const md = richTextToMarkdown(html, deps())
  assert.doesNotMatch(md.replace(/\(<[^>]*>\)/g, ''), /<[a-z/]/i)
  assert.match(md, /^#### T$/m)
  assert.match(md, /^> Q$/m)
  assert.match(md, /~~gone~~/)
  assert.match(md, /^a\\\nb /m)
})

test('literal angle brackets and entities stay text', () => {
  const md = richTextToMarkdown('<p>&lt;script&gt;alert(1)&lt;/script&gt; and a &lt;b&gt;bold?&lt;/b&gt;, Smith &amp; Wesson, &amp;amp; 2 &lt; 3</p>', deps())
  assert.doesNotMatch(md, /<script|<b>/)
  assert.match(md, /&lt;script>alert\(1\)&lt;\/script>/)
  assert.match(md, /Smith & Wesson/)
  assert.match(md, /&amp;amp;/)
})

test('a CoC7 enricher becomes its label, or is left alone without one', () => {
  const labelled = richTextToMarkdown('<p>Roll @coc7.check[type:skill,name:Spot Hidden]{Spot Hidden} now.</p>', deps())
  assert.match(labelled, /Roll Spot Hidden now\./)
  assert.doesNotMatch(labelled, /@coc7/)
  const bare = richTextToMarkdown('<p>Roll @coc7.check[type:skill,name:Spot Hidden] now.</p>', deps())
  assert.match(bare, /@coc7\.check\[type:skill,name:Spot Hidden\]/)
})

const PRIVATE_USE = /[\uE000-\uF8FF]/

/** No tag can open, and none of the pipeline's private-use markers is left behind. */
function assertNoRawHtml (md, context = '') {
  assert.doesNotMatch(md, /<[a-zA-Z/!]/, `${context}: ${md}`)
  assert.doesNotMatch(md, PRIVATE_USE, `${context}: ${JSON.stringify(md)}`)
}

const tableRow = cells => new RegExp(`^\\| ${cells.map(cell => `${cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} *`).join('\\| ')}\\|$`, 'm')

test('a table as Foundry stores it keeps every cell text', () => {
  const html = '<p>Contacts:</p><table><tbody><tr><td><p>Name</p></td><td><p>Role</p></td></tr>' +
    '<tr><td><p>Armitage</p></td><td><p>Librarian</p></td></tr></tbody></table>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, /^Contacts:$/m)
  assert.match(md, tableRow(['Name', 'Role']))
  assert.match(md, /^\| -+ \| -+ \|$/m)
  assert.match(md, tableRow(['Armitage', 'Librarian']))
})

test('a cell with two paragraphs keeps both, joined by a space', () => {
  const html = '<table><tbody><tr><td><p>Who</p></td></tr><tr><td><p>Henry</p><p>Armitage</p></td></tr></tbody></table>'
  assert.match(richTextToMarkdown(html, deps()), tableRow(['Henry Armitage']))
})

test('a thead whose cells hold paragraphs keeps its text', () => {
  const html = '<table><thead><tr><th><p>Place</p></th></tr></thead><tbody><tr><td><p>Arkham</p></td></tr></tbody></table>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, tableRow(['Place']))
  assert.match(md, tableRow(['Arkham']))
})

test('a th row inside tbody becomes the header row', () => {
  const html = '<table><tbody><tr><th>Item</th><th>Cost</th></tr><tr><td>Lamp</td><td>$2</td></tr></tbody></table>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, new RegExp(`${tableRow(['Item', 'Cost']).source.slice(0, -1)}\\n\\| -+ \\| -+ \\|`, 'm'))
  assert.match(md, tableRow(['Lamp', '$2']))
})

test('colspan and ragged rows neither crash nor lose text', () => {
  const html = '<table><tbody><tr><td colspan="2"><p>Wide</p></td></tr><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>'
  const md = richTextToMarkdown(html, deps())
  assert.match(md, /Wide/)
  assert.match(md, tableRow(['a', 'b', 'c']))
})

test('no tag in a broad sample reaches the note as raw HTML', () => {
  const tags = ['details', 'summary', 'figure', 'figcaption', 'dl', 'dt', 'dd', 'fieldset', 'legend', 'picture', 'ruby', 'rt',
    'q', 'address', 'time', 'var', 'samp', 'dfn', 'label', 'header', 'article', 'aside', 'footer', 'nav', 'main', 'form',
    'input', 'button', 'select', 'option', 'output', 'meter', 'progress', 'secret-block', 'my-widget', 'center',
    'big', 'tt', 'bdi', 'bdo', 'data', 'caption', 'li', 'pre', 'span', 'u', 'sup', 'sub', 'abbr', 'cite', 'kbd', 'ins', 'mark']
  for (const tag of tags) {
    const html = `<p>before</p><${tag}>inner ${tag}</${tag}><p>x <${tag}>in ${tag}</${tag}> y</p>`
    const md = richTextToMarkdown(html, deps())
    assertNoRawHtml(md, tag)
    assert.match(md, new RegExp(`in ${tag}`), tag)
  }
})

test('unwrapped blocks stay separate paragraphs, unwrapped inline elements stay inline', () => {
  assert.equal(richTextToMarkdown('<div><p>A</p></div><p>B</p>', deps()), 'A\n\nB')
  assert.equal(richTextToMarkdown('<p>x <q>T</q> y</p>', deps()), 'x T y')
  assert.equal(richTextToMarkdown('<dl><dt>Term</dt><dd>Def</dd></dl>', deps()), 'Term\n\nDef')
  assert.equal(richTextToMarkdown('<div>One</div><div>Two</div>', deps()), 'One\n\nTwo')
  assert.equal(richTextToMarkdown('Loose <b>bold</b><p>Para</p>', deps()), 'Loose **bold**\n\nPara')
})

test('an anchor without href keeps its text', () => {
  const md = richTextToMarkdown('<p>See <a class="content-link" data-uuid="Actor.a1">Dr. Armitage</a> today</p>', deps())
  assert.equal(md, 'See Dr. Armitage today')
})

test('an HTML comment is removed, the sentence stays whole', () => {
  assert.equal(richTextToMarkdown('<p>a<!-- hidden comment -->b</p>', deps()), 'ab')
})

test('only http, https and mailto links stay links', () => {
  for (const href of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', '\tjava\nscript:alert(1)', 'data:text/html,x', 'worlds/x/page.html', '#anchor', 'vbscript:x']) {
    const md = richTextToMarkdown(`<p><a href="${href}">click</a> here</p>`, deps())
    assert.equal(md, 'click here', href)
  }
  assert.equal(richTextToMarkdown('<p><a href="https://example.com/a b">site</a></p>', deps()), '[site](<https://example.com/a%20b>)')
  assert.equal(richTextToMarkdown('<p><a href="MAILTO:x@y.z">mail</a></p>', deps()), '[mail](<MAILTO:x@y.z>)')
})

const renderBack = md => {
  const holder = doc.createElement('div')
  holder.innerHTML = converter.makeHtml(md)
  return holder
}

test('text in a code block is written once, without rewriting', () => {
  const md = richTextToMarkdown('<pre><code>x = 1 &lt; 2 &amp;&amp; [[2]] @UUID[Actor.a]{A}</code></pre>', deps())
  assert.match(md, /^```\nx = 1 < 2 && \[\[2\]\] @UUID\[Actor\.a\]\{A\}\n```$/m)
  assert.equal(renderBack(md).querySelector('code').textContent.trimEnd(), 'x = 1 < 2 && [[2]] @UUID[Actor.a]{A}')
})

test('a pre without code still becomes a fence', () => {
  const md = richTextToMarkdown('<pre>line 1<br>line &lt;2&gt;</pre>', deps())
  assert.equal(md, '```\nline 1\nline <2>\n```')
})

test('inline code reads as typed when rendered and opens no tag', () => {
  const md = richTextToMarkdown('<p>Type <code>a &lt; b &amp; c</code> then <code>[[2]]</code> and <code>x`y</code></p>', deps())
  assert.equal(md, 'Type `a < b & c` then `[[2]]` and ``x`y``')
  const html = renderBack(md)
  assert.deepEqual([...html.querySelectorAll('code')].map(code => code.textContent), ['a < b & c', '[[2]]', 'x`y'])
  assert.equal(html.querySelectorAll('*').length, 4)
  assert.equal(richTextToMarkdown('<p>a<code> </code>b</p>', deps()), 'a b')
})

test('a placeholder-looking text outside code is left alone', () => {
  const md = richTextToMarkdown('<p>\uE001 0 \uE002 and <code>k</code></p>', deps())
  assert.equal(md, '0 and `k`')
})

test('[[ outside code is still escaped next to code', () => {
  const md = richTextToMarkdown('<p>[[Link]] and <code>[[x]]</code></p><pre><code>[[y]]</code></pre>', deps())
  assert.match(md, /^Link and `\[\[x\]\]`$/m)
  assert.match(md, /^\[\[y\]\]$/m)
})

test('a line break becomes a Markdown hard break', () => {
  assert.equal(richTextToMarkdown('<p>12 Main St<br>Arkham<br>MA</p>', deps()), '12 Main St\\\nArkham\\\nMA')
  assert.equal(richTextToMarkdown('<p>a<br><br>b<br></p>', deps()), 'a\\\nb')
  assert.equal(richTextToMarkdown('<p>a<br>- b</p>', deps()), 'a\\\n\\- b')
  assert.equal(richTextToMarkdown('<blockquote><p>q<br>r</p></blockquote>', deps()), '> q\\\n> r')
  assert.equal(richTextToMarkdown('<ul><li>one<br>two</li></ul>', deps()), '- one\\\n  two')
})

test('a line break in a table cell or a heading is a space', () => {
  const md = richTextToMarkdown('<h2>Big<br>Title</h2><table><tbody><tr><td>H</td></tr><tr><td>a<br>b</td></tr></tbody></table>', deps())
  assert.match(md, /^##### Big Title$/m)
  assert.match(md, tableRow(['a b']))
  assert.doesNotMatch(md, /<br|\\$/m)
})

test('rich-text headings are demoted under the note headings', () => {
  const md = richTextToMarkdown('<h1>Big</h1><h2>Mid</h2><h3>Small</h3><h6>Tiny</h6>', deps())
  assert.equal(md, '#### Big\n\n##### Mid\n\n###### Small\n\n###### Tiny')
})

test('only http and https images stay images', () => {
  assert.equal(richTextToMarkdown('<p><img src="https://example.com/p.png" alt="Harvey"></p>', deps()), '![Harvey](<https://example.com/p.png>)')
  assert.equal(richTextToMarkdown('<p><img src="worlds/x/portrait.webp" alt="Harvey"></p>', deps()), 'Harvey')
  assert.equal(richTextToMarkdown('<p>a <img src="data:image/png;base64,x"> b</p>', deps()), 'a b')
  assert.equal(richTextToMarkdown('<p><img src="https://e.com/a.png" alt="x] [y"></p>', deps()), '![x\\] \\[y](<https://e.com/a.png>)')
})

test('a hyphenated CoC7 enricher becomes its label, or is left alone', () => {
  assert.equal(richTextToMarkdown('<p>Ask @coc-actor[Actor.abc]{Dr. Armitage} now.</p>', deps()), 'Ask Dr. Armitage now.')
  assert.match(richTextToMarkdown('<p>Ask @coc-actor[Actor.abc] now.</p>', deps()), /@coc-actor\[Actor\.abc\]/)
})

test('a backtick line inside a code block cannot close the fence', () => {
  const html = '<pre><code>```\n&lt;img src=x onerror=alert(1)&gt;\n[[x]]\n</code></pre><p>after [[y]] a<br>b</p>'
  const md = richTextToMarkdown(html, deps())
  // The `<img …>` text is inert inside the fence; outside it, nothing may open a tag.
  assertNoRawHtml(md.replace(/^````\n[\s\S]*?\n````$/m, ''))
  assert.doesNotMatch(md, PRIVATE_USE)
  // A four-backtick fence: in CommonMark (Obsidian) only a fence at least as long closes it.
  // showdown's own makeHtml does not follow that rule, so the exact text is asserted instead.
  assert.equal(md, '````\n```\n<img src=x onerror=alert(1)>\n[[x]]\n````\n\nafter y a\\\nb')
})

test('a code block holding a longer backtick run or a tilde fence stays one block', () => {
  const four = richTextToMarkdown('<pre><code>````\ncode\n````</code></pre><p>after</p>', deps())
  assert.equal(four, '`````\n````\ncode\n````\n`````\n\nafter')
  const tildes = richTextToMarkdown('<pre><code>~~~\n&lt;b&gt;\n~~~</code></pre><p>after</p>', deps())
  assert.equal(tildes, '```\n~~~\n<b>\n~~~\n```\n\nafter')
})

test('blank lines inside a code block are kept exactly', () => {
  assert.equal(richTextToMarkdown('<pre><code>a\n\n\n\nb</code></pre>', deps()), '```\na\n\n\n\nb\n```')
  assert.equal(richTextToMarkdown('<pre></pre><p>z</p>', deps()), 'z')
})

test('a code block in a quote or a list keeps the prefix on every line', () => {
  assert.equal(richTextToMarkdown('<blockquote><pre><code>x\n\ny</code></pre></blockquote>', deps()), '> ```\n> x\n> \n> y\n> ```')
  assert.match(richTextToMarkdown('<ul><li><p>item</p><pre><code>x\ny</code></pre></li></ul>', deps()), /^- item\n\n {4}```\n {4}x\n {4}y\n {4}```$/m)
})

test('inline code with backticks gets a longer delimiter, padded when needed', () => {
  const md = richTextToMarkdown('<p><code>`lead</code> and <code>a``b</code></p>', deps())
  assert.equal(md, '`` `lead `` and ```a``b```')
  assert.deepEqual([...renderBack(md).querySelectorAll('code')].map(code => code.textContent), ['`lead', 'a``b'])
})

test('a code block inside a heading becomes inline code', () => {
  const md = richTextToMarkdown('<h2>Title <pre>x &lt; y</pre></h2>', deps())
  assertNoRawHtml(md.replace(/`[^`]*`/g, ''))
  assert.equal(md, '##### Title `x < y`')
})

test('marker characters in attributes or resolved names cannot forge a placeholder', () => {
  const forged = '\uE0010\uE002'
  const href = richTextToMarkdown(`<p><code>&lt;img src=x&gt;</code> <a href="https://x/${forged}">l</a></p>`, deps())
  assert.equal(href, '`<img src=x>` [l](<https://x/0>)')
  const alt = richTextToMarkdown(`<p><code>k</code> <img src="https://x/a.png" alt="${forged}"> <img src="rel.png" alt="${forged}"></p>`, deps())
  assert.equal(alt, '`k` ![0](<https://x/a.png>) 0')
  const named = richTextToMarkdown('<p><code>k</code> @UUID[Actor.a] end</p>', deps({ resolveName: () => `${forged} x\uE000y` }))
  assert.equal(named, '`k` 0 xy end')
  // Code spans and link destinations (`(<url>)`) may hold `<`; nothing else may.
  for (const md of [href, alt, named]) assertNoRawHtml(md.replace(/`[^`]*`/g, '').replace(/\(<[^>]*>\)/g, ''))
})
