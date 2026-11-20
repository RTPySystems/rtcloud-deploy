/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 298:
/***/ ((module) => {

// A simple implementation of make-array
function makeArray (subject) {
  return Array.isArray(subject)
    ? subject
    : [subject]
}

const UNDEFINED = undefined
const EMPTY = ''
const SPACE = ' '
const ESCAPE = '\\'

// The characters that carry a meaning of their own inside a regular
//   expression, so a literal one has to be escaped before it is emitted.
const REGEX_LITERAL_SPECIAL = /[.*+?()[\]{}^$|\\/]/
const BOM = '\uFEFF'
const REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/
// A run of two or more asterisks is a globstar (#175)
const REGEX_ANCHORED_GLOBSTAR = /^\/\*{2,}$/
const REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/
const REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/
const REGEX_SPLITALL_CRLF = /\r?\n/g

// Invalid:
// - /foo,
// - ./foo,
// - ../foo,
// - .
// - ..
// Valid:
// - .foo
const DOUBLE_SLASH = '//'
const SLASH_CODE = 47
const DOT_CODE = 46


const SLASH = '/'

// Do not use ternary expression here, since "istanbul ignore next" is buggy
let TMP_KEY_IGNORE = 'node-ignore'
/* istanbul ignore else */
if (typeof Symbol !== 'undefined') {
  TMP_KEY_IGNORE = Symbol.for('node-ignore')
}
const KEY_IGNORE = TMP_KEY_IGNORE

const define = (object, key, value) => {
  Object.defineProperty(object, key, {value})
  return value
}

const RETURN_FALSE = () => false

// > The range notation, e.g. [a-zA-Z],
// > can be used to match one of the characters in a range.
//
// gitignore(5) defers to fnmatch(3) for this, and git implements it in
//   `wildmatch.c`.  A bracket expression has a sub-grammar of its own, which
//   is neither the surrounding pattern grammar nor the JavaScript one:
//
//   - a `]` right after `[` or `[!` is a literal member, not the terminator
//   - `[:alpha:]` names one of twelve POSIX classes
//   - `\` escapes the next member, `]` included
//   - `*`, `?` and `.` are plain literal members
//   - an unterminated expression makes the whole pattern match nothing
//
// which means the expression can not be located -- let alone translated -- by
//   a regular expression.  It is scanned out of the pattern before the
//   replacers below run, and put back once they are done, so that neither the
//   metacharacter escaper nor the `?` / `*` replacers ever see its body.

// git classifies with its own ASCII-only ctype macros (`wildmatch.c`), never
//   with the C library ones, so these must not be mapped onto `\d` / `\w` /
//   `\s`, which are wider.  `/` is left out of every expansion, because a
//   bracket expression never matches a path separator.
const POSIX_CLASSES = {
  alnum: '0-9A-Za-z',
  alpha: 'A-Za-z',
  blank: ' \\t',
  cntrl: '\\x00-\\x1f\\x7f',
  digit: '0-9',
  graph: '!-.0-~',
  lower: 'a-z',
  print: ' -.0-~',
  punct: '!-.:-@\\[-`{-~',
  // git's `sane-ctype.h` classifies \v and \f as control, not space,
  //   unlike C's `isspace`
  space: ' \\t\\n\\r',
  upper: 'A-Z',
  xdigit: '0-9A-Fa-f'
}

const CLASS_MEMBERS_TO_ESCAPE = '\\]^-['

const escapeMember = char => CLASS_MEMBERS_TO_ESCAPE.indexOf(char) < 0
  ? char
  : ESCAPE + char

// > if (matched == negated || ((flags & WM_PATHNAME) && text_ch == '/'))
// >   return WM_ABORT_TO_STARSTAR;                     (git, `wildmatch.c`)
// A bracket expression never matches a path separator, whatever its members
//   say, so a negated class gets `/` as one more excluded character, while a
//   plain one -- where a literal member or a range could still let `/` in --
//   is guarded with a lookahead, `/` being impossible to subtract from a
//   JavaScript character class.
const NON_SLASH = '(?!\\/)'

const classSource = (negated, body) => {
  if (negated) {
    return `[^\\/${body}]`
  }

  const source = `[${body}]`

  return new RegExp(source).test('/')
    ? NON_SLASH + source
    : source
}

// Scan the bracket expression that starts at `pattern[start] === '['`,
//   mirroring the member loop of git's `wildmatch.c`.
// @returns {{end: number, source: string} | null} `null` if the expression is
//   never terminated, which makes the whole pattern match nothing.
const scanBracket = (pattern, start) => {
  const {length} = pattern
  let index = start + 1
  let negated = EMPTY

  const lead = pattern[index]
  if (lead === '!' || lead === '^') {
    negated = '^'
    index ++
  }

  let body = EMPTY

  // The member a `-` could start a range from, or EMPTY when the previous
  //   member can not open one (start of the body, or a range / POSIX class
  //   that has just closed)
  let prev = EMPTY

  // git scans the members with a do-while, so the first one is consumed
  //   unconditionally.  That is the whole reason a leading `]` is a member
  //   and not the terminator.
  for (;;) {
    const char = pattern[index]

    if (char === UNDEFINED) {
      return null
    }

    if (char === ESCAPE) {
      const escaped = pattern[index + 1]
      if (escaped === UNDEFINED) {
        return null
      }
      body += escapeMember(escaped)
      prev = escaped
      index ++
    } else if (
      char === '-'
      && prev
      && index + 1 < length
      && pattern[index + 1] !== ']'
    ) {
      index ++
      let to = pattern[index]
      if (to === ESCAPE) {
        // A pattern can not end on a lone backslash -- `checkPattern` has
        //   already thrown it away -- so there is an upper bound to read.
        to = pattern[index += 1]
      }
      // An out-of-order range matches nothing in git but is a syntax error in
      //   JavaScript, so it is dropped.  Its lower bound stays: git tests it
      //   as a plain member before it ever looks at the `-`, so `[c-a]` does
      //   match `c`.
      if (prev <= to) {
        body += `-${escapeMember(to)}`
      }
      prev = EMPTY
    } else if (char === '[' && pattern[index + 1] === ':') {
      const nameStart = index + 2
      let end = nameStart
      while (end < length && pattern[end] !== ']') {
        end ++
      }

      if (end === length) {
        return null
      }

      if (end > nameStart && pattern[end - 1] === ':') {
        const name = pattern.slice(nameStart, end - 1)

        // An unknown class name makes the whole pattern match nothing
        if (!Object.prototype.hasOwnProperty.call(POSIX_CLASSES, name)) {
          return null
        }

        body += POSIX_CLASSES[name]
        prev = EMPTY
        index = end
      } else {
        // No `:]` to close it, so the `[` is a plain member and scanning
        //   resumes right after it.
        body += escapeMember('[')
        prev = '['
        index = nameStart - 2
      }
    } else {
      body += escapeMember(char)
      prev = char
    }

    index ++

    if (pattern[index] === ']') {
      return {
        end: index,
        source: classSource(negated, body)
      }
    }
  }
}

// An empty JavaScript class can never match, which is how a pattern that git
//   gives up on (`WM_ABORT_ALL`) is expressed here.
const NEVER_MATCH = '[]'

// A NUL can appear in neither a `.gitignore` line nor a path, which makes it
//   the one safe placeholder character.  A literal one in the pattern is
//   held aside all the same, so a collision is impossible by construction.
const PLACEHOLDER = '\u0000'
const REGEX_RESTORE_PLACEHOLDER = new RegExp(
  `${PLACEHOLDER}(\\d+)${PLACEHOLDER}`, 'g'
)

// The one wildcard the chain does not expand for itself is a trailing `*`. How
//   it expands depends on the mode (`regex` vs `checkRegex`), so `_make` is
//   left to do it, and until then the pending wildcard travels as this marker.
//   That is what keeps it apart from a user-escaped literal `\*`: the unescape
//   steps collapse the escaped one to the exact `\*` a wildcard would leave
//   behind, so by the time `_make` runs the two are otherwise the same string
//   and a literal star gets wrongly rewritten into a wildcard. The marker is a
//   private-use character, and `extractBrackets` keeps one that came out of the
//   pattern apart from it, so the only marker `_make` ever turns back into a
//   real wildcard is the one this chain put there itself.
const TRAILING_WILDCARD = '\uE000'

// A trailing "/**" is deferred the same way, because `checkRegex` has to tell
//   it apart from a trailing "/*" (see `checkSourceOf`). For `.ignores()` it
//   still never matches the folder itself (#21).
const TRAILING_DOUBLESTAR = '\uE001'

// The three characters above mean something to the chain that builds the
//   source rather than to the path, so one that came out of the pattern is
//   held aside like a bracket expression instead of going straight out. Being
//   held is what makes it safe: the restore runs after the step that anchors
//   the source, so the character comes back in the middle of the source and
//   not at its end, which is the one place `_make` and `checkSourceOf` look
//   for a marker. Without it a pattern's own character lands where a pending
//   marker sits, and `_make` turns it into a real trailing wildcard.
//
// It is held as a one-member class rather than bare, in both of the branches
//   a reserved character can reach, so that the property can be
//   read off this function alone -- a reserved character never goes out on
//   its own -- rather than depending on where in the chain the restore
//   happens to run. In the expression built here `[x]` matches exactly what
//   `x` matches, none of the three being special to a regular expression or
//   inside a class, so no test can tell the two apart: the class is insurance,
//   and the paragraph above is the reason it is not needed.
const isReserved = char =>
  char === PLACEHOLDER
  || char === TRAILING_WILDCARD
  || char === TRAILING_DOUBLESTAR

// Replace every bracket expression with a placeholder the replacers below
//   leave alone, and translate it separately.
const extractBrackets = pattern => {
  const sources = []
  const hold = source =>
    `${PLACEHOLDER}${sources.push(source) - 1}${PLACEHOLDER}`

  const {length} = pattern
  let out = EMPTY
  let index = 0

  while (index < length) {
    const char = pattern[index]

    if (char === ESCAPE) {
      // > Put a backslash ("\") in front of ... a character to make it literal.
      //                                            (gitignore(5) -> fnmatch(3))
      // A backslash quotes the next character, whatever it is, so `\d` is a
      //   literal `d`, not the regex digit class, and `\?` is a literal `?`,
      //   not a wildcard. Held aside as its literal here, the escape never
      //   reaches the replacers below, which would otherwise let `\d`, `\b`,
      //   `\1`, `\/` keep their regular-expression meaning, and would turn a
      //   `\?` into `[^\/]`.
      //
      // Three escapes are still left for the chain: `\*` (a literal star,
      //   told apart from a wildcard by `TRAILING_WILDCARD` and the wildcard
      //   replacers), `\[` (a literal bracket, the one `[` the bracket
      //   replacer still expects), and `\ ` (a quoted space, which one pass
      //   below rewrites in bulk -- holding each one aside instead costs more
      //   on a pattern built out of them). A lone trailing backslash can reach
      //   here after line-ending cleanup.
      //
      // A quoted backslash is not among them. The chain doubles every
      //   backslash, then takes the doubling back out again, and a quoted one
      //   standing next to a character the chain also escapes left the two
      //   counts sharing a run, so one of the escapes was lost. Held here as
      //   the literal it means, it never joins that run.
      const escaped = pattern[index + 1]

      if (
        escaped === UNDEFINED
        || escaped === SLASH && index + 2 === length
      ) {
        // Git removes a final directory slash before matching. An escape
        //   without a character after that removal makes the pattern invalid.
        out += hold(NEVER_MATCH)
      } else if (
        escaped === '*'
        || escaped === '['
        || escaped === SPACE
      ) {
        out += pattern.slice(index, index + 2)
      } else {
        out += hold(
          REGEX_LITERAL_SPECIAL.test(escaped)
            ? ESCAPE + escaped
            : isReserved(escaped)
              ? `[${escaped}]`
              : escaped
        )
      }

      index += 2
    } else if (isReserved(char)) {
      out += hold(`[${char}]`)
      index ++
    } else if (char === '[') {
      const scanned = scanBracket(pattern, index)

      if (scanned === null) {
        // git gives up on the whole pattern (`WM_ABORT_ALL`), so whatever
        //   follows can not make it match either.
        out += hold(NEVER_MATCH)
        index = length
      } else {
        out += hold(scanned.source)
        index = scanned.end + 1
      }
    } else {
      out += char
      index ++
    }
  }

  return {
    source: out,
    sources
  }
}

// A step of the chain below is normally a `[matcher, replacer]` pair handed
//   to `String.replace`. `DIRECT` marks the ones that are plain string work
//   instead, and take `(source, pattern)`.
//
// Anchoring the two ends is exactly that -- a test of one character and a
//   concatenation -- and putting it through the regular expression engine
//   cost a third of this chain for nothing: 167ns where 10ns does the same
//   job. The two are still steps in the same list, in the same places,
//   because their position in the order is part of what they mean.
const DIRECT = null

// A separator at the beginning or in the middle of a pattern, as opposed to
//   one at the very end.
const REGEX_INNER_SLASH = /\/(?!$)/

// > If the pattern ends with a slash,
// > it is removed for the purpose of the following description,
// > but it would only find a match with a directory.
// > In other words, foo/ will match a directory foo and paths underneath it,
// > but will not match a regular file or a symbolic link foo
// >  (this is consistent with the way how pathspec works in general in Git).
// '`foo/`' will not match regular file '`foo`' or symbolic link '`foo`'
// -> ignore-rules will not deal with it, because it costs extra `fs.stat` call
//      you could use option `mark: true` with `glob`

// '`foo/`' should not continue with the '`..`'
// The chain that turns one gitignore pattern into a regular expression
//   source, in order. A step is either
//
//   [matcher, replacer]            handed to `String.replace`
//   [matcher, replacer, required]  the same, but skipped outright unless
//                                    `required` appears in the string, which
//                                    the matcher cannot match without
//   [DIRECT, transform]            plain string work, taking (source, pattern)
//
// The `required` character is only ever a shortcut: finding it does not mean
//   the matcher will match, and not finding it means it cannot. It is there
//   because scanning for one character costs a fraction of running a matcher
//   that then finds nothing -- for the wildcard step, whose `[^\\]+`
//   backtracks its way through the whole string before giving up, 11ns
//   against 400ns.
const REPLACERS = [

  // Replace (\ ) with ' '
  // Only a space: an escaped tab or other whitespace is already a literal by
  //   the time it reaches here, and a bare tab must be left as one, not turned
  //   into a space.
  // (\ ) -> ' '
  // (\\ ) -> '\\ '
  // (\\\ ) -> '\\ '
  [
    // A run of backslashes is taken whole, from its first one, so no match
    //   ever starts again inside it -- `(\\+?) ` did, which made a long run
    //   quadratic.
    /(\\+)( ?)/g,
    (_, run, space) => space
      ? run.slice(0, run.length - run.length % 2) + SPACE
      : run,
    ESCAPE + SPACE
  ],

  // git's wildmatch() reads a run of two or more asterisks as one globstar
  //   whenever the run fills a path segment: it starts the pattern or follows
  //   a `/`, and it ends the pattern or comes before a `/`. A run of two is
  //   already `**`; a longer one is folded into `**` here, so the steps
  //   below only ever have to know `**`.
  // `***/foo` -> `**/foo`, `a/***/b` -> `a/**/b`, `a/***` -> `a/**`
  // git also takes a run beside a literal prefix (`a***/b`) or beside an
  //   escaped slash (`***\/b`) as a globstar, and this does not; the README
  //   lists both, under "A run of asterisks".
  [
    /(^|\/)\*{3,}(?=\/|$)/g,
    (_, start) => `${start}**`,
    '*'
  ],

  // Escape metacharacters
  // which is written down by users but means special for regular expressions.

  // > There are 12 characters with special meanings:
  // > - the backslash \,
  // > - the caret ^,
  // > - the dollar sign $,
  // > - the period or dot .,
  // > - the vertical bar or pipe symbol |,
  // > - the question mark ?,
  // > - the asterisk or star *,
  // > - the plus sign +,
  // > - the opening parenthesis (,
  // > - the closing parenthesis ),
  // > - and the opening square bracket [,
  // > - the opening curly brace {,
  // > These special characters are often called "metacharacters".
  [
    /[\\$.|*+(){^]/g,
    match => `\\${match}`
  ],

  [
    // > a question mark (?) matches a single character
    /(?!\\)\?/g,
    () => '[^/]',
    '?'
  ],

  // leading slash
  [

    // > A leading slash matches the beginning of the pathname.
    // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
    // A leading slash matches the beginning of the pathname
    /^\//,
    () => '^',
    SLASH
  ],

  // replace special metacharacter slash after the leading slash
  [
    /\//g,
    () => '\\/',
    SLASH
  ],

  [
    // > A leading "**" followed by a slash means match in all directories.
    // > For example, "**/foo" matches file or directory "foo" anywhere,
    // > the same as pattern "foo".
    // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
    // >   under directory "foo".
    // Notice that the '*'s have been replaced as '\\*'
    /^\^*(?:\\\*\\\*\\\/)+/,

    // '**/foo' <-> 'foo'
    () => '^(?:.*\\/)?',
    '*'
  ],

  // starting
  [
    // there will be no leading '/'
    //   (which has been replaced by section "leading slash")
    // If starts with '**', adding a '^' to the regular expression also works
    DIRECT,
    (source, pattern) => {
      // Nothing to anchor to, or already anchored
      if (!source || source[0] === '^') {
        return source
      }

      // If has a slash `/` at the beginning or middle
      const anchor = !REGEX_INNER_SLASH.test(pattern)
        // > Prior to 2.22.1
        // > If the pattern does not contain a slash /,
        // >   Git treats it as a shell glob pattern
        // Actually, if there is only a trailing slash,
        //   git also treats it as a shell glob pattern

        // After 2.22.1 (compatible but clearer)
        // > If there is a separator at the beginning or middle (or both)
        // > of the pattern, then the pattern is relative to the directory
        // > level of the particular .gitignore file itself.
        // > Otherwise the pattern may also match at any level below
        // > the .gitignore level.
        ? '(?:^|\\/)'

        // > Otherwise, Git treats the pattern as a shell glob suitable for
        // >   consumption by fnmatch(3)
        : '^'

      return anchor + source
    }
  ],

  // two globstars
  [
    // Use lookahead assertions so that we could match more than one `'/**'`
    /\\\/\\\*\\\*(?=\\\/|$)/g,

    // Zero, one or several directories
    // should not use '*', or it will be replaced by the next replacer

    // Check if it is not the last `'/**'`
    (_, index, str) => index + 6 < str.length

      // case: /**/ at the end of the pattern, i.e. a trailing `'/**/'`
      // > A trailing `"/**/"` (a trailing `"/**"` restricted to directories)
      // >   matches everything inside, but it should not match the current
      // >   folder itself, so it requires at least one directory segment.
      // 'a/**/' matches 'a/b/', 'a/x/y/' but not 'a/'
      ? str.slice(index + 6) === '\\/'
        ? '(?:\\/[^\\/]+)+'

        // case: /**/
        // > A slash followed by two consecutive asterisks then a slash matches
        // >   zero or more directories.
        // > For example, "a/**/b" matches "a/b", "a/x/b", "a/x/y/b" and so on.
        // '/**/'
        : '(?:\\/[^\\/]+)*'

      // case: /**
      // > A trailing `"/**"` matches everything inside.

      // #21: everything inside but it should not include the current folder,
      //   resolved by `_make`
      : `\\/${TRAILING_DOUBLESTAR}`,
    '*'
  ],

  // normal intermediate wildcards
  [
    // Never replace escaped '*'
    // ignore rule '\*' will match the path '*'

    // 'abc.*/' -> go
    // 'abc.*'  -> skip this rule,
    //    coz trailing single wildcard will be handed by [trailing wildcard]
    /(^|[^\\]+)(\\\*)+(?=.+)/g,

    // '*.js' matches '.js'
    // '*.js' doesn't match 'abc'
    (_, p1, p2) => {
      // 1.
      // > An asterisk "*" matches anything except a slash.
      // 2.
      // > Other consecutive asterisks are considered regular asterisks
      // > and will match according to the previous rules.
      const unescaped = p2.replace(/\\\*/g, '[^\\/]*')
      return p1 + unescaped
    },
    '*'
  ],

  // trailing wildcard, held apart from a literal star
  [
    // The step above leaves a trailing `*` alone, so a single `\*` is all that
    //   can be left at the end here, and what stands in front of it says which
    //   kind it is. A wildcard arrives as the escaper wrote it, `\*` with
    //   nothing before it; a literal arrives as the user's own escape, which
    //   the escaper doubled, and then the star's own -- `\\` and then `\*`.
    //   There is no third case: every backslash still reaching the chain is
    //   one `\*`, `\[` or `\ ` carries itself, and each is followed by its
    //   own character, so a longer run can never form. This runs while the
    //   two are still distinct, before the unescape steps below collapse the
    //   literal onto the very `\*` a wildcard leaves behind.
    /(^|[^\\])((?:\\\\)*)\\\*$/,

    (match, p1, p2) =>
      p2 === EMPTY
        // A real wildcard: carry it to `_make` as the marker, so the unescape
        //   steps and the trailing-wildcard rewrite can never mistake it for a
        //   literal `\*` (nor the reverse).
        ? p1 + TRAILING_WILDCARD
        // A literal star: leave it exactly as it stands for the unescape steps.
        : match,
    '*'
  ],

  [
    // unescape, revert step 3 except for back slash
    // For example, if a user escape a '\\*',
    // after step 3, the result will be '\\\\\\*'
    /\\\\\\(?=[$.|*+(){^])/g,
    () => ESCAPE,
    ESCAPE + ESCAPE
  ],

  [
    // '\\\\' -> '\\'
    /\\\\/g,
    () => ESCAPE,
    ESCAPE + ESCAPE
  ],

  [
    // Every real bracket expression -- POSIX classes included -- has already
    //   been held aside by `extractBrackets`, so the only `[` left in the
    //   pattern is an escaped, literal one.

    // A backslash could only stand at the end of the range if it quoted the
    //   `]`, and `\]` is held aside long before this.
    /\\\[([^\]/]*?)($|\])/g,

    // '\\[bar]' -> '\\\\[bar]'
    (match, range, close) => `\\[${range}${close}`,
    '['
  ],

  // ending
  [
    // 'js' will not match 'js.'
    // 'ab' will not match 'abc'
    DIRECT,

    // WTF!
    // https://git-scm.com/docs/gitignore
    // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
    // which re-fixes #24, #38

    // > If there is a separator at the end of the pattern then the pattern
    // > will only match directories, otherwise the pattern can match both
    // > files and directories.

    // 'js*' will not match 'a.js'
    // 'js/' will not match 'a.js'
    // 'js' will match 'a.js' and 'a.js/'
    source => {
      const last = source[source.length - 1]

      // The pattern is empty, or ends in a pending marker `_make` owns --
      //   the trailing wildcard, or a trailing "/**". A trailing `*` that is
      //   not the marker is a literal star, which anchors like any other
      //   final character.
      if (!last || last === TRAILING_WILDCARD || last === TRAILING_DOUBLESTAR) {
        return source
      }

      return last === SLASH
        // foo/ will not match 'foo'
        ? `${source}$`
        // foo matches 'foo' and 'foo/'
        : `${source}(?=$|\\/$)`
    }
  ]
]

const REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\uE000$/
const MODE_IGNORE = 'regex'
const MODE_CHECK_IGNORE = 'checkRegex'
const UNDERSCORE = '_'

const replaceTrailingWildcard = (_, p1) => {
  const prefix = p1
    // '\^':
    // '/*' does not match EMPTY
    // '/*' does not match everything

    // '\\\/':
    // 'abc/*' does not match 'abc/'
    ? `${p1}[^/]+`

    // 'a*' matches 'a'
    // 'a*' matches 'aa'
    : '[^/]*'

  return `${prefix}(?=$|\\/$)`
}

const REGEX_REPLACE_TRAILING_DOUBLESTAR = /\uE001$/

// 'abc/**' matches everything under 'abc', but not 'abc/' itself (#21)
const replaceTrailingDoublestar = () => '.+(?=$|\\/$)'

const WILDCARD = '[^\\/]*'

// The fixed piece between the wildcard at `at` and the next wildcard of the
//   run: the tokens that separate them, joined as they appear in the source.
//   A run never holds two wildcards in a row, so there is always at least one
//   token.
const separatorAfter = (run, at) => {
  let separator = EMPTY

  for (let index = at + 1; index < run.length && !run[index].wildcard; index ++) {
    separator += run[index].single
  }

  return separator
}

// Where a run of non-slash wildcards is split by fixed pieces --
//   `[^/]*ab[^/]*cd...` -- the engine has many equivalent ways to lay the
//   input across the wildcards, and on input that does not match it works
//   through all of them, so the time grows with the number of wildcards
//   rather than the length of the path. Every wildcard but the last in such a
//   run can be pinned to stop where the piece after it begins, which leaves
//   one way to lay out the input and no rewinding, without changing which
//   paths match: the fixed pieces still bound the count, and the last
//   wildcard still absorbs the rest.
//
// A wildcard is pinned to the whole piece, never to the piece's first
//   character. The pin leaves no way back, so a wildcard that stopped at that
//   first character would hand over wherever the character happens to turn
//   up, including the places the rest of the piece cannot follow -- which is
//   how `f*o/*/*` came to miss `foo/b/c`, the first `o` of `foo` not being
//   the one the `o/` after it needs. Every token of a piece matches exactly
//   one character, so the first place the whole piece fits is the leftmost
//   place it can sit, and whatever is left over goes to the wildcards that
//   follow.
//
// The source is read one token at a time -- a wildcard, a single-character
//   piece (a literal, an escape, a class), or a parenthesised group or anchor
//   that ends the run -- so only a genuine wildcard is touched.
const pinWildcards = source => {
  if (source.indexOf(WILDCARD) < 0) {
    return source
  }

  const tokens = []
  const {length} = source
  let index = 0

  while (index < length) {
    const char = source[index]

    if (source.startsWith(WILDCARD, index)) {
      tokens.push({wildcard: true})
      index += WILDCARD.length
    } else if (char === '[') {
      let end = index + 1

      if (source[end] === '^') {
        end ++
      }

      if (source[end] === ']') {
        end ++
      }

      while (end < length && source[end] !== ']') {
        end += source[end] === ESCAPE
          ? 2
          : 1
      }

      end ++
      tokens.push({single: source.slice(index, end)})
      index = end
    } else if (char === ESCAPE) {
      tokens.push({single: source.slice(index, index + 2)})
      index += 2
    } else if (char === '(') {
      let depth = 0
      let end = index

      do {
        if (source[end] === ESCAPE) {
          end ++
        } else if (source[end] === '(') {
          depth ++
        } else if (source[end] === ')') {
          depth --
        }

        end ++
      } while (end < length && depth > 0)

      if ('*+?'.indexOf(source[end]) >= 0) {
        end ++
      }

      tokens.push({boundary: source.slice(index, end)})
      index = end
    } else if (char === '^' || char === '$') {
      tokens.push({boundary: char})
      index ++
    } else {
      tokens.push({single: char})
      index ++
    }
  }

  let out = EMPTY
  let run = []

  const flush = () => {
    let lastWildcard

    run.forEach((token, at) => {
      if (token.wildcard) {
        lastWildcard = at
      }
    })

    run.forEach((token, at) => {
      if (!token.wildcard) {
        out += token.single
        return
      }

      // Every wildcard but the last is pinned to the whole piece that
      //   follows it, for the reason set out above this function. The last
      //   one stays as it is and takes up the rest.
      out += at === lastWildcard
        ? WILDCARD
        : `(?:(?!${separatorAfter(run, at)})[^\\/])*`
    })

    run = []
  }

  tokens.forEach(token => {
    if (token.boundary === undefined) {
      run.push(token)
      return
    }

    flush()
    out += token.boundary
  })

  flush()

  return out
}

// @param {pattern}
const makeRegexPrefix = pattern => {
  // `/**` matches every path, as `**` does. The translation below only finds
  //   a globstar beside a slash it keeps, and the leading one is turned into
  //   an anchor, so `/**` would come out as `/*` and match one level only.
  //   Here rather than in `createRule`, so that `checkSourceOf`, which
  //   compiles `/**/` again without its trailing slash, gets it too.
  if (REGEX_ANCHORED_GLOBSTAR.test(pattern)) {
    pattern = '**'
  }

  const {source, sources} = extractBrackets(pattern)

  const replaced = REPLACERS.reduce(
    // A pass whose matcher finds nothing hands back the very string it was
    //   given, so asking first costs a search and saves a rewrite. Ten of the
    //   fifteen passes never fire for a typical .gitignore line, and between
    //   them they were 45% of this chain.
    (prev, [matcher, replacer, required]) => {
      if (matcher === DIRECT) {
        return replacer(prev, pattern)
      }

      if (required !== UNDEFINED && prev.indexOf(required) < 0) {
        return prev
      }

      // A pass whose matcher finds nothing hands back the very string it was
      //   given, so asking first costs a search and saves a rewrite.
      return matcher.test(prev)
        ? prev.replace(matcher, replacer.bind(pattern))
        : prev
    },
    source
  )

  // Most patterns hold no bracket expression at all, and then there is
  //   nothing to put back.
  return sources.length
    ? replaced.replace(
      REGEX_RESTORE_PLACEHOLDER,
      (match, index) => sources[index]
    )
    : replaced
}

// `checkRegex` tests a path with a trailing slash, 'abc/', the way
//   `git check-ignore` matches that literal string once the directory itself
//   is known not to be excluded (see `checkIgnore`): a trailing '/' of the
//   pattern is dropped, a basename pattern sees an empty basename, and only a
//   pattern whose last segment is a pending wildcard can match what is left
//   after the final slash -- 'abc/*' and 'abc/**' match 'abc/', and 'abc/**'
//   also matches 'abc/d/' (#77, #169).
const checkSourceOf = (body, prefix) => {
  if (body[body.length - 1] === SLASH) {
    prefix = makeRegexPrefix(body.slice(0, - 1))
  }

  const head = prefix.slice(0, - 1)
  const last = prefix[prefix.length - 1]

  return last === TRAILING_WILDCARD
    ? `${head}$`
    : last === TRAILING_DOUBLESTAR
      ? `${head}.*$`
      : NEVER_MATCH
}

// A trailing slash does not stop a pattern being basename-only: it restricts
//   the match to a directory, it does not let the pattern reach across one.
//   Everything else a pattern can hold -- a wildcard, a character class, an
//   escape -- stays inside a single path segment too, so a pattern with no
//   separator in it can only ever describe the last one.
const matchesBasename = body => {
  const index = body.indexOf(SLASH)

  return index < 0 || index === body.length - 1
}

// The last segment of a path, keeping a trailing slash, because a pattern that
//   ends in one matches only a directory.
// 'a/b/c.js' -> 'c.js';  'a/b/' -> 'b/';  'c.js' -> 'c.js' (no copy made)
const basenameOf = path => {
  const end = path.length - 1

  const index = path.lastIndexOf(
    SLASH,
    path[end] === SLASH
      ? end - 1
      : end
  )

  return index < 0
    ? path
    : path.slice(index + 1)
}

// The parent directory of a path, with its trailing separator, or EMPTY when
//   the path has none.
// 'a/b/c' -> 'a/b/';  'a/b/' -> 'a/';  'a' -> EMPTY;  'a/' -> EMPTY
//
// A path holding an empty segment has to be taken apart, because its
//   ancestors are not prefixes of it: the parent of 'a//b' is 'a/', not
//   'a//', and the parent of '/a/' is nothing at all. Both shapes reach here
//   -- 'a//b' is accepted outright, and `checkIgnore` does not put the path
//   it is given through the relative-path check.
//
// Every other path is a prefix of itself, and cutting one costs a fraction of
//   splitting it into an array and joining that back at every level: 73ns
//   against 207ns.
const parentOf = path => {
  if (
    path.charCodeAt(0) === SLASH_CODE
    || path.indexOf(DOUBLE_SLASH) >= 0
  ) {
    const slices = path.split(SLASH).filter(Boolean)

    slices.pop()

    return slices.length
      ? slices.join(SLASH) + SLASH
      : EMPTY
  }

  const end = path.length - 1

  // Look back from before a trailing separator, since that one belongs to the
  //   path itself.
  //
  // A negative place to start would be a trap here: `lastIndexOf` clamps one
  //   to 0 and searches there rather than reporting no match, so '/' would
  //   come back as its own parent and the walk would never end. It cannot
  //   happen -- that is the only path short enough to produce one, and the
  //   test above has already sent it the other way.
  const cut = path.lastIndexOf(
    SLASH,
    path.charCodeAt(end) === SLASH_CODE
      ? end - 1
      : end
  )

  return cut < 0
    ? EMPTY
    : path.slice(0, cut + 1)
}

const isString = subject => typeof subject === 'string'

// Blank lines and comments are told by `createRule`, once the pattern is
//   normalized.
const checkPattern = pattern => pattern
  && isString(pattern)
  && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern)

const splitPattern = pattern => pattern
.split(REGEX_SPLITALL_CRLF)
.filter(Boolean)

class IgnoreRule {
  constructor (
    pattern,
    mark,
    body,
    ignoreCase,
    negative,
    prefix
  ) {
    this.pattern = pattern
    this.mark = mark
    this.negative = negative

    define(this, 'body', body)
    define(this, 'ignoreCase', ignoreCase)
    define(this, 'regexPrefix', prefix)
  }

  // Worked out on first use and kept behind an own property, the way `regex`
  //   caches itself in `_regex`. Deciding it in the constructor instead would
  //   add a fourth `defineProperty` to every rule ever built, which cost 4% of
  //   every compile -- including the compiles of rules that are never matched
  //   against anything.
  get _basenameOnly () {
    return define(this, '_basenameOnly', matchesBasename(this.body))
  }

  get regex () {
    const key = UNDERSCORE + MODE_IGNORE

    if (this[key]) {
      return this[key]
    }

    return this._make(MODE_IGNORE, key)
  }

  get checkRegex () {
    const key = UNDERSCORE + MODE_CHECK_IGNORE

    if (this[key]) {
      return this[key]
    }

    return this._make(MODE_CHECK_IGNORE, key)
  }

  _make (mode, key) {
    const str = pinWildcards(
      mode === MODE_IGNORE
        ? this.regexPrefix
        .replace(REGEX_REPLACE_TRAILING_WILDCARD, replaceTrailingWildcard)
        .replace(REGEX_REPLACE_TRAILING_DOUBLESTAR, replaceTrailingDoublestar)
        : checkSourceOf(this.body, this.regexPrefix)
    )

    const regex = this.ignoreCase
      ? new RegExp(str, 'i')
      : new RegExp(str)

    return define(this, key, regex)
  }
}

const isLineEnd = char => char === '\r' || char === '\n'

// Drop a line terminator, which can remain when patterns are passed as an
//   array, and then the trailing spaces. Git trims spaces only, and a space
//   escaped by an odd run of backslashes stays, unescaped, as the last one.
// Scanned from the end: a regular expression can only try each start in
//   turn, which is quadratic over a long run of spaces or backslashes.
// 'a  ' -> 'a';  'a\ ' -> 'a ';  'a\\ ' -> 'a\\';  'a\t' -> 'a\t'
const trimEnd = body => {
  let end = body.length

  while (end && isLineEnd(body[end - 1])) {
    end --
  }

  const lineEnd = end

  while (end && body[end - 1] === SPACE) {
    end --
  }

  if (end === lineEnd) {
    return body.slice(0, end)
  }

  let backslashes = 0

  while (backslashes < end && body[end - backslashes - 1] === ESCAPE) {
    backslashes ++
  }

  return backslashes % 2
    ? body.slice(0, end - 1) + SPACE
    : body.slice(0, end)
}

const createRule = ({
  pattern,
  mark
}, ignoreCase) => {
  // Git drops a BOM before it reads the first line, so before anything else.
  let body = pattern[0] === BOM
    ? pattern.slice(1)
    : pattern

  // > A line starting with # serves as a comment.
  if (body[0] === '#') {
    return
  }

  let negative = false

  // > An optional prefix "!" which negates the pattern;
  if (body[0] === '!') {
    negative = true
    body = body.slice(1)
  }

  // Normalize the body before checking which slashes anchor the pattern.
  //   Otherwise `bar/ ` is mistaken for a pattern containing an inner slash.
  //   Only a body ending in a space or a line terminator has anything to trim.
  const last = body[body.length - 1]

  if (last === SPACE || last === '\r' || last === '\n') {
    body = trimEnd(body)
  }

  // > A blank line matches no files, so it can serve as a separator for
  // >   readability.
  // Nor does a lone "!", or anything else left empty here: an empty pattern
  //   would compile to a regex matching every path.
  if (!body) {
    return
  }

  body = body
  // > Put a backslash ("\") in front of the first "!" for patterns that
  // >   begin with a literal "!", for example, `"\!important!.txt"`.
  .replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, '!')
  // > Put a backslash ("\") in front of the first hash for patterns that
  // >   begin with a hash.
  .replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, '#')

  const regexPrefix = makeRegexPrefix(body)

  return new IgnoreRule(
    pattern,
    mark,
    body,
    ignoreCase,
    negative,
    regexPrefix
  )
}

class RuleManager {
  constructor (ignoreCase) {
    this._ignoreCase = ignoreCase
    this._rules = []

    // How many of the rules git would tag `EXC_FLAG_NODIR`.
    //
    // The scan uses it to decide, once for the whole set, whether handing
    //   those rules the basename is worth what it costs the others. The
    //   shortcut saves a full-path scan on every rule it applies to and costs
    //   a check on every rule it does not, so a set where almost nothing is
    //   basename-only comes out behind -- a 955 pattern set with 44 of them
    //   measured 19% slower with the shortcut always on.
    //
    // Deciding this by measurement rather than by meaning is safe: a
    //   basename-only pattern gives the very same answer against the whole
    //   path, it just takes longer to say so. The choice can only change how
    //   fast the scan runs, never what it returns.
    this._basenameCount = 0
  }

  _add (pattern) {
    // #32
    if (pattern && pattern[KEY_IGNORE]) {
      this._rules = this._rules.concat(pattern._rules._rules)
      this._basenameCount += pattern._rules._basenameCount
      this._added = true
      return
    }

    if (isString(pattern)) {
      pattern = {
        pattern
      }
    }

    const rule = checkPattern(pattern.pattern)
      && createRule(pattern, this._ignoreCase)

    if (rule) {
      this._added = true
      this._rules.push(rule)

      // Deliberately not `rule._basenameOnly`: reading that would materialise
      //   the rule's own copy, and the whole point of leaving it lazy is that
      //   a rule which is compiled and never matched never pays for it.
      if (matchesBasename(rule.body)) {
        this._basenameCount ++
      }
    }
  }

  // @param {Array<string> | string | Ignore} pattern
  add (pattern) {
    this._added = false

    makeArray(
      isString(pattern)
        ? splitPattern(pattern)
        : pattern
    ).forEach(this._add, this)

    if (this._added) {
      this._literalRules = UNDEFINED
    }

    return this._added
  }

  // Match the literal 'abc/' for `checkIgnore`, last rule wins. Only a rule
  //   ending in a wildcard can match it (see `checkSourceOf`), so the rest
  //   are left out once, rather than tested or compiled for every path.
  testLiteral (path) {
    const rules = this._literalRules || (
      this._literalRules = this._rules.filter(
        ({body}) => body[body.length - (
          body[body.length - 1] === SLASH ? 2 : 1
        )] === '*'
      )
    )

    let ignored = false
    let unignored = false
    let matchedRule

    for (let index = rules.length - 1; index >= 0; index --) {
      const rule = rules[index]

      if (rule.checkRegex.test(path)) {
        ignored = !rule.negative
        unignored = rule.negative
        matchedRule = rule.negative
          ? UNDEFINED
          : rule
        break
      }
    }

    const ret = {
      ignored,
      unignored
    }

    if (matchedRule) {
      ret.rule = matchedRule
    }

    return ret
  }

  // Test one single path without recursively checking parent directories
  //
  // - mode `string` either `MODE_IGNORE` or `MODE_CHECK_IGNORE`

  // @returns {TestResult}
  test (path, mode) {
    // Most of a .gitignore is patterns with no slash in them, and running
    //   those against the whole path makes the regular expression engine walk
    //   every directory name on the way to the only segment that could match.
    //   Handing them the basename instead is what git does, and it is where
    //   the time in a directory walk goes: the rule scan was two thirds of it.
    const rules = this._rules
    const {length} = rules

    const shortcut = this._basenameCount * 2 >= length

    const basename = shortcut
      ? basenameOf(path)
      : path

    // The last rule to match decides, as in git, and it is the rule
    //   `git check-ignore -v` reports, so the scan runs from the end and stops
    //   at the first match.
    // A plain loop rather than `forEach`, so that `path`, `basename` and
    //   `shortcut` are locals. As a callback they became closure variables,
    //   and reaching for one of those once per rule cost 10% of a scan over a
    //   large rule set -- more than the shortcut they were there to serve.
    for (let index = length - 1; index >= 0; index --) {
      const rule = rules[index]

      if (rule[mode].test(
        shortcut && rule._basenameOnly
          ? basename
          : path
      )) {
        const {negative} = rule

        const ret = {
          ignored: !negative,
          unignored: negative
        }

        if (!negative) {
          ret.rule = rule
        }

        return ret
      }
    }

    return {
      ignored: false,
      unignored: false
    }
  }
}

const throwError = (message, Ctor) => {
  throw new Ctor(message)
}

const checkPath = (path, originalPath, doThrow) => {
  if (!isString(path)) {
    return doThrow(
      `path must be a string, but got \`${originalPath}\``,
      TypeError
    )
  }

  // We don't know if we should ignore EMPTY, so throw
  if (!path) {
    return doThrow(`path must not be empty`, TypeError)
  }

  // Check if it is a relative path
  if (checkPath.isNotRelative(path)) {
    const r = '`path.relative()`d'
    return doThrow(
      `path should be a ${r} string, but got "${originalPath}"`,
      RangeError
    )
  }

  return true
}

// > pathname should be a `path.relative()`d one
//
// The same thing `REGEX_TEST_INVALID_PATH` says, spelled out: a path is not
//   relative if it begins with a separator, or with `./` or `../`, or is
//   nothing but `.` or `..`. Every match is decided by the first three
//   characters, and this runs on every path handed to the library -- where it
//   was 55% of a cached lookup, more than the cache lookup itself.
const isNotRelative = path => {
  const first = path.charCodeAt(0)

  if (first === SLASH_CODE) {
    return true
  }

  if (first !== DOT_CODE) {
    return false
  }

  // '.'
  if (path.length === 1) {
    return true
  }

  const second = path.charCodeAt(1)

  // './'
  if (second === SLASH_CODE) {
    return true
  }

  if (second !== DOT_CODE) {
    return false
  }

  // '..' or '../'
  return path.length === 2 || path.charCodeAt(2) === SLASH_CODE
}

checkPath.isNotRelative = isNotRelative

// On windows, the following function will be replaced
/* istanbul ignore next */
checkPath.convert = p => p


class Ignore {
  constructor ({
    ignorecase = true,
    ignoreCase = ignorecase,
    allowRelativePaths = false
  } = {}) {
    define(this, KEY_IGNORE, true)

    this._rules = new RuleManager(ignoreCase)
    this._strictPathCheck = !allowRelativePaths
    this._initCache()
  }

  _initCache () {
    // A cache for the result of `.ignores()`
    this._ignoreCache = Object.create(null)

    // A cache for the result of `.test()`
    this._testCache = Object.create(null)
  }

  add (pattern) {
    if (this._rules.add(pattern)) {
      // Some rules have just added to the ignore,
      //   making the behavior changed,
      //   so we need to re-initialize the result cache
      this._initCache()
    }

    return this
  }

  // legacy
  addPattern (pattern) {
    return this.add(pattern)
  }

  // @returns {TestResult}
  _test (originalPath, cache) {
    const path = originalPath
      // Supports nullable path
      && checkPath.convert(originalPath)

    checkPath(
      path,
      originalPath,
      this._strictPathCheck
        ? throwError
        : RETURN_FALSE
    )

    return this._t(path, cache)
  }

  checkIgnore (path) {
    // If the path doest not end with a slash, `.ignores()` is much equivalent
    //   to `git check-ignore`
    if (path.charCodeAt(path.length - 1) !== SLASH_CODE) {
      return this.test(path)
    }

    // Like `git check-ignore`: a directory excluded by itself or by an
    //   ancestor settles it, and only then is the literal 'abc/' matched
    //   against the rules (see `checkSourceOf`).
    const dir = this._t(path, this._testCache)

    if (dir.ignored) {
      return dir
    }

    const literal = this._rules.testLiteral(path)

    return literal.ignored || literal.unignored
      ? literal
      : dir
  }

  _t (
    // The path to be tested
    path,

    // The cache for the result of a certain checking
    cache
  ) {
    if (path in cache) {
      return cache[path]
    }

    const parentPath = parentOf(path)

    // If the path contains a parent directory, check the parent first
    const parent = parentPath
      ? this._t(parentPath, cache)
      : UNDEFINED

    return cache[path] = parent && parent.ignored
      // > It is not possible to re-include a file if a parent directory of
      // >   that file is excluded.
      ? parent
      : this._rules.test(path, MODE_IGNORE)
  }

  ignores (path) {
    return this._test(path, this._ignoreCache).ignored
  }

  createFilter () {
    return path => !this.ignores(path)
  }

  filter (paths) {
    return makeArray(paths).filter(this.createFilter())
  }

  // @returns {TestResult}
  test (path) {
    return this._test(path, this._testCache)
  }
}

const factory = options => new Ignore(options)

const isPathValid = path =>
  checkPath(path && checkPath.convert(path), path, RETURN_FALSE)

/* istanbul ignore next */
const setupWindows = () => {
  /* eslint no-control-regex: "off" */
  const makePosix = str => /^\\\\\?\\/.test(str)
  || /["<>|\u0000-\u001F]+/u.test(str)
    ? str
    : str.replace(/\\/g, '/')

  checkPath.convert = makePosix

  // 'C:\\foo'     <- 'C:\\foo' has been converted to 'C:/'
  // 'd:\\foo'
  const REGEX_TEST_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i
  checkPath.isNotRelative = path =>
    REGEX_TEST_WINDOWS_PATH_ABSOLUTE.test(path)
    || isNotRelative(path)
}


// Windows
// --------------------------------------------------------------
/* istanbul ignore next */
if (
  // Detect `process` so that it can run in browsers.
  typeof process !== 'undefined'
  && process.platform === 'win32'
) {
  setupWindows()
}

// COMMONJS_EXPORTS ////////////////////////////////////////////////////////////

module.exports = factory

// Although it is an anti-pattern,
//   it is still widely misused by a lot of libraries in github
// Ref: https://github.com/search?q=ignore.default%28%29&type=code
factory.default = factory

module.exports.isPathValid = isPathValid

// For testing purposes
define(module.exports, Symbol.for('setupWindows'), setupWindows)


/***/ }),

/***/ 793:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

/**
 * Conversa com a API pública v1 da RTCloud.
 *
 * Usa node:http/https direto (sem fetch) por um motivo prático: o commit
 * pode levar até 10 minutos do lado do servidor, e o fetch do Node desiste
 * de esperar o cabeçalho da resposta em 5 minutos sem dar como mudar isso.
 *
 * Envelope da API (o mesmo em todas as rotas):
 *   sucesso → { "status": "success", "response": … }
 *   erro    → { "status": "error", "code": "NOT_FOUND", "message": "…" }
 * Durante uma atualização da própria RTCloud a resposta é 503 com o
 * cabeçalho X-RTCloud-Atualizando e Retry-After — aí a Action espera e tenta
 * de novo (até 20 min), em vez de falhar o job.
 */
const http = __nccwpck_require__(67);
const https = __nccwpck_require__(708);
const crypto = __nccwpck_require__(598);
const { ErroDaAction } = __nccwpck_require__(474);
const { version: VERSAO } = __nccwpck_require__(330);

const PRAZO_COMMIT_MS = 12 * 60 * 1000;
const PRAZO_ACAO_MS = 2 * 60 * 1000;
const ESPERA_MAX_ATUALIZACAO_MS = 20 * 60 * 1000;
const ESPERA_MAX_LIMITE_MS = 5 * 60 * 1000;
const MAX_TENTATIVAS_REDE = 3;
const MAX_TENTATIVAS_INSTAVEL = 3;
const MAX_TENTATIVAS_CONFLITO = 15;
const ESPERA_CONFLITO_MS = 20 * 1000;

const ERROS_DE_REDE = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  'ENOTFOUND', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_SOCKET', 'PRAZO_ESGOTADO',
]);

const esperarDeVerdade = (ms) => new Promise((r) => setTimeout(r, ms));

/** Um pedido HTTP. Devolve status, cabeçalhos e o texto (até 2 MB). */
function pedir({ url, metodo = 'GET', cabecalhos = {}, corpo = null, prazoMs = PRAZO_ACAO_MS }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'http:' ? http : https;
    let terminou = false;
    const fim = (fn, v) => {
      if (terminou) return;
      terminou = true;
      clearTimeout(relogio);
      fn(v);
    };
    const req = mod.request(
      u,
      {
        method: metodo,
        headers: { ...cabecalhos, 'Content-Length': corpo ? corpo.length : 0 },
      },
      (res) => {
        const partes = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total <= 2 * 1024 * 1024) partes.push(c);
        });
        res.on('end', () =>
          fim(resolve, { status: res.statusCode || 0, cabecalhos: res.headers, texto: Buffer.concat(partes).toString('utf8') })
        );
        res.on('error', (e) => fim(reject, e));
      }
    );
    const relogio = setTimeout(() => {
      const e = new Error(`sem resposta em ${Math.round(prazoMs / 1000)} s`);
      e.code = 'PRAZO_ESGOTADO';
      req.destroy(e);
    }, prazoMs);
    req.on('error', (e) => fim(reject, e));
    req.end(corpo || undefined);
  });
}

function cabecalhosComuns(chave) {
  return {
    Authorization: `Bearer ${chave}`,
    Accept: 'application/json',
    'User-Agent': `rtcloud-deploy-action/${VERSAO}`,
  };
}

/** Corpo multipart com o .zip no campo "file" — o formato que a rota de commit lê. */
function corpoMultipart(zip, nome = 'projeto.zip') {
  const fronteira = `----rtcloud${crypto.randomBytes(12).toString('hex')}`;
  const cabeca = Buffer.from(
    `--${fronteira}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${nome}"\r\n` +
      'Content-Type: application/zip\r\n\r\n',
    'utf8'
  );
  const pe = Buffer.from(`\r\n--${fronteira}--\r\n`, 'utf8');
  return { tipo: `multipart/form-data; boundary=${fronteira}`, corpo: Buffer.concat([cabeca, zip, pe]) };
}

function interpretar(r) {
  let json = null;
  try {
    json = JSON.parse(r.texto);
  } catch {
    json = null;
  }
  const atualizando =
    r.status === 503 && (r.cabecalhos['x-rtcloud-atualizando'] !== undefined || (json && json.atualizando === true));
  if (r.status >= 200 && r.status < 300 && json && json.status === 'success') {
    return { ok: true, status: r.status, dados: json.response, cabecalhos: r.cabecalhos };
  }
  return {
    ok: false,
    status: r.status,
    codigo: (json && typeof json.code === 'string' && json.code) || (atualizando ? 'UPDATING' : ''),
    mensagem: (json && (json.message || json.error)) || '',
    atualizando,
    semEnvelope: !json,
    cabecalhos: r.cabecalhos,
  };
}

function segundosDeRetryAfter(cab) {
  const v = cab && cab['retry-after'];
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const data = Date.parse(v);
  return Number.isFinite(data) ? Math.max(0, Math.ceil((data - Date.now()) / 1000)) : null;
}

function segundosDoLimite(r) {
  const ra = segundosDeRetryAfter(r.cabecalhos);
  if (ra !== null) return ra;
  const m = /(\d+)\s*s\b/.exec(r.mensagem || '');
  if (m) return Number(m[1]);
  const m2 = /(\d+)\s*min/.exec(r.mensagem || '');
  if (m2) return Number(m2[1]) * 60;
  const reset = Number(r.cabecalhos && r.cabecalhos['x-ratelimit-reset']);
  if (Number.isFinite(reset) && reset > 0) return Math.max(1, Math.ceil(reset - Date.now() / 1000));
  return 60;
}

/** Quanto esperar antes de tentar de novo — ou null para desistir. */
function planoDeEspera(r, estado) {
  if (r.atualizando) {
    const seg = Math.min(120, Math.max(1, segundosDeRetryAfter(r.cabecalhos) ?? 30));
    if (estado.esperouAtualizacao + seg * 1000 > ESPERA_MAX_ATUALIZACAO_MS) return null;
    estado.esperouAtualizacao += seg * 1000;
    return { ms: seg * 1000, motivo: 'a RTCloud está publicando uma atualização (as aplicações seguem no ar)' };
  }
  if (r.status === 429) {
    const seg = segundosDoLimite(r);
    if (seg * 1000 > ESPERA_MAX_LIMITE_MS) return null;
    return { ms: Math.max(1, seg) * 1000, motivo: 'limite de chamadas da chave' };
  }
  if (r.status === 409 && estado.conflito < MAX_TENTATIVAS_CONFLITO) {
    estado.conflito++;
    return { ms: ESPERA_CONFLITO_MS, motivo: 'já existe um commit em andamento nesta aplicação' };
  }
  if ([500, 502, 503, 504].includes(r.status) && estado.instavel < MAX_TENTATIVAS_INSTAVEL) {
    estado.instavel++;
    return { ms: 15_000 * estado.instavel, motivo: `a plataforma respondeu ${r.status}` };
  }
  return null;
}

const DICAS = {
  401: 'A chave está errada ou foi revogada. Gere outra em menu da conta → Chaves de API e atualize o secret.',
  403: 'Use uma chave com acesso total e confira se o seu papel pode publicar versão (dono, Administrador ou Desenvolvedor da equipe) e se o plano está ativo.',
  404: 'Confira o "app-id": vale o id que aparece no painel ou o nome exato da aplicação. A chave precisa ser da conta dona ou de alguém da equipe dela.',
  400: 'Confira o pacote: o arquivo principal configurado na aplicação precisa estar no .zip.',
  409: 'Outro commit desta aplicação não terminou a tempo. Use "concurrency" no workflow para um deploy por vez.',
  413: 'Deixe arquivos pesados (mídia, bancos, builds antigos) de fora com um .rtcloudignore na raiz.',
  429: 'O limite de commit é de 6 a cada 10 minutos por chave. Use "concurrency" no workflow ou espere alguns minutos.',
  500: 'A RTCloud não conseguiu concluir agora. Rode o job de novo em alguns minutos; a situação da plataforma fica em status.rtcloud.com.br.',
};

function erroDaResposta(r, rotulo) {
  if (r.atualizando) {
    return new ErroDaAction(`${rotulo}: a RTCloud segue publicando uma atualização depois de 20 minutos de espera.`, {
      dica: 'Rode o job de novo daqui a pouco. As aplicações continuam no ar enquanto isso.',
      http: 503,
      codigo: 'UPDATING',
    });
  }
  const base = r.mensagem || (r.semEnvelope ? 'resposta inesperada do servidor' : 'erro sem mensagem');
  const dica =
    r.status === 403 && /leitura/i.test(r.mensagem)
      ? 'Esta chave é só de leitura. Gere uma chave com acesso total para publicar.'
      : DICAS[r.status] || (r.status >= 500 ? DICAS[500] : '');
  return new ErroDaAction(`${rotulo}: ${base} (HTTP ${r.status}${r.codigo ? ` ${r.codigo}` : ''}).`, {
    dica,
    http: r.status,
    codigo: r.codigo,
  });
}

function erroDeRede(e, rotulo) {
  return new ErroDaAction(`${rotulo}: falha de conexão (${e.code || e.message}).`, {
    dica: e.code === 'ENOTFOUND' ? 'Confira a "api-url" (ou deixe em branco).' : DICAS[500],
    codigo: e.code || 'NETWORK',
  });
}

/**
 * Faz o pedido, esperando e tentando de novo quando faz sentido.
 * @param {() => Promise<{status:number,cabecalhos:object,texto:string}>} fazer
 * @param {{ rotulo: string, esperar?: (ms:number)=>Promise<void>, log?: (m:string)=>void }} opcoes
 */
async function comNovasTentativas(fazer, { rotulo, esperar = esperarDeVerdade, log = () => {} }) {
  const estado = { tentativas: 0, rede: 0, conflito: 0, instavel: 0, esperouAtualizacao: 0 };
  for (;;) {
    estado.tentativas++;
    let r;
    try {
      r = interpretar(await fazer());
    } catch (e) {
      if (!ERROS_DE_REDE.has(e.code) || estado.rede >= MAX_TENTATIVAS_REDE) throw erroDeRede(e, rotulo);
      estado.rede++;
      const ms = 15_000 * estado.rede;
      log(`${rotulo}: falha de conexão (${e.code}). Nova tentativa em ${ms / 1000} s.`);
      await esperar(ms);
      continue;
    }
    if (r.ok) return { dados: r.dados, tentativas: estado.tentativas, cabecalhos: r.cabecalhos };
    const plano = planoDeEspera(r, estado);
    if (!plano) throw erroDaResposta(r, rotulo);
    log(`${rotulo}: ${plano.motivo}. Nova tentativa em ${Math.round(plano.ms / 1000)} s.`);
    await esperar(plano.ms);
  }
}

function caminhoDaApp(api, app, sufixo = '') {
  return `${api}/apps/${encodeURIComponent(app)}${sufixo}`;
}

/** GET /apps/{id} — confere chave e aplicação antes de montar e subir o pacote. */
async function consultarAplicacao({ api, chave, app, esperar, log }) {
  const r = await comNovasTentativas(
    () => pedir({ url: caminhoDaApp(api, app), cabecalhos: cabecalhosComuns(chave) }),
    { rotulo: 'Consulta da aplicação', esperar, log }
  );
  const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
  return {
    id: String(d.id || app),
    nome: String(d.name || app),
    tipo: d.type || null,
    url: typeof d.url === 'string' && /^https?:\/\//.test(d.url) ? d.url : null,
    principal: typeof d.main === 'string' ? d.main : null,
    github: d.github && d.github.repo ? { repo: String(d.github.repo), branch: d.github.branch || null } : null,
    suspensa: Boolean(d.suspended),
  };
}

/** POST /apps/{id}/commit — publica o .zip. */
async function publicarCommit({ api, chave, app, zip, esperar, log }) {
  const { tipo, corpo } = corpoMultipart(zip);
  const r = await comNovasTentativas(
    () =>
      pedir({
        url: caminhoDaApp(api, app, '/commit'),
        metodo: 'POST',
        cabecalhos: { ...cabecalhosComuns(chave), 'Content-Type': tipo },
        corpo,
        prazoMs: PRAZO_COMMIT_MS,
      }),
    { rotulo: 'Commit', esperar, log }
  );
  const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
  return {
    id: String(d.id || app),
    online: d.online === true,
    variaveisNovas: Number.isFinite(Number(d.envAdded)) ? Number(d.envAdded) : 0,
    mensagem: typeof d.message === 'string' ? d.message : '',
    tentativas: r.tentativas,
  };
}

/** POST /apps/{id}/restart — reinicia recarregando as variáveis de ambiente. */
async function reiniciarAplicacao({ api, chave, app, esperar, log }) {
  const r = await comNovasTentativas(
    () => pedir({ url: caminhoDaApp(api, app, '/restart'), metodo: 'POST', cabecalhos: cabecalhosComuns(chave) }),
    { rotulo: 'Reinício', esperar, log }
  );
  const d = r.dados && typeof r.dados === 'object' ? r.dados : {};
  return { mensagem: typeof d.message === 'string' ? d.message : '', iniciando: d.starting === true };
}

module.exports = {
  pedir,
  interpretar,
  comNovasTentativas,
  consultarAplicacao,
  publicarCommit,
  reiniciarAplicacao,
  corpoMultipart,
};


/***/ }),

/***/ 273:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

/**
 * Lê e confere as entradas do `with:` antes de qualquer trabalho.
 *
 * Tudo que dá para saber errado sem rede (chave no formato errado, pasta que
 * não existe, valor de `restart` inválido) falha aqui, com a correção escrita
 * — melhor do que empacotar 80 MB para descobrir no fim.
 */
const fs = __nccwpck_require__(24);
const path = __nccwpck_require__(760);
const { ErroDaAction, lerEntrada } = __nccwpck_require__(474);

const API_PADRAO = 'https://rtcloud.com.br/api/v1';
const MODOS_DE_REINICIO = { auto: 'auto', true: 'true', false: 'false', sim: 'true', nao: 'false', 'não': 'false' };

function lerChave(ambiente) {
  const chave = lerEntrada('api-key', ambiente);
  if (!chave) {
    throw new ErroDaAction('A entrada "api-key" é obrigatória.', {
      dica: 'Gere uma chave com acesso total no painel (menu da conta → Chaves de API), salve como secret RTCLOUD_API_KEY e use api-key: ${{ secrets.RTCLOUD_API_KEY }}.',
    });
  }
  if (/^rtm_/.test(chave)) {
    throw new ErroDaAction('Essa chave começa com rtm_, que é do servidor MCP (assistentes de IA).', {
      dica: 'Para a Action, gere uma chave de API (começa com rtc_) com acesso total em menu da conta → Chaves de API.',
    });
  }
  if (!/^rtc_\S{8,}$/.test(chave)) {
    throw new ErroDaAction('A "api-key" não parece uma chave da RTCloud (deve começar com rtc_).', {
      dica: 'Copie a chave inteira, sem espaços nem aspas, e guarde num secret do repositório.',
    });
  }
  return chave;
}

function lerAplicacao(ambiente) {
  const app = lerEntrada('app-id', ambiente);
  if (!app) {
    throw new ErroDaAction('A entrada "app-id" é obrigatória.', {
      dica: 'Use o id da aplicação (aparece no painel e em GET /apps) ou o nome exato dela.',
    });
  }
  if (app.length > 80 || /[\r\n\t]/.test(app)) {
    throw new ErroDaAction('O "app-id" tem mais de 80 caracteres ou quebra de linha.', {
      dica: 'Use o id da aplicação (aparece no painel) ou o nome exato dela.',
    });
  }
  return app;
}

function lerPasta(ambiente) {
  const base = ambiente.GITHUB_WORKSPACE || process.cwd();
  const informada = lerEntrada('path', ambiente) || '.';
  const pasta = path.resolve(base, informada);
  let info;
  try {
    info = fs.statSync(pasta);
  } catch {
    throw new ErroDaAction(`A pasta "${informada}" não existe no runner.`, {
      dica: 'Confira se o passo actions/checkout veio antes e se o caminho é relativo à raiz do repositório.',
    });
  }
  if (!info.isDirectory()) {
    throw new ErroDaAction(`"${informada}" é um arquivo, não uma pasta.`, {
      dica: 'Aponte "path" para a pasta do projeto — a Action monta o .zip sozinha.',
    });
  }
  return { pasta, informada };
}

function lerReinicio(ambiente) {
  const bruto = (lerEntrada('restart', ambiente) || 'auto').toLowerCase();
  const modo = MODOS_DE_REINICIO[bruto];
  if (!modo) {
    throw new ErroDaAction(`Valor inválido em "restart": ${bruto}.`, {
      dica: 'Use auto (padrão), true ou false.',
    });
  }
  return modo;
}

function lerApi(ambiente) {
  const bruto = lerEntrada('api-url', ambiente) || API_PADRAO;
  let url;
  try {
    url = new URL(bruto);
  } catch {
    throw new ErroDaAction(`"api-url" inválida: ${bruto}.`, { dica: `Deixe em branco para usar ${API_PADRAO}.` });
  }
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    /* a chave viaja no cabeçalho: http puro só para teste na própria máquina */
    throw new ErroDaAction('"api-url" precisa ser https.', { dica: `Deixe em branco para usar ${API_PADRAO}.` });
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ErroDaAction('"api-url" não pode ter usuário, senha, ?parâmetros nem #âncora.', {
      dica: `Deixe em branco para usar ${API_PADRAO}.`,
    });
  }
  return url.toString().replace(/\/+$/, '');
}

/**
 * @returns {{ chave: string, app: string, pasta: string, pastaInformada: string, reinicio: 'auto'|'true'|'false', api: string }}
 */
function lerEntradas(ambiente = process.env) {
  const chave = lerChave(ambiente);
  const app = lerAplicacao(ambiente);
  const { pasta, informada } = lerPasta(ambiente);
  const reinicio = lerReinicio(ambiente);
  const api = lerApi(ambiente);
  return { chave, app, pasta, pastaInformada: informada, reinicio, api };
}

module.exports = { lerEntradas, API_PADRAO };


/***/ }),

/***/ 474:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

/**
 * O pouco que a Action precisa do runner do GitHub, sem dependência externa.
 *
 * Entradas chegam como variáveis INPUT_*; saídas e o resumo do job são
 * arquivos cujo caminho o runner passa em GITHUB_OUTPUT e
 * GITHUB_STEP_SUMMARY; o resto (máscara, aviso, erro, grupo) são comandos
 * "::nome::" escritos na saída padrão. É tudo documentado pelo GitHub em
 * "Workflow commands for GitHub Actions".
 */
const fs = __nccwpck_require__(24);
const os = __nccwpck_require__(161);
const crypto = __nccwpck_require__(598);

/** Erro já explicado para a pessoa — a mensagem vai direto para o log e o resumo. */
class ErroDaAction extends Error {
  /**
   * @param {string} mensagem
   * @param {{ dica?: string, http?: number, codigo?: string }} [extra]
   */
  constructor(mensagem, extra = {}) {
    super(mensagem);
    this.name = 'ErroDaAction';
    this.dica = extra.dica || '';
    this.http = extra.http || 0;
    this.codigo = extra.codigo || '';
  }
}

function escaparDado(s) {
  return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escaparPropriedade(s) {
  return escaparDado(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function comando(nome, mensagem = '', props = {}) {
  const lista = Object.entries(props)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${escaparPropriedade(v)}`)
    .join(',');
  process.stdout.write(`::${nome}${lista ? ` ${lista}` : ''}::${escaparDado(mensagem)}${os.EOL}`);
}

/** Lê uma entrada do `with:`. O GitHub manda em INPUT_<NOME EM MAIÚSCULAS>. */
function lerEntrada(nome, ambiente = process.env) {
  const chave = `INPUT_${nome.replace(/ /g, '_').toUpperCase()}`;
  return String(ambiente[chave] ?? '').trim();
}

/** Esconde um segredo de todo log seguinte (vira ***). */
function mascarar(segredo) {
  const s = String(segredo || '').trim();
  if (s) comando('add-mask', s);
}

function info(mensagem) {
  process.stdout.write(`${mensagem}${os.EOL}`);
}

function aviso(mensagem, titulo) {
  comando('warning', mensagem, { title: titulo });
}

function erro(mensagem, titulo) {
  comando('error', mensagem, { title: titulo });
}

function nota(mensagem, titulo) {
  comando('notice', mensagem, { title: titulo });
}

async function emGrupo(titulo, fn) {
  comando('group', titulo);
  try {
    return await fn();
  } finally {
    comando('endgroup');
  }
}

/**
 * Imprime texto que não é nosso (nomes de arquivo do projeto) sem deixar
 * uma linha como "::error::…" virar comando do runner.
 */
function semComandos(fn) {
  const ficha = `rtcloud-${crypto.randomUUID()}`;
  comando('stop-commands', ficha);
  try {
    return fn();
  } finally {
    process.stdout.write(`::${ficha}::${os.EOL}`);
  }
}

/** Saída do passo (`steps.<id>.outputs.<nome>`), no formato com delimitador. */
function definirSaida(nome, valor, ambiente = process.env) {
  const arquivo = ambiente.GITHUB_OUTPUT;
  const texto = valor === undefined || valor === null ? '' : String(valor);
  if (!arquivo) return false;
  const delimitador = `rtcloud_${crypto.randomUUID()}`;
  fs.appendFileSync(arquivo, `${nome}<<${delimitador}${os.EOL}${texto}${os.EOL}${delimitador}${os.EOL}`, 'utf8');
  return true;
}

/** Acrescenta Markdown ao resumo do job (a página do run no GitHub). */
function escreverResumo(markdown, ambiente = process.env) {
  const arquivo = ambiente.GITHUB_STEP_SUMMARY;
  if (!arquivo) return false;
  fs.appendFileSync(arquivo, `${markdown}${os.EOL}`, 'utf8');
  return true;
}

module.exports = {
  ErroDaAction,
  lerEntrada,
  mascarar,
  info,
  aviso,
  erro,
  nota,
  emGrupo,
  semComandos,
  definirSaida,
  escreverResumo,
  escaparDado,
};


/***/ }),

/***/ 936:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

/**
 * O passo inteiro: confere a chave e a aplicação, monta o .zip, publica pelo
 * Commit da API v1, reinicia se precisar e escreve o resumo do job.
 *
 * O resumo sai sempre — em falha também, com o motivo e o que fazer — e as
 * saídas do passo recebem o que se sabe até o ponto em que parou.
 */
const fs = __nccwpck_require__(24);
const os = __nccwpck_require__(161);
const path = __nccwpck_require__(760);
const crypto = __nccwpck_require__(598);
const gh = __nccwpck_require__(474);
const { lerEntradas } = __nccwpck_require__(273);
const { montarPacote, formatarBytes } = __nccwpck_require__(787);
const { consultarAplicacao, publicarCommit, reiniciarAplicacao } = __nccwpck_require__(793);
const { montarResumo, enderecoDoPainel } = __nccwpck_require__(580);

const LISTAR_ATE = 300;

function avisoDoGithub(aplicacao) {
  if (!aplicacao || !aplicacao.github) return null;
  const g = aplicacao.github;
  return (
    `Esta aplicação também está com o Deploy automático pelo GitHub ligado (${g.repo}${g.branch ? `, branch ${g.branch}` : ''}). ` +
    'Cada push pode publicar duas vezes: desligue um dos dois no painel, na aba Commit da aplicação.'
  );
}

function avisoDoPrincipal(aplicacao, pacote) {
  const principal = aplicacao && aplicacao.principal ? aplicacao.principal.replace(/^\.?\/+/, '') : '';
  if (!principal || !pacote || pacote.caminhos.includes(principal)) return null;
  return (
    `O arquivo principal configurado na aplicação (${principal}) não está no pacote. ` +
    'Se ele é gerado no build, rode o build antes deste passo e confira o .gitignore / .rtcloudignore.'
  );
}

/**
 * @param {{ ambiente?: NodeJS.ProcessEnv, esperar?: (ms:number)=>Promise<void> }} [opcoes]
 */
async function executar(opcoes = {}) {
  const ambiente = opcoes.ambiente || process.env;
  const esperar = opcoes.esperar;
  const inicio = Date.now();
  const avisos = [];
  const estado = { aplicacao: null, pacote: null, commit: null, reinicio: null };
  let entradas = null;
  let etapa = 'Leitura das entradas';
  let falha = null;
  let destino = null;

  /* antes de qualquer outra coisa: a chave nunca aparece no log */
  gh.mascarar(gh.lerEntrada('api-key', ambiente));
  const appInformada = gh.lerEntrada('app-id', ambiente);
  const log = (m) => gh.info(m);
  const avisar = (m) => {
    avisos.push(m);
    gh.aviso(m, 'Deploy na RTCloud');
  };

  try {
    entradas = lerEntradas(ambiente);
    const { api, chave } = entradas;

    etapa = 'Consulta da aplicação';
    estado.aplicacao = await gh.emGrupo('Conferindo a chave e a aplicação', async () => {
      const a = await consultarAplicacao({ api, chave, app: entradas.app, esperar, log });
      log(`Aplicação: ${a.nome} (${a.id})${a.tipo ? ` · ${a.tipo}` : ''}`);
      return a;
    });
    const avisoGit = avisoDoGithub(estado.aplicacao);
    if (avisoGit) avisar(avisoGit);

    etapa = 'Montagem do pacote';
    destino = path.join(ambiente.RUNNER_TEMP || os.tmpdir(), `rtcloud-${crypto.randomUUID()}.zip`);
    estado.pacote = await gh.emGrupo('Montando o pacote', async () => {
      const p = montarPacote(entradas.pasta, destino);
      log(`Pasta: ${entradas.pastaInformada}`);
      log(`Regras: ${p.regras || 'nenhum arquivo de ignorar (ficam de fora só .git e node_modules)'}`);
      log(`${p.total} arquivos · ${formatarBytes(p.bytesOriginais)} → ${formatarBytes(p.bytes)} no .zip · ${p.ignorados} itens ignorados`);
      gh.semComandos(() => {
        for (const c of p.caminhos.slice(0, LISTAR_ATE)) log(`  ${c}`);
        if (p.caminhos.length > LISTAR_ATE) log(`  … e mais ${p.caminhos.length - LISTAR_ATE}`);
      });
      return p;
    });
    if (estado.pacote.links.length) {
      const exemplos = estado.pacote.links.slice(0, 5).join(', ');
      avisar(
        `${estado.pacote.links.length} link(s) simbólico(s) ficaram de fora do pacote (${exemplos}${estado.pacote.links.length > 5 ? ', …' : ''}). ` +
          'Copie o conteúdo para dentro do projeto se ele precisa subir.'
      );
    }
    const avisoPrincipal = avisoDoPrincipal(estado.aplicacao, estado.pacote);
    if (avisoPrincipal) avisar(avisoPrincipal);

    etapa = 'Commit';
    estado.commit = await gh.emGrupo('Enviando para a RTCloud', async () => {
      const zip = fs.readFileSync(destino);
      const c = await publicarCommit({ api, chave, app: estado.aplicacao.id, zip, esperar, log });
      log(c.mensagem || 'Commit aplicado.');
      if (c.variaveisNovas > 0) log(`Variáveis novas vindas do .env: ${c.variaveisNovas}`);
      return c;
    });

    etapa = 'Reinício';
    const pedir = entradas.reinicio === 'true' || (entradas.reinicio === 'auto' && estado.commit.variaveisNovas > 0);
    if (!pedir) {
      estado.reinicio = { situacao: entradas.reinicio === 'false' ? 'desligado' : 'dispensado' };
    } else {
      try {
        await gh.emGrupo('Reiniciando a aplicação', async () => {
          const r = await reiniciarAplicacao({ api, chave, app: estado.aplicacao.id, esperar, log });
          log(r.mensagem || 'Reinício pedido.');
        });
        estado.reinicio = {
          situacao: 'feito',
          motivo: entradas.reinicio === 'true' ? 'pedido' : 'variaveis',
          variaveis: estado.commit.variaveisNovas,
        };
      } catch (e) {
        estado.reinicio = { situacao: 'falhou', erro: e.message };
        if (entradas.reinicio === 'true') throw e;
        avisar(`A versão foi publicada, mas o reinício para carregar as variáveis novas falhou: ${e.message}`);
      }
    }
  } catch (e) {
    const conhecido = e instanceof gh.ErroDaAction;
    falha = {
      mensagem: conhecido ? e.message : `Erro inesperado: ${e && e.message ? e.message : e}`,
      dica: conhecido ? e.dica : 'Rode o job de novo. Se continuar, abra um chamado no painel com o link deste run.',
      etapa,
    };
    if (!conhecido && e && e.stack) {
      await gh.emGrupo('Detalhes técnicos do erro', async () => gh.semComandos(() => log(e.stack)));
    }
  } finally {
    if (destino) fs.rmSync(destino, { force: true });
  }

  const ms = Date.now() - inicio;
  const appId = estado.aplicacao ? estado.aplicacao.id : '';
  const painel = appId && entradas ? enderecoDoPainel(entradas.api, appId) : '';

  gh.definirSaida('app-id', appId, ambiente);
  gh.definirSaida('online', estado.commit ? String(estado.commit.online) : 'false', ambiente);
  gh.definirSaida('env-added', estado.commit ? String(estado.commit.variaveisNovas) : '0', ambiente);
  gh.definirSaida('restarted', estado.reinicio && estado.reinicio.situacao === 'feito' ? 'true' : 'false', ambiente);
  gh.definirSaida('package-size', estado.pacote ? String(estado.pacote.bytes) : '0', ambiente);
  gh.definirSaida('files', estado.pacote ? String(estado.pacote.total) : '0', ambiente);
  gh.definirSaida('dashboard-url', painel || '', ambiente);
  gh.definirSaida('message', falha ? falha.mensagem : (estado.commit && estado.commit.mensagem) || 'Commit aplicado.', ambiente);

  try {
    gh.escreverResumo(
      montarResumo(
        {
          api: entradas ? entradas.api : '',
          aplicacao: estado.aplicacao,
          appInformada,
          pacote: estado.pacote,
          /* com restart: true, um reinício que falhou ainda mostra o commit que entrou */
          commit: estado.commit,
          reinicio: estado.reinicio,
          ms,
          falha,
          avisos,
        },
        ambiente
      ),
      ambiente
    );
  } catch (e) {
    gh.aviso(`Não foi possível escrever o resumo do job: ${e.message}`);
  }

  if (falha) {
    gh.erro(falha.dica ? `${falha.mensagem} ${falha.dica}` : falha.mensagem, 'Deploy na RTCloud');
    process.exitCode = 1;
    return { ok: false, falha, ...estado };
  }
  gh.nota(
    estado.commit.online ? 'Nova versão publicada e aplicação no ar.' : 'Nova versão publicada. A aplicação está reiniciando.',
    'Deploy na RTCloud'
  );
  return { ok: true, falha: null, ...estado };
}

module.exports = { executar };


/***/ }),

/***/ 787:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

/**
 * Monta o .zip do projeto que vai para o Commit.
 *
 * Quais arquivos entram:
 *   · com `.rtcloudignore` (ou `rtcloud.ignore`) na raiz → valem só as regras
 *     dele, e o `.gitignore` é deixado de lado. É o jeito de mandar o que o
 *     build do CI gerou (dist/, .next/…) mesmo que o Git ignore essas pastas
 *     — a mesma ideia do `.npmignore` no npm;
 *   · sem ele → valem os `.gitignore` do projeto (o da raiz e os das
 *     subpastas, cada um relativo à própria pasta, como no Git);
 *   · sempre ficam de fora `.git/` e `node_modules/` (a RTCloud instala as
 *     dependências no servidor) e lixo de sistema (.DS_Store, Thumbs.db);
 *   · `package.json`, `requirements.txt` e `pyproject.toml` da raiz nunca são
 *     ignorados — sem eles a aplicação não sobe (o painel faz o mesmo);
 *   · links simbólicos não são seguidos: um link para fora do projeto
 *     levaria arquivos do runner junto. Eles aparecem como aviso.
 *
 * O .zip é escrito em fluxo num arquivo temporário: nunca segura o projeto
 * inteiro na memória.
 */
const fs = __nccwpck_require__(24);
const path = __nccwpck_require__(760);
const ignore = __nccwpck_require__(298);
const { Zip, ZipDeflate, ZipPassThrough } = __nccwpck_require__(325);
const { ErroDaAction } = __nccwpck_require__(474);

/** Teto por envio aceito pela RTCloud (o mesmo do painel). */
const LIMITE_BYTES = 100 * 1024 * 1024;

const NOMES_IGNORE_RTCLOUD = ['.rtcloudignore', 'rtcloud.ignore'];
const PASTAS_SEMPRE_FORA = new Set(['.git', 'node_modules']);
const ARQUIVOS_SEMPRE_FORA = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini']);
const ESSENCIAIS_NA_RAIZ = new Set(['package.json', 'requirements.txt', 'pyproject.toml']);

/* já comprimidos: guardar sem comprimir de novo poupa CPU e não aumenta nada */
const JA_COMPRIMIDOS = new Set([
  '.zip', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar', '.br', '.zst',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico',
  '.mp3', '.ogg', '.opus', '.m4a', '.aac', '.flac',
  '.mp4', '.webm', '.mov', '.mkv', '.avi',
  '.woff', '.woff2', '.pdf', '.jar', '.apk',
]);

const DATA_MINIMA_ZIP = new Date('1980-01-02T00:00:00Z').getTime();
const DATA_MAXIMA_ZIP = new Date('2099-12-30T00:00:00Z').getTime();

function lerTexto(arquivo) {
  try {
    return fs.readFileSync(arquivo, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Decide o que fica de fora. Devolve `fica(rel, ehPasta)` e de onde vieram as regras.
 * @param {string} raiz
 */
function criarFiltro(raiz) {
  for (const nome of NOMES_IGNORE_RTCLOUD) {
    const texto = lerTexto(path.join(raiz, nome));
    if (texto !== null) {
      const ig = ignore({ allowRelativePaths: true }).add(texto);
      return {
        origem: nome,
        /** regras por pasta: com .rtcloudignore só a raiz conta */
        entrarNaPasta() {},
        ignora: (rel, ehPasta) => ig.ignores(ehPasta ? `${rel}/` : rel),
      };
    }
  }

  /* .gitignore: um por pasta, cada um relativo a ela; o mais fundo decide */
  const camadas = [];
  const temRaiz = lerTexto(path.join(raiz, '.gitignore')) !== null;
  return {
    origem: temRaiz ? '.gitignore' : null,
    entrarNaPasta(relPasta) {
      const texto = lerTexto(path.join(raiz, relPasta, '.gitignore'));
      if (texto === null) return;
      if (relPasta) this.origem = this.origem || '.gitignore';
      camadas.push({ base: relPasta ? `${relPasta}/` : '', ig: ignore({ allowRelativePaths: true }).add(texto) });
    },
    ignora(rel, ehPasta) {
      for (let i = camadas.length - 1; i >= 0; i--) {
        const { base, ig } = camadas[i];
        if (base && !rel.startsWith(base)) continue;
        const resto = rel.slice(base.length);
        if (!resto) continue;
        const r = ig.test(ehPasta ? `${resto}/` : resto);
        if (r.ignored) return true;
        if (r.unignored) return false;
      }
      return false;
    },
  };
}

/**
 * Lista os arquivos que entram, em ordem estável.
 * @param {string} raiz pasta do projeto (absoluta)
 * @param {{ excluir?: string[] }} [opcoes] caminhos absolutos que nunca entram (o próprio .zip)
 */
function listarArquivos(raiz, opcoes = {}) {
  const excluir = new Set((opcoes.excluir || []).map((p) => path.resolve(p)));
  const filtro = criarFiltro(raiz);
  const arquivos = [];
  const links = [];
  let ignorados = 0;

  const visitar = (relPasta) => {
    filtro.entrarNaPasta(relPasta);
    const absPasta = path.join(raiz, relPasta);
    let itens;
    try {
      itens = fs.readdirSync(absPasta, { withFileTypes: true });
    } catch (e) {
      throw new ErroDaAction(`Não foi possível ler a pasta "${relPasta || '.'}": ${e.code || e.message}.`);
    }
    itens.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const item of itens) {
      const rel = relPasta ? `${relPasta}/${item.name}` : item.name;
      const abs = path.join(absPasta, item.name);
      if (excluir.has(path.resolve(abs))) continue;

      if (item.isSymbolicLink()) {
        links.push(rel);
        continue;
      }
      if (item.isDirectory()) {
        if (PASTAS_SEMPRE_FORA.has(item.name) || filtro.ignora(rel, true)) {
          ignorados++;
          continue;
        }
        visitar(rel);
        continue;
      }
      if (!item.isFile()) continue;

      const essencial = !relPasta && ESSENCIAIS_NA_RAIZ.has(item.name);
      if (!essencial && (ARQUIVOS_SEMPRE_FORA.has(item.name) || filtro.ignora(rel, false))) {
        ignorados++;
        continue;
      }
      const st = fs.statSync(abs);
      arquivos.push({ rel, abs, tamanho: st.size, modo: st.mode, mtime: st.mtimeMs });
    }
  };

  visitar('');
  return { arquivos, links, ignorados, regras: filtro.origem };
}

function dataNoZip(ms) {
  if (!Number.isFinite(ms)) return new Date(DATA_MINIMA_ZIP);
  return new Date(Math.min(DATA_MAXIMA_ZIP, Math.max(DATA_MINIMA_ZIP, ms)));
}

/** Permissões Unix no zip (mantém o +x de scripts como start.sh). */
function atributos(modo) {
  const perm = (modo & 0o777) || 0o644;
  return ((0o100000 | perm) << 16) >>> 0;
}

function formatarBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function maiores(arquivos, n = 8) {
  return [...arquivos].sort((a, b) => b.tamanho - a.tamanho).slice(0, n).map((a) => ({ caminho: a.rel, tamanho: a.tamanho }));
}

/**
 * Escreve o .zip.
 * @param {string} raiz
 * @param {string} destino caminho do .zip (fora do projeto, de preferência)
 * @param {{ limiteBytes?: number }} [opcoes]
 */
function montarPacote(raiz, destino, opcoes = {}) {
  const limite = opcoes.limiteBytes || LIMITE_BYTES;
  const lista = listarArquivos(raiz, { excluir: [destino] });
  if (lista.arquivos.length === 0) {
    throw new ErroDaAction('Nenhum arquivo para enviar: a pasta está vazia ou tudo caiu nas regras de ignorar.', {
      dica: lista.regras
        ? `Confira o ${lista.regras} e a entrada "path".`
        : 'Confira a entrada "path" e se o actions/checkout veio antes.',
    });
  }

  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const fd = fs.openSync(destino, 'w');
  let escritos = 0;
  let falha = null;
  let estourou = false;
  let fechado = false;
  try {
    const zip = new Zip((err, pedaco) => {
      if (err) {
        falha = err;
        return;
      }
      if (estourou || !pedaco || !pedaco.length) return;
      escritos += pedaco.length;
      if (escritos > limite) {
        estourou = true;
        return;
      }
      fs.writeSync(fd, pedaco);
    });

    let bytesOriginais = 0;
    for (const a of lista.arquivos) {
      if (falha || estourou) break;
      const dados = fs.readFileSync(a.abs);
      bytesOriginais += dados.length;
      const atrib = { os: 3, attrs: atributos(a.modo), mtime: dataNoZip(a.mtime) };
      const guardar = JA_COMPRIMIDOS.has(path.extname(a.rel).toLowerCase());
      const entrada = guardar ? new ZipPassThrough(a.rel) : new ZipDeflate(a.rel, { level: 6 });
      Object.assign(entrada, atrib);
      zip.add(entrada);
      entrada.push(dados, true);
    }
    if (!falha && !estourou) zip.end();

    fs.closeSync(fd);
    fechado = true;

    if (falha) throw new ErroDaAction(`Falha ao montar o .zip: ${falha.message || falha}.`);
    if (estourou) {
      fs.rmSync(destino, { force: true });
      const top = maiores(lista.arquivos, 5)
        .map((m) => `${m.caminho} (${formatarBytes(m.tamanho)})`)
        .join(', ');
      throw new ErroDaAction(`O pacote passou do limite de ${formatarBytes(limite)} por envio.`, {
        dica: `Deixe de fora mídia, bancos e builds pesados com um .rtcloudignore na raiz. Maiores arquivos: ${top}.`,
        codigo: 'PAYLOAD_TOO_LARGE',
      });
    }

    return {
      arquivo: destino,
      bytes: escritos,
      bytesOriginais,
      total: lista.arquivos.length,
      ignorados: lista.ignorados,
      links: lista.links,
      regras: lista.regras,
      caminhos: lista.arquivos.map((a) => a.rel),
      maiores: maiores(lista.arquivos),
    };
  } finally {
    if (!fechado) {
      try {
        fs.closeSync(fd);
      } catch {
        /* já fechado */
      }
    }
  }
}

module.exports = { montarPacote, listarArquivos, formatarBytes, LIMITE_BYTES };


/***/ }),

/***/ 580:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

"use strict";

/**
 * O resumo do job (a página do run no GitHub) — em sucesso e em falha.
 *
 * Tudo que vem de fora (nome da aplicação, mensagem do servidor, caminho de
 * arquivo) passa por `celula()`: sem isso um "|" quebra a tabela e um "<"
 * vira HTML no resumo.
 */
const { formatarBytes } = __nccwpck_require__(787);

function celula(texto) {
  return String(texto ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|')
    .trim();
}

function codigo(texto) {
  const t = celula(texto).replace(/`/g, "'");
  return t ? `\`${t}\`` : '';
}

function duracao(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/** Endereço do painel a partir da URL da API (…/api/v1 → …). */
function enderecoDoPainel(api, appId) {
  try {
    const u = new URL(api);
    const base = u.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return `${u.origin}${base}/dashboard/apps/${encodeURIComponent(appId)}`;
  } catch {
    return null;
  }
}

function contextoDoGit(ambiente = process.env) {
  const sha = ambiente.GITHUB_SHA || '';
  const repo = ambiente.GITHUB_REPOSITORY || '';
  const servidor = (ambiente.GITHUB_SERVER_URL || 'https://github.com').replace(/\/+$/, '');
  return {
    sha,
    curto: sha.slice(0, 7),
    ref: ambiente.GITHUB_REF_NAME || '',
    link: sha && repo ? `${servidor}/${repo}/commit/${sha}` : null,
  };
}

function linhaDoPacote(pacote) {
  if (!pacote) return null;
  const regras = pacote.regras ? `regras do ${codigo(pacote.regras)}` : 'sem arquivo de ignorar';
  return `${formatarBytes(pacote.bytes)} · ${pacote.total} arquivo${pacote.total === 1 ? '' : 's'} · ${regras}`;
}

function linhaDoGit(git) {
  if (!git.curto) return null;
  const sha = git.link ? `[${codigo(git.curto)}](${git.link})` : codigo(git.curto);
  return git.ref ? `${sha} em ${codigo(git.ref)}` : sha;
}

function tabela(linhas) {
  const validas = linhas.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return ['| | |', '| --- | --- |', ...validas.map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
}

function blocoDosMaiores(pacote) {
  if (!pacote || !pacote.maiores || pacote.maiores.length === 0) return '';
  const linhas = pacote.maiores.map((m) => `| ${codigo(m.caminho)} | ${formatarBytes(m.tamanho)} |`);
  return [
    '',
    '<details><summary>Maiores arquivos do pacote</summary>',
    '',
    '| Arquivo | Tamanho |',
    '| --- | --- |',
    ...linhas,
    '',
    '</details>',
  ].join('\n');
}

function textoDoReinicio(r) {
  if (!r) return null;
  switch (r.situacao) {
    case 'feito':
      return r.motivo === 'variaveis'
        ? `Feito, para carregar ${r.variaveis} variáve${r.variaveis === 1 ? 'l nova' : 'is novas'}`
        : 'Feito (restart: true)';
    case 'falhou':
      return `Falhou: ${celula(r.erro)}`;
    case 'desligado':
      return 'Não (restart: false)';
    default:
      return 'Não precisou (o commit já reinicia a aplicação)';
  }
}

/**
 * @param {object} d
 * @param {string} d.api
 * @param {{ id:string, nome:string, url:string|null }|null} d.aplicacao
 * @param {object|null} d.pacote
 * @param {{ online:boolean, variaveisNovas:number, mensagem:string }|null} d.commit
 * @param {object|null} d.reinicio
 * @param {number} d.ms
 * @param {{ mensagem:string, dica?:string, etapa?:string }|null} d.falha
 * @param {string[]} [d.avisos]
 */
function montarResumo(d, ambiente = process.env) {
  const git = contextoDoGit(ambiente);
  const app = d.aplicacao;
  const nomeApp = app
    ? app.nome && app.nome !== app.id
      ? `**${celula(app.nome)}** (${codigo(app.id)})`
      : `**${celula(app.id)}**`
    : d.appInformada
      ? codigo(d.appInformada)
      : null;
  const painel = app ? enderecoDoPainel(d.api, app.id) : null;
  const partes = [];

  if (d.commit) {
    const reinicioFalhou = d.reinicio && d.reinicio.situacao === 'falhou';
    partes.push(
      reinicioFalhou
        ? '## ⚠️ Deploy na RTCloud: versão publicada, mas o reinício falhou'
        : '## ✅ Deploy na RTCloud: nova versão publicada'
    );
    partes.push('');
    partes.push(
      tabela([
        ['Aplicação', nomeApp],
        ['Situação', d.commit.online ? '🟢 No ar' : '🟡 Reiniciando: confira o status em instantes'],
        ['Endereço', app && app.url ? celula(app.url) : null],
        ['Pacote', linhaDoPacote(d.pacote)],
        ['Variáveis novas do .env', String(d.commit.variaveisNovas)],
        ['Reinício extra', textoDoReinicio(d.reinicio)],
        ['Commit do Git', linhaDoGit(git)],
        ['Tempo', duracao(d.ms)],
      ])
    );
    if (d.commit.mensagem) partes.push('', `> ${celula(d.commit.mensagem)}`);
  } else {
    partes.push('## ❌ Deploy na RTCloud: a versão não foi publicada');
    partes.push('');
    if (d.falha) {
      partes.push(`**O que aconteceu:** ${celula(d.falha.mensagem)}`);
      if (d.falha.dica) partes.push('', `**Como resolver:** ${celula(d.falha.dica)}`);
      partes.push('');
    }
    partes.push(
      tabela([
        ['Aplicação', nomeApp],
        ['Etapa', d.falha && d.falha.etapa ? celula(d.falha.etapa) : null],
        ['Pacote', linhaDoPacote(d.pacote)],
        ['Commit do Git', linhaDoGit(git)],
        ['Tempo', duracao(d.ms)],
      ])
    );
  }

  if (d.avisos && d.avisos.length) {
    partes.push('', d.avisos.map((a) => `> [!WARNING]\n> ${celula(a)}`).join('\n\n'));
  }
  if (painel) partes.push('', `[Abrir a aplicação no painel da RTCloud →](${painel})`);
  const maiores = blocoDosMaiores(d.pacote);
  if (maiores) partes.push(maiores);
  return `${partes.join('\n')}\n`;
}

module.exports = { montarResumo, enderecoDoPainel, celula };


/***/ }),

/***/ 598:
/***/ ((module) => {

"use strict";
module.exports = require("node:crypto");

/***/ }),

/***/ 24:
/***/ ((module) => {

"use strict";
module.exports = require("node:fs");

/***/ }),

/***/ 67:
/***/ ((module) => {

"use strict";
module.exports = require("node:http");

/***/ }),

/***/ 708:
/***/ ((module) => {

"use strict";
module.exports = require("node:https");

/***/ }),

/***/ 161:
/***/ ((module) => {

"use strict";
module.exports = require("node:os");

/***/ }),

/***/ 760:
/***/ ((module) => {

"use strict";
module.exports = require("node:path");

/***/ }),

/***/ 167:
/***/ ((module) => {

"use strict";
module.exports = require("worker_threads");

/***/ }),

/***/ 325:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";

// DEFLATE is a complex format; to read this code, you should probably check the RFC first:
// https://tools.ietf.org/html/rfc1951
// You may also wish to take a look at the guide I made about this program:
// https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
exports.deflate = deflate;
exports.deflateSync = deflateSync;
exports.inflate = inflate;
exports.inflateSync = inflateSync;
exports.gzip = gzip;
exports.compress = gzip;
exports.gzipSync = gzipSync;
exports.compressSync = gzipSync;
exports.gunzip = gunzip;
exports.gunzipSync = gunzipSync;
exports.zlib = zlib;
exports.zlibSync = zlibSync;
exports.unzlib = unzlib;
exports.unzlibSync = unzlibSync;
exports.gzip = gzip;
exports.compress = gzip;
exports.decompress = decompress;
exports.decompressSync = decompressSync;
exports.strToU8 = strToU8;
exports.strFromU8 = strFromU8;
exports.zip = zip;
exports.zipSync = zipSync;
exports.unzip = unzip;
exports.unzipSync = unzipSync;
// Some of the following code is similar to that of UZIP.js:
// https://github.com/photopea/UZIP.js
// However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
// Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
// is better for memory in most engines (I *think*).
var _a;
// Mediocre shim
var Worker;
var isMarkedAsUntransferable;
var workerAdd = ";var __w=require('worker_threads');__w.parentPort.on('message',function(m){onmessage({data:m})}),postMessage=function(m,t){__w.parentPort.postMessage(m,t)},close=process.exit;self=global";
try {
    (_a = __nccwpck_require__(167), Worker = _a.Worker, isMarkedAsUntransferable = _a.isMarkedAsUntransferable);
}
catch (e) {
}
var node_worker_1 = {};
node_worker_1["default"] = Worker ? function (c, _, msg, transfer, cb) {
    var done = false;
    var w = new Worker(c + workerAdd, { eval: true })
        .on('error', function (e) { return cb(e, null); })
        .on('message', function (m) { return cb(null, m); })
        .on('exit', function (c) {
        if (c && !done)
            cb(new Error('exited with code ' + c), null);
    });
    if (isMarkedAsUntransferable)
        transfer = transfer.filter(function (t) { return !isMarkedAsUntransferable(t); });
    w.postMessage(msg, transfer);
    w.terminate = function () {
        done = true;
        return Worker.prototype.terminate.call(w);
    };
    return w;
} : function (_, __, ___, ____, cb) {
    setImmediate(function () { return cb(new Error('async operations unsupported - update to Node 12+ (or Node 10-11 with the --experimental-worker CLI flag)'), null); });
    var NOP = function () { };
    return {
        terminate: NOP,
        postMessage: NOP
    };
};

// aliases for shorter compressed code (most minifers don't do this)
var u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array;
// fixed length extra bits
var fleb = new u8([0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0]);
// fixed distance extra bits
var fdeb = new u8([0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, /* unused */ 0, 0]);
// code length index map
var clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]);
// get base, reverse index map from extra bits
var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
        b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
        for (var j = b[i]; j < b[i + 1]; ++j) {
            r[j] = ((j - b[i]) << 5) | i;
        }
    }
    return { b: b, r: r };
};
var _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
// we can ignore the fact that the other numbers are wrong; they never happen anyway
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b.b, revfd = _b.r;
// map of value to reverse (assuming 16 bits)
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xAAAA) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xCCCC) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xF0F0) >> 4) | ((x & 0x0F0F) << 4);
    rev[i] = (((x & 0xFF00) >> 8) | ((x & 0x00FF) << 8)) >> 1;
}
// create huffman tree from u8 "map": index -> code length for code index
// mb (max bits) must be at most 15
// TODO: optimize/split up?
var hMap = (function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
        if (cd[i])
            ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
        le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
        // u16 "map": index -> number of actual bits, symbol for code
        co = new u16(1 << mb);
        // bits to remove for reverser
        var rvb = 15 - mb;
        for (i = 0; i < s; ++i) {
            // ignore 0 lengths
            if (cd[i]) {
                // num encoding both symbol and bits read
                var sv = (i << 4) | cd[i];
                // free bits
                var r_1 = mb - cd[i];
                // start value
                var v = le[cd[i] - 1]++ << r_1;
                // m is end value
                for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
                    // every 16 bit value starting with the code yields the same result
                    co[rev[v] >> rvb] = sv;
                }
            }
        }
    }
    else {
        co = new u16(s);
        for (i = 0; i < s; ++i) {
            if (cd[i]) {
                co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
            }
        }
    }
    return co;
});
// fixed length tree
var flt = new u8(288);
for (var i = 0; i < 144; ++i)
    flt[i] = 8;
for (var i = 144; i < 256; ++i)
    flt[i] = 9;
for (var i = 256; i < 280; ++i)
    flt[i] = 7;
for (var i = 280; i < 288; ++i)
    flt[i] = 8;
// fixed distance tree
var fdt = new u8(32);
for (var i = 0; i < 32; ++i)
    fdt[i] = 5;
// fixed length map
var flm = /*#__PURE__*/ hMap(flt, 9, 0), flrm = /*#__PURE__*/ hMap(flt, 9, 1);
// fixed distance map
var fdm = /*#__PURE__*/ hMap(fdt, 5, 0), fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
// find max of array
var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
        if (a[i] > m)
            m = a[i];
    }
    return m;
};
// read d, starting at bit p and mask with m
var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
};
// read d, starting at bit p continuing for at least 16 bits
var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7));
};
// get end of byte
var shft = function (p) { return ((p + 7) / 8) | 0; };
// typed array slice - allows garbage collector to free original reference,
// while being more compatible than .slice
var slc = function (v, s, e) {
    if (s == null || s < 0)
        s = 0;
    if (e == null || e > v.length)
        e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
};
/**
 * Codes for errors generated within this library
 */
exports.FlateErrorCode = {
    UnexpectedEOF: 0,
    InvalidBlockType: 1,
    InvalidLengthLiteral: 2,
    InvalidDistance: 3,
    StreamFinished: 4,
    NoStreamHandler: 5,
    InvalidHeader: 6,
    NoCallback: 7,
    InvalidUTF8: 8,
    ExtraFieldTooLong: 9,
    InvalidDate: 10,
    FilenameTooLong: 11,
    StreamFinishing: 12,
    InvalidZipData: 13,
    UnknownCompressionMethod: 14
};
// error codes
var ec = [
    'unexpected EOF',
    'invalid block type',
    'invalid length/literal',
    'invalid distance',
    'stream finished',
    'no stream handler',
    , // determined by compression function
    'no callback',
    'invalid UTF-8 data',
    'extra field too long',
    'date not in range 1980-2099',
    'filename too long',
    'stream finishing',
    'invalid zip data'
    // determined by unknown compression method
];
;
var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    e.code = ind;
    if (Error.captureStackTrace)
        Error.captureStackTrace(e, err);
    if (!nt)
        throw e;
    return e;
};
// expands raw DEFLATE data
var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
        return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf)
        buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
        var bl = buf.length;
        // need to increase size to fit
        if (l > bl) {
            // Double or set to necessary, whichever is greater
            var nbuf = new u8(Math.max(bl * 2, l));
            nbuf.set(buf);
            buf = nbuf;
        }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
        if (!lm) {
            // BFINAL - this is only 1 when last chunk is next
            final = bits(dat, pos, 1);
            // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
            var type = bits(dat, pos + 1, 3);
            pos += 3;
            if (!type) {
                // go to end of byte boundary
                var s = shft(pos) + 4, l = dat[s - 4] | (dat[s - 3] << 8), t = s + l;
                if (t > sl) {
                    if (noSt)
                        err(0);
                    break;
                }
                // ensure size
                if (resize)
                    cbuf(bt + l);
                // Copy over uncompressed data
                buf.set(dat.subarray(s, t), bt);
                // Get new bitpos, update byte count
                st.b = bt += l, st.p = pos = t * 8, st.f = final;
                continue;
            }
            else if (type == 1)
                lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
            else if (type == 2) {
                //  literal                            lengths
                var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
                var tl = hLit + bits(dat, pos + 5, 31) + 1;
                pos += 14;
                // length+distance tree
                var ldt = new u8(tl);
                // code length tree
                var clt = new u8(19);
                for (var i = 0; i < hcLen; ++i) {
                    // use index map to get real code
                    clt[clim[i]] = bits(dat, pos + i * 3, 7);
                }
                pos += hcLen * 3;
                // code lengths bits
                var clb = max(clt), clbmsk = (1 << clb) - 1;
                // code lengths map
                var clm = hMap(clt, clb, 1);
                for (var i = 0; i < tl;) {
                    var r = clm[bits(dat, pos, clbmsk)];
                    // bits read
                    pos += r & 15;
                    // symbol
                    var s = r >> 4;
                    // code length to copy
                    if (s < 16) {
                        ldt[i++] = s;
                    }
                    else {
                        //  copy   count
                        var c = 0, n = 0;
                        if (s == 16)
                            n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
                        else if (s == 17)
                            n = 3 + bits(dat, pos, 7), pos += 3;
                        else if (s == 18)
                            n = 11 + bits(dat, pos, 127), pos += 7;
                        while (n--)
                            ldt[i++] = c;
                    }
                }
                //    length tree                 distance tree
                var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
                // max length bits
                lbt = max(lt);
                // max dist bits
                dbt = max(dt);
                lm = hMap(lt, lbt, 1);
                dm = hMap(dt, dbt, 1);
            }
            else
                err(1);
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
        }
        // Make sure the buffer can hold this + the largest possible addition
        // Maximum chunk size (practically, theoretically infinite) is 2^17
        if (resize)
            cbuf(bt + 131072);
        var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
        var lpos = pos;
        for (;; lpos = pos) {
            // bits read, code
            var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
            pos += c & 15;
            if (pos > tbts) {
                if (noSt)
                    err(0);
                break;
            }
            if (!c)
                err(2);
            if (sym < 256)
                buf[bt++] = sym;
            else if (sym == 256) {
                lpos = pos, lm = null;
                break;
            }
            else {
                var add = sym - 254;
                // no extra bits needed if less
                if (sym > 264) {
                    // index
                    var i = sym - 257, b = fleb[i];
                    add = bits(dat, pos, (1 << b) - 1) + fl[i];
                    pos += b;
                }
                // dist
                var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
                if (!d)
                    err(3);
                pos += d & 15;
                var dt = fd[dsym];
                if (dsym > 3) {
                    var b = fdeb[dsym];
                    dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
                }
                if (pos > tbts) {
                    if (noSt)
                        err(0);
                    break;
                }
                if (resize)
                    cbuf(bt + 131072);
                var end = bt + add;
                if (bt < dt) {
                    var shift = dl - dt, dend = Math.min(dt, end);
                    if (shift + bt < 0)
                        err(3);
                    for (; bt < dend; ++bt)
                        buf[bt] = dict[shift + bt];
                }
                for (; bt < end; ++bt)
                    buf[bt] = buf[bt - dt];
            }
        }
        st.l = lm, st.p = lpos, st.b = bt, st.f = final;
        if (lm)
            final = 1, st.m = lbt, st.d = dm, st.n = dbt;
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
};
// starting at p, write the minimum number of bits that can hold v to d
var wbits = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
};
// starting at p, write the minimum number of bits (>8) that can hold v to d
var wbits16 = function (d, p, v) {
    v <<= p & 7;
    var o = (p / 8) | 0;
    d[o] |= v;
    d[o + 1] |= v >> 8;
    d[o + 2] |= v >> 16;
};
// creates code lengths from a frequency table
var hTree = function (d, mb) {
    // Need extra info to make a tree
    var t = [];
    for (var i = 0; i < d.length; ++i) {
        if (d[i])
            t.push({ s: i, f: d[i] });
    }
    var s = t.length;
    var t2 = t.slice();
    if (!s)
        return { t: et, l: 0 };
    if (s == 1) {
        var v = new u8(t[0].s + 1);
        v[t[0].s] = 1;
        return { t: v, l: 1 };
    }
    t.sort(function (a, b) { return a.f - b.f; });
    // after i2 reaches last ind, will be stopped
    // freq must be greater than largest possible number of symbols
    t.push({ s: -1, f: 25001 });
    var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
    t[0] = { s: -1, f: l.f + r.f, l: l, r: r };
    // efficient algorithm from UZIP.js
    // i0 is lookbehind, i2 is lookahead - after processing two low-freq
    // symbols that combined have high freq, will start processing i2 (high-freq,
    // non-composite) symbols instead
    // see https://reddit.com/r/photopea/comments/ikekht/uzipjs_questions/
    while (i1 != s - 1) {
        l = t[t[i0].f < t[i2].f ? i0++ : i2++];
        r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
        t[i1++] = { s: -1, f: l.f + r.f, l: l, r: r };
    }
    var maxSym = t2[0].s;
    for (var i = 1; i < s; ++i) {
        if (t2[i].s > maxSym)
            maxSym = t2[i].s;
    }
    // code lengths
    var tr = new u16(maxSym + 1);
    // max bits in tree
    var mbt = ln(t[i1 - 1], tr, 0);
    if (mbt > mb) {
        // more algorithms from UZIP.js
        // TODO: find out how this code works (debt)
        //  ind    debt
        var i = 0, dt = 0;
        //    left            cost
        var lft = mbt - mb, cst = 1 << lft;
        t2.sort(function (a, b) { return tr[b.s] - tr[a.s] || a.f - b.f; });
        for (; i < s; ++i) {
            var i2_1 = t2[i].s;
            if (tr[i2_1] > mb) {
                dt += cst - (1 << (mbt - tr[i2_1]));
                tr[i2_1] = mb;
            }
            else
                break;
        }
        dt >>= lft;
        while (dt > 0) {
            var i2_2 = t2[i].s;
            if (tr[i2_2] < mb)
                dt -= 1 << (mb - tr[i2_2]++ - 1);
            else
                ++i;
        }
        for (; i >= 0 && dt; --i) {
            var i2_3 = t2[i].s;
            if (tr[i2_3] == mb) {
                --tr[i2_3];
                ++dt;
            }
        }
        mbt = mb;
    }
    return { t: new u8(tr), l: mbt };
};
// get the max length and assign length codes
var ln = function (n, l, d) {
    return n.s == -1
        ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1))
        : (l[n.s] = d);
};
// length codes generation
var lc = function (c) {
    var s = c.length;
    // Note that the semicolon was intentional
    while (s && !c[--s])
        ;
    var cl = new u16(++s);
    //  ind      num         streak
    var cli = 0, cln = c[0], cls = 1;
    var w = function (v) { cl[cli++] = v; };
    for (var i = 1; i <= s; ++i) {
        if (c[i] == cln && i != s)
            ++cls;
        else {
            if (!cln && cls > 2) {
                for (; cls > 138; cls -= 138)
                    w(32754);
                if (cls > 2) {
                    w(cls > 10 ? ((cls - 11) << 5) | 28690 : ((cls - 3) << 5) | 12305);
                    cls = 0;
                }
            }
            else if (cls > 3) {
                w(cln), --cls;
                for (; cls > 6; cls -= 6)
                    w(8304);
                if (cls > 2)
                    w(((cls - 3) << 5) | 8208), cls = 0;
            }
            while (cls--)
                w(cln);
            cls = 1;
            cln = c[i];
        }
    }
    return { c: cl.subarray(0, cli), n: s };
};
// calculate the length of output from tree, code lengths
var clen = function (cf, cl) {
    var l = 0;
    for (var i = 0; i < cl.length; ++i)
        l += cf[i] * cl[i];
    return l;
};
// writes a fixed block
// returns the new bit pos
var wfblk = function (out, pos, dat) {
    // no need to write 00 as type: TypedArray defaults to 0
    var s = dat.length;
    var o = shft(pos + 2);
    out[o] = s & 255;
    out[o + 1] = s >> 8;
    out[o + 2] = out[o] ^ 255;
    out[o + 3] = out[o + 1] ^ 255;
    for (var i = 0; i < s; ++i)
        out[o + i + 4] = dat[i];
    return (o + 4 + s) * 8;
};
// writes a block
var wblk = function (dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
    wbits(out, p++, final);
    ++lf[256];
    var _a = hTree(lf, 15), dlt = _a.t, mlb = _a.l;
    var _b = hTree(df, 15), ddt = _b.t, mdb = _b.l;
    var _c = lc(dlt), lclt = _c.c, nlc = _c.n;
    var _d = lc(ddt), lcdt = _d.c, ndc = _d.n;
    var lcfreq = new u16(19);
    for (var i = 0; i < lclt.length; ++i)
        ++lcfreq[lclt[i] & 31];
    for (var i = 0; i < lcdt.length; ++i)
        ++lcfreq[lcdt[i] & 31];
    var _e = hTree(lcfreq, 7), lct = _e.t, mlcb = _e.l;
    var nlcc = 19;
    for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc)
        ;
    var flen = (bl + 5) << 3;
    var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
    var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + 2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18];
    if (bs >= 0 && flen <= ftlen && flen <= dtlen)
        return wfblk(out, p, dat.subarray(bs, bs + bl));
    var lm, ll, dm, dl;
    wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
    if (dtlen < ftlen) {
        lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
        var llm = hMap(lct, mlcb, 0);
        wbits(out, p, nlc - 257);
        wbits(out, p + 5, ndc - 1);
        wbits(out, p + 10, nlcc - 4);
        p += 14;
        for (var i = 0; i < nlcc; ++i)
            wbits(out, p + 3 * i, lct[clim[i]]);
        p += 3 * nlcc;
        var lcts = [lclt, lcdt];
        for (var it = 0; it < 2; ++it) {
            var clct = lcts[it];
            for (var i = 0; i < clct.length; ++i) {
                var len = clct[i] & 31;
                wbits(out, p, llm[len]), p += lct[len];
                if (len > 15)
                    wbits(out, p, (clct[i] >> 5) & 127), p += clct[i] >> 12;
            }
        }
    }
    else {
        lm = flm, ll = flt, dm = fdm, dl = fdt;
    }
    for (var i = 0; i < li; ++i) {
        var sym = syms[i];
        if (sym > 255) {
            var len = (sym >> 18) & 31;
            wbits16(out, p, lm[len + 257]), p += ll[len + 257];
            if (len > 7)
                wbits(out, p, (sym >> 23) & 31), p += fleb[len];
            var dst = sym & 31;
            wbits16(out, p, dm[dst]), p += dl[dst];
            if (dst > 3)
                wbits16(out, p, (sym >> 5) & 8191), p += fdeb[dst];
        }
        else {
            wbits16(out, p, lm[sym]), p += ll[sym];
        }
    }
    wbits16(out, p, lm[256]);
    return p + ll[256];
};
// deflate options (nice << 13) | chain
var deo = /*#__PURE__*/ new i32([65540, 131080, 131088, 131104, 262176, 1048704, 1048832, 2114560, 2117632]);
// empty
var et = /*#__PURE__*/ new u8(0);
// compresses data into a raw DEFLATE buffer
var dflt = function (dat, lvl, plvl, pre, post, st) {
    var s = st.z || dat.length;
    var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7000)) + post);
    // writing to this writes to the output buffer
    var w = o.subarray(pre, o.length - post);
    var lst = st.l;
    var pos = (st.r || 0) & 7;
    if (lvl) {
        if (pos)
            w[0] = st.r >> 3;
        var opt = deo[lvl - 1];
        var n = opt >> 13, c = opt & 8191;
        var msk_1 = (1 << plvl) - 1;
        //    prev 2-byte val map    curr 2-byte val map
        var prev = st.p || new u16(32768), head = st.h || new u16(msk_1 + 1);
        var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
        var hsh = function (i) { return (dat[i] ^ (dat[i + 1] << bs1_1) ^ (dat[i + 2] << bs2_1)) & msk_1; };
        // 24576 is an arbitrary number of maximum symbols per block
        // 424 buffer for last block
        var syms = new i32(25000);
        // length/literal freq   distance freq
        var lf = new u16(288), df = new u16(32);
        //  l/lcnt  exbits  index          l/lind  waitdx          blkpos
        var lc_1 = 0, eb = 0, i = st.i || 0, li = 0, wi = st.w || 0, bs = 0;
        for (; i + 2 < s; ++i) {
            // hash value
            var hv = hsh(i);
            // index mod 32768    previous index mod
            var imod = i & 32767, pimod = head[hv];
            prev[imod] = pimod;
            head[hv] = imod;
            // We always should modify head and prev, but only add symbols if
            // this data is not yet processed ("wait" for wait index)
            if (wi <= i) {
                // bytes remaining
                var rem = s - i;
                if ((lc_1 > 7000 || li > 24576) && (rem > 423 || !lst)) {
                    pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
                    li = lc_1 = eb = 0, bs = i;
                    for (var j = 0; j < 286; ++j)
                        lf[j] = 0;
                    for (var j = 0; j < 30; ++j)
                        df[j] = 0;
                }
                //  len    dist   chain
                var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
                if (rem > 2 && hv == hsh(i - dif)) {
                    var maxn = Math.min(n, rem) - 1;
                    var maxd = Math.min(32767, i);
                    // max possible length
                    // not capped at dif because decompressors implement "rolling" index population
                    var ml = Math.min(258, rem);
                    while (dif <= maxd && --ch_1 && imod != pimod) {
                        if (dat[i + l] == dat[i + l - dif]) {
                            var nl = 0;
                            for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl)
                                ;
                            if (nl > l) {
                                l = nl, d = dif;
                                // break out early when we reach "nice" (we are satisfied enough)
                                if (nl > maxn)
                                    break;
                                // now, find the rarest 2-byte sequence within this
                                // length of literals and search for that instead.
                                // Much faster than just using the start
                                var mmd = Math.min(dif, nl - 2);
                                var md = 0;
                                for (var j = 0; j < mmd; ++j) {
                                    var ti = i - dif + j & 32767;
                                    var pti = prev[ti];
                                    var cd = ti - pti & 32767;
                                    if (cd > md)
                                        md = cd, pimod = ti;
                                }
                            }
                        }
                        // check the previous match
                        imod = pimod, pimod = prev[imod];
                        dif += imod - pimod & 32767;
                    }
                }
                // d will be nonzero only when a match was found
                if (d) {
                    // store both dist and len data in one int32
                    // Make sure this is recognized as a len/dist with 28th bit (2^28)
                    syms[li++] = 268435456 | (revfl[l] << 18) | revfd[d];
                    var lin = revfl[l] & 31, din = revfd[d] & 31;
                    eb += fleb[lin] + fdeb[din];
                    ++lf[257 + lin];
                    ++df[din];
                    wi = i + l;
                    ++lc_1;
                }
                else {
                    syms[li++] = dat[i];
                    ++lf[dat[i]];
                }
            }
        }
        for (i = Math.max(i, wi); i < s; ++i) {
            syms[li++] = dat[i];
            ++lf[dat[i]];
        }
        pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
        if (!lst) {
            st.r = (pos & 7) | w[(pos / 8) | 0] << 3;
            // shft(pos) now 1 less if pos & 7 != 0
            pos -= 7;
            st.h = head, st.p = prev, st.i = i, st.w = wi;
        }
    }
    else {
        for (var i = st.w || 0; i < s + lst; i += 65535) {
            // end
            var e = i + 65535;
            if (e >= s) {
                // write final block
                w[(pos / 8) | 0] = lst;
                e = s;
            }
            pos = wfblk(w, pos + 1, dat.subarray(i, e));
        }
        st.i = s;
    }
    return slc(o, 0, pre + shft(pos) + post);
};
// CRC32 table
var crct = /*#__PURE__*/ (function () {
    var t = new Int32Array(256);
    for (var i = 0; i < 256; ++i) {
        var c = i, k = 9;
        while (--k)
            c = ((c & 1) && -306674912) ^ (c >>> 1);
        t[i] = c;
    }
    return t;
})();
// CRC32
var crc = function () {
    var c = -1;
    return {
        p: function (d) {
            // closures have awful performance
            var cr = c;
            for (var i = 0; i < d.length; ++i)
                cr = crct[(cr & 255) ^ d[i]] ^ (cr >>> 8);
            c = cr;
        },
        d: function () { return ~c; }
    };
};
// Adler32
var adler = function () {
    var a = 1, b = 0;
    return {
        p: function (d) {
            // closures have awful performance
            var n = a, m = b;
            var l = d.length | 0;
            for (var i = 0; i != l;) {
                var e = Math.min(i + 2655, l);
                for (; i < e; ++i)
                    m += n += d[i];
                n = (n & 65535) + 15 * (n >> 16), m = (m & 65535) + 15 * (m >> 16);
            }
            a = n, b = m;
        },
        d: function () {
            a %= 65521, b %= 65521;
            return (a & 255) << 24 | (a & 0xFF00) << 8 | (b & 255) << 8 | (b >> 8);
        }
    };
};
;
// deflate with opts
var dopt = function (dat, opt, pre, post, st) {
    if (!st) {
        st = { l: 1 };
        if (opt.dictionary) {
            var dict = opt.dictionary.subarray(-32768);
            var newDat = new u8(dict.length + dat.length);
            newDat.set(dict);
            newDat.set(dat, dict.length);
            dat = newDat;
            st.w = dict.length;
        }
    }
    return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? (st.l ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 20) : (12 + opt.mem), pre, post, st);
};
// Walmart object spread
var mrg = function (a, b) {
    var o = {};
    for (var k in a)
        o[k] = a[k];
    for (var k in b)
        o[k] = b[k];
    return o;
};
// worker clone
// This is possibly the craziest part of the entire codebase, despite how simple it may seem.
// The only parameter to this function is a closure that returns an array of variables outside of the function scope.
// We're going to try to figure out the variable names used in the closure as strings because that is crucial for workerization.
// We will return an object mapping of true variable name to value (basically, the current scope as a JS object).
// The reason we can't just use the original variable names is minifiers mangling the toplevel scope.
// This took me three weeks to figure out how to do.
var wcln = function (fn, fnStr, td) {
    var dt = fn();
    var st = fn.toString();
    var ks = st.slice(st.indexOf('[') + 1, st.lastIndexOf(']')).replace(/\s+/g, '').split(',');
    for (var i = 0; i < dt.length; ++i) {
        var v = dt[i], k = ks[i];
        if (typeof v == 'function') {
            fnStr += ';' + k + '=';
            var st_1 = v.toString();
            if (v.prototype) {
                // for global objects
                if (st_1.indexOf('[native code]') != -1) {
                    var spInd = st_1.indexOf(' ', 8) + 1;
                    fnStr += st_1.slice(spInd, st_1.indexOf('(', spInd));
                }
                else {
                    fnStr += st_1;
                    for (var t in v.prototype)
                        fnStr += ';' + k + '.prototype.' + t + '=' + v.prototype[t].toString();
                }
            }
            else
                fnStr += st_1;
        }
        else
            td[k] = v;
    }
    return fnStr;
};
var ch = [];
// clone bufs
var cbfs = function (v) {
    var tl = [];
    for (var k in v) {
        if (v[k].buffer) {
            tl.push((v[k] = new v[k].constructor(v[k])).buffer);
        }
    }
    return tl;
};
// use a worker to execute code
var wrkr = function (fns, init, id, cb) {
    if (!ch[id]) {
        var fnStr = '', td_1 = {}, m = fns.length - 1;
        for (var i = 0; i < m; ++i)
            fnStr = wcln(fns[i], fnStr, td_1);
        ch[id] = { c: wcln(fns[m], fnStr, td_1), e: td_1 };
    }
    var td = mrg({}, ch[id].e);
    return (0, node_worker_1.default)(ch[id].c + ';onmessage=function(e){for(var k in e.data)self[k]=e.data[k];onmessage=' + init.toString() + '}', id, td, cbfs(td), cb);
};
// base async inflate fn
var bInflt = function () { return [u8, u16, i32, fleb, fdeb, clim, fl, fd, flrm, fdrm, rev, ec, hMap, max, bits, bits16, shft, slc, err, inflt, inflateSync, pbf, gopt]; };
var bDflt = function () { return [u8, u16, i32, fleb, fdeb, clim, revfl, revfd, flm, flt, fdm, fdt, rev, deo, et, hMap, wbits, wbits16, hTree, ln, lc, clen, wfblk, wblk, shft, slc, dflt, dopt, deflateSync, pbf]; };
// gzip extra
var gze = function () { return [gzh, gzhl, wbytes, crc, crct]; };
// gunzip extra
var guze = function () { return [gzs, gzl]; };
// zlib extra
var zle = function () { return [zlh, wbytes, adler]; };
// unzlib extra
var zule = function () { return [zls]; };
// post buf
var pbf = function (msg) { return postMessage(msg, [msg.buffer]); };
// get opts
var gopt = function (o) { return o && {
    out: o.size && new u8(o.size),
    dictionary: o.dictionary
}; };
// async helper
var cbify = function (dat, opts, fns, init, id, cb) {
    var w = wrkr(fns, init, id, function (err, dat) {
        w.terminate();
        cb(err, dat);
    });
    w.postMessage([dat, opts], opts.consume ? [dat.buffer] : []);
    return function () { w.terminate(); };
};
// auto stream
var astrm = function (strm) {
    strm.ondata = function (dat, final) { return postMessage([dat, final], [dat.buffer]); };
    return function (ev) {
        if (ev.data[0]) {
            strm.push(ev.data[0], ev.data[1]);
            postMessage([ev.data[0].length]);
        }
        else
            strm.flush(ev.data[1]);
    };
};
// async stream attach
var astrmify = function (fns, strm, opts, init, id, flush, ext) {
    var t;
    var w = wrkr(fns, init, id, function (err, dat) {
        if (err)
            w.terminate(), strm.ondata.call(strm, err);
        else if (!Array.isArray(dat))
            ext(dat);
        else if (dat.length == 1) {
            strm.queuedSize -= dat[0];
            if (strm.ondrain)
                strm.ondrain(dat[0]);
        }
        else {
            if (dat[1])
                w.terminate();
            strm.ondata.call(strm, err, dat[0], dat[1]);
        }
    });
    w.postMessage(opts);
    strm.queuedSize = 0;
    strm.push = function (d, f) {
        if (!strm.ondata)
            err(5);
        if (t)
            strm.ondata(err(4, 0, 1), null, !!f);
        strm.queuedSize += d.length;
        // can fail for cross-realm Uint8Array, but ok - only a small performance penalty
        w.postMessage([d, t = f], d.buffer instanceof ArrayBuffer ? [d.buffer] : []);
    };
    strm.terminate = function () { w.terminate(); };
    if (flush) {
        strm.flush = function (sync) { w.postMessage([0, sync]); };
    }
};
// read 2 bytes
var b2 = function (d, b) { return d[b] | (d[b + 1] << 8); };
// read 4 bytes
var b4 = function (d, b) { return (d[b] | (d[b + 1] << 8) | (d[b + 2] << 16) | (d[b + 3] << 24)) >>> 0; };
// read 8 bytes
var b8 = function (d, b) { return b4(d, b) + (b4(d, b + 4) * 4294967296); };
// write bytes
var wbytes = function (d, b, v) {
    for (; v; ++b)
        d[b] = v, v >>>= 8;
};
// gzip header
var gzh = function (c, o) {
    var fn = o.filename;
    c[0] = 31, c[1] = 139, c[2] = 8, c[8] = o.level < 2 ? 4 : o.level == 9 ? 2 : 0, c[9] = 3; // assume Unix
    if (o.mtime != 0)
        wbytes(c, 4, Math.floor(new Date(o.mtime || Date.now()) / 1000));
    if (fn) {
        c[3] = 8;
        for (var i = 0; i <= fn.length; ++i)
            c[i + 10] = fn.charCodeAt(i);
    }
};
// gzip footer: -8 to -4 = CRC, -4 to -0 is length
// gzip start
var gzs = function (d) {
    if (d[0] != 31 || d[1] != 139 || d[2] != 8)
        err(6, 'invalid gzip data');
    var flg = d[3];
    var st = 10;
    if (flg & 4)
        st += (d[10] | d[11] << 8) + 2;
    for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
        ;
    return st + (flg & 2);
};
// gzip length
var gzl = function (d) {
    var l = d.length;
    return (d[l - 4] | d[l - 3] << 8 | d[l - 2] << 16 | d[l - 1] << 24) >>> 0;
};
// gzip header length
var gzhl = function (o) { return 10 + (o.filename ? o.filename.length + 1 : 0); };
// zlib header
var zlh = function (c, o) {
    var lv = o.level, fl = lv == 0 ? 0 : lv < 6 ? 1 : lv == 9 ? 3 : 2;
    c[0] = 120, c[1] = (fl << 6) | (o.dictionary && 32);
    c[1] |= 31 - ((c[0] << 8) | c[1]) % 31;
    if (o.dictionary) {
        var h = adler();
        h.p(o.dictionary);
        wbytes(c, 2, h.d());
    }
};
// zlib start
var zls = function (d, dict) {
    if ((d[0] & 15) != 8 || (d[0] >> 4) > 7 || ((d[0] << 8 | d[1]) % 31))
        err(6, 'invalid zlib data');
    if ((d[1] >> 5 & 1) == +!dict)
        err(6, 'invalid zlib data: ' + (d[1] & 32 ? 'need' : 'unexpected') + ' dictionary');
    return (d[1] >> 3 & 4) + 2;
};
function StrmOpt(opts, cb) {
    if (typeof opts == 'function')
        cb = opts, opts = {};
    this.ondata = cb;
    return opts;
}
/**
 * Streaming DEFLATE compression
 */
var Deflate = /*#__PURE__*/ (function () {
    function Deflate(opts, cb) {
        if (typeof opts == 'function')
            cb = opts, opts = {};
        this.ondata = cb;
        this.o = opts || {};
        this.s = { l: 0, i: 32768, w: 32768, z: 32768 };
        // Buffer length must always be 0 mod 32768 for index calculations to be correct when modifying head and prev
        // 98304 = 32768 (lookback) + 65536 (common chunk size)
        this.b = new u8(98304);
        if (this.o.dictionary) {
            var dict = this.o.dictionary.subarray(-32768);
            this.b.set(dict, 32768 - dict.length);
            this.s.i = 32768 - dict.length;
        }
    }
    Deflate.prototype.p = function (c, f) {
        this.ondata(dopt(c, this.o, 0, 0, this.s), f);
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Deflate.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (this.s.l)
            err(4);
        var endLen = chunk.length + this.s.z;
        if (endLen > this.b.length) {
            if (endLen > 2 * this.b.length - 32768) {
                var newBuf = new u8(endLen & -32768);
                newBuf.set(this.b.subarray(0, this.s.z));
                this.b = newBuf;
            }
            var split = this.b.length - this.s.z;
            this.b.set(chunk.subarray(0, split), this.s.z);
            this.s.z = this.b.length;
            this.p(this.b, false);
            this.b.set(this.b.subarray(-32768));
            this.b.set(chunk.subarray(split), 32768);
            this.s.z = chunk.length - split + 32768;
            this.s.i = 32766, this.s.w = 32768;
        }
        else {
            this.b.set(chunk, this.s.z);
            this.s.z += chunk.length;
        }
        this.s.l = final & 1;
        if (this.s.z > this.s.w + 8191 || final) {
            this.p(this.b, final || false);
            this.s.w = this.s.i, this.s.i -= 2;
        }
        if (final) {
            // cleanup unneeded buffers/state to reduce memory usage
            this.s = this.o = {};
            this.b = et;
        }
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * deflated output for small inputs.
     * @param sync Whether to flush to a byte boundary. A sync flush takes 4-5
     *             extra bytes, but guarantees all pushed data is immediately
     *             decompressible. A separate DEFLATE stream may be concatenated
     *             with the current output after a sync flush.
     */
    Deflate.prototype.flush = function (sync) {
        if (!this.ondata)
            err(5);
        if (this.s.l)
            err(4);
        this.p(this.b, false);
        this.s.w = this.s.i, this.s.i -= 2;
        // could technically skip writing the type-0 block for (this.s.r & 7) == 0,
        // but the deterministic trailer (00 00 FF FF) is useful in some situations
        if (sync) {
            var c = new u8(6);
            c[0] = this.s.r >> 3;
            // write empty, non-final type-0 block
            var ep = wfblk(c, this.s.r, et);
            this.s.r = 0;
            this.ondata(c.subarray(0, ep >> 3), false);
        }
    };
    return Deflate;
}());
exports.Deflate = Deflate;
/**
 * Asynchronous streaming DEFLATE compression
 */
var AsyncDeflate = /*#__PURE__*/ (function () {
    function AsyncDeflate(opts, cb) {
        astrmify([
            bDflt,
            function () { return [astrm, Deflate]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Deflate(ev.data);
            onmessage = astrm(strm);
        }, 6, 1);
    }
    return AsyncDeflate;
}());
exports.AsyncDeflate = AsyncDeflate;
function deflate(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
    ], function (ev) { return pbf(deflateSync(ev.data[0], ev.data[1])); }, 0, cb);
}
/**
 * Compresses data with DEFLATE without any wrapper
 * @param data The data to compress
 * @param opts The compression options
 * @returns The deflated version of the data
 */
function deflateSync(data, opts) {
    return dopt(data, opts || {}, 0, 0);
}
/**
 * Streaming DEFLATE decompression
 */
var Inflate = /*#__PURE__*/ (function () {
    function Inflate(opts, cb) {
        // no StrmOpt here to avoid adding to workerizer
        if (typeof opts == 'function')
            cb = opts, opts = {};
        this.ondata = cb;
        var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
        this.s = { i: 0, b: dict ? dict.length : 0 };
        this.o = new u8(32768);
        this.p = new u8(0);
        if (dict)
            this.o.set(dict);
    }
    Inflate.prototype.e = function (c) {
        if (!this.ondata)
            err(5);
        if (this.d)
            err(4);
        if (!this.p.length)
            this.p = c;
        else if (c.length) {
            var n = new u8(this.p.length + c.length);
            n.set(this.p), n.set(c, this.p.length), this.p = n;
        }
    };
    Inflate.prototype.c = function (final) {
        this.s.i = +(this.d = final || false);
        var bts = this.s.b;
        var dt = inflt(this.p, this.s, this.o);
        this.ondata(slc(dt, bts, this.s.b), this.d);
        this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length;
        this.p = slc(this.p, (this.s.p / 8) | 0), this.s.p &= 7;
    };
    /**
     * Pushes a chunk to be inflated
     * @param chunk The chunk to push
     * @param final Whether this is the final chunk
     */
    Inflate.prototype.push = function (chunk, final) {
        this.e(chunk), this.c(final);
    };
    return Inflate;
}());
exports.Inflate = Inflate;
/**
 * Asynchronous streaming DEFLATE decompression
 */
var AsyncInflate = /*#__PURE__*/ (function () {
    function AsyncInflate(opts, cb) {
        astrmify([
            bInflt,
            function () { return [astrm, Inflate]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Inflate(ev.data);
            onmessage = astrm(strm);
        }, 7, 0);
    }
    return AsyncInflate;
}());
exports.AsyncInflate = AsyncInflate;
function inflate(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt
    ], function (ev) { return pbf(inflateSync(ev.data[0], gopt(ev.data[1]))); }, 1, cb);
}
function inflateSync(data, opts) {
    return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
// before you yell at me for not just using extends, my reason is that TS inheritance is hard to workerize.
/**
 * Streaming GZIP compression
 */
var Gzip = /*#__PURE__*/ (function () {
    function Gzip(opts, cb) {
        this.c = crc();
        this.l = 0;
        this.v = 1;
        Deflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be GZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Gzip.prototype.push = function (chunk, final) {
        this.c.p(chunk);
        this.l += chunk.length;
        Deflate.prototype.push.call(this, chunk, final);
    };
    Gzip.prototype.p = function (c, f) {
        var raw = dopt(c, this.o, this.v && gzhl(this.o), f && 8, this.s);
        if (this.v)
            gzh(raw, this.o), this.v = 0;
        if (f)
            wbytes(raw, raw.length - 8, this.c.d()), wbytes(raw, raw.length - 4, this.l);
        this.ondata(raw, f);
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * GZIPped output for small inputs.
     * @param sync Whether to flush to a byte boundary. A sync flush takes 4-5
     *             extra bytes, but guarantees all pushed data is immediately
     *             decompressible.
     */
    Gzip.prototype.flush = function (sync) {
        Deflate.prototype.flush.call(this, sync);
    };
    return Gzip;
}());
exports.Gzip = Gzip;
exports.Compress = Gzip;
/**
 * Asynchronous streaming GZIP compression
 */
var AsyncGzip = /*#__PURE__*/ (function () {
    function AsyncGzip(opts, cb) {
        astrmify([
            bDflt,
            gze,
            function () { return [astrm, Deflate, Gzip]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Gzip(ev.data);
            onmessage = astrm(strm);
        }, 8, 1);
    }
    return AsyncGzip;
}());
exports.AsyncGzip = AsyncGzip;
exports.AsyncCompress = AsyncGzip;
function gzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
        gze,
        function () { return [gzipSync]; }
    ], function (ev) { return pbf(gzipSync(ev.data[0], ev.data[1])); }, 2, cb);
}
/**
 * Compresses data with GZIP
 * @param data The data to compress
 * @param opts The compression options
 * @returns The gzipped version of the data
 */
function gzipSync(data, opts) {
    if (!opts)
        opts = {};
    var c = crc(), l = data.length;
    c.p(data);
    var d = dopt(data, opts, gzhl(opts), 8), s = d.length;
    return gzh(d, opts), wbytes(d, s - 8, c.d()), wbytes(d, s - 4, l), d;
}
/**
 * Streaming single or multi-member GZIP decompression
 */
var Gunzip = /*#__PURE__*/ (function () {
    function Gunzip(opts, cb) {
        this.v = 1;
        this.r = 0;
        Inflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be GUNZIPped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Gunzip.prototype.push = function (chunk, final) {
        Inflate.prototype.e.call(this, chunk);
        this.r += chunk.length;
        if (this.v) {
            var p = this.p.subarray(this.v - 1);
            var s = p.length > 3 ? gzs(p) : 4;
            if (s > p.length) {
                if (!final)
                    return;
            }
            else if (this.v > 1 && this.onmember) {
                this.onmember(this.r - p.length);
            }
            this.p = p.subarray(s), this.v = 0;
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        Inflate.prototype.c.call(this, 0);
        // process concatenated GZIP
        if (this.s.f && !this.s.l) {
            this.v = shft(this.s.p) + 9;
            this.s = { i: 0 };
            this.o = new u8(0);
            this.push(new u8(0), final);
        }
        else if (final) {
            Inflate.prototype.c.call(this, final);
        }
    };
    return Gunzip;
}());
exports.Gunzip = Gunzip;
/**
 * Asynchronous streaming single or multi-member GZIP decompression
 */
var AsyncGunzip = /*#__PURE__*/ (function () {
    function AsyncGunzip(opts, cb) {
        var _this = this;
        astrmify([
            bInflt,
            guze,
            function () { return [astrm, Inflate, Gunzip]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Gunzip(ev.data);
            strm.onmember = function (offset) { return postMessage(offset); };
            onmessage = astrm(strm);
        }, 9, 0, function (offset) { return _this.onmember && _this.onmember(offset); });
    }
    return AsyncGunzip;
}());
exports.AsyncGunzip = AsyncGunzip;
function gunzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt,
        guze,
        function () { return [gunzipSync]; }
    ], function (ev) { return pbf(gunzipSync(ev.data[0], ev.data[1])); }, 3, cb);
}
function gunzipSync(data, opts) {
    var st = gzs(data);
    if (st + 8 > data.length)
        err(6, 'invalid gzip data');
    return inflt(data.subarray(st, -8), { i: 2 }, opts && opts.out || new u8(gzl(data)), opts && opts.dictionary);
}
/**
 * Streaming Zlib compression
 */
var Zlib = /*#__PURE__*/ (function () {
    function Zlib(opts, cb) {
        this.c = adler();
        this.v = 1;
        Deflate.call(this, opts, cb);
    }
    /**
     * Pushes a chunk to be zlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Zlib.prototype.push = function (chunk, final) {
        this.c.p(chunk);
        Deflate.prototype.push.call(this, chunk, final);
    };
    Zlib.prototype.p = function (c, f) {
        var raw = dopt(c, this.o, this.v && (this.o.dictionary ? 6 : 2), f && 4, this.s);
        if (this.v)
            zlh(raw, this.o), this.v = 0;
        if (f)
            wbytes(raw, raw.length - 4, this.c.d());
        this.ondata(raw, f);
    };
    /**
     * Flushes buffered uncompressed data. Useful to immediately retrieve the
     * zlibbed output for small inputs.
     * @param sync Whether to flush to a byte boundary. A sync flush takes 4-5
     *             extra bytes, but guarantees all pushed data is immediately
     *             decompressible.
     */
    Zlib.prototype.flush = function (sync) {
        Deflate.prototype.flush.call(this, sync);
    };
    return Zlib;
}());
exports.Zlib = Zlib;
/**
 * Asynchronous streaming Zlib compression
 */
var AsyncZlib = /*#__PURE__*/ (function () {
    function AsyncZlib(opts, cb) {
        astrmify([
            bDflt,
            zle,
            function () { return [astrm, Deflate, Zlib]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Zlib(ev.data);
            onmessage = astrm(strm);
        }, 10, 1);
    }
    return AsyncZlib;
}());
exports.AsyncZlib = AsyncZlib;
function zlib(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bDflt,
        zle,
        function () { return [zlibSync]; }
    ], function (ev) { return pbf(zlibSync(ev.data[0], ev.data[1])); }, 4, cb);
}
/**
 * Compress data with Zlib
 * @param data The data to compress
 * @param opts The compression options
 * @returns The zlib-compressed version of the data
 */
function zlibSync(data, opts) {
    if (!opts)
        opts = {};
    var a = adler();
    a.p(data);
    var d = dopt(data, opts, opts.dictionary ? 6 : 2, 4);
    return zlh(d, opts), wbytes(d, d.length - 4, a.d()), d;
}
/**
 * Streaming Zlib decompression
 */
var Unzlib = /*#__PURE__*/ (function () {
    function Unzlib(opts, cb) {
        Inflate.call(this, opts, cb);
        this.v = opts && opts.dictionary ? 2 : 1;
    }
    /**
     * Pushes a chunk to be unzlibbed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Unzlib.prototype.push = function (chunk, final) {
        Inflate.prototype.e.call(this, chunk);
        if (this.v) {
            if (this.p.length < 6 && !final)
                return;
            this.p = this.p.subarray(zls(this.p, this.v - 1)), this.v = 0;
        }
        if (final) {
            if (this.p.length < 4)
                err(6, 'invalid zlib data');
            this.p = this.p.subarray(0, -4);
        }
        // necessary to prevent TS from using the closure value
        // This allows for workerization to function correctly
        Inflate.prototype.c.call(this, final);
    };
    return Unzlib;
}());
exports.Unzlib = Unzlib;
/**
 * Asynchronous streaming Zlib decompression
 */
var AsyncUnzlib = /*#__PURE__*/ (function () {
    function AsyncUnzlib(opts, cb) {
        astrmify([
            bInflt,
            zule,
            function () { return [astrm, Inflate, Unzlib]; }
        ], this, StrmOpt.call(this, opts, cb), function (ev) {
            var strm = new Unzlib(ev.data);
            onmessage = astrm(strm);
        }, 11, 0);
    }
    return AsyncUnzlib;
}());
exports.AsyncUnzlib = AsyncUnzlib;
function unzlib(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return cbify(data, opts, [
        bInflt,
        zule,
        function () { return [unzlibSync]; }
    ], function (ev) { return pbf(unzlibSync(ev.data[0], gopt(ev.data[1]))); }, 5, cb);
}
function unzlibSync(data, opts) {
    return inflt(data.subarray(zls(data, opts && opts.dictionary), -4), { i: 2 }, opts && opts.out, opts && opts.dictionary);
}
/**
 * Streaming GZIP, Zlib, or raw DEFLATE decompression
 */
var Decompress = /*#__PURE__*/ (function () {
    function Decompress(opts, cb) {
        this.o = StrmOpt.call(this, opts, cb) || {};
        this.G = Gunzip;
        this.I = Inflate;
        this.Z = Unzlib;
    }
    // init substream
    // overriden by AsyncDecompress
    Decompress.prototype.i = function () {
        var _this = this;
        this.s.ondata = function (dat, final) {
            _this.ondata(dat, final);
        };
    };
    /**
     * Pushes a chunk to be decompressed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Decompress.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (!this.s) {
            if (this.p && this.p.length) {
                var n = new u8(this.p.length + chunk.length);
                n.set(this.p), n.set(chunk, this.p.length);
            }
            else
                this.p = chunk;
            if (this.p.length > 2) {
                this.s = (this.p[0] == 31 && this.p[1] == 139 && this.p[2] == 8)
                    ? new this.G(this.o)
                    : ((this.p[0] & 15) != 8 || (this.p[0] >> 4) > 7 || ((this.p[0] << 8 | this.p[1]) % 31))
                        ? new this.I(this.o)
                        : new this.Z(this.o);
                this.i();
                this.s.push(this.p, final);
                this.p = null;
            }
        }
        else
            this.s.push(chunk, final);
    };
    return Decompress;
}());
exports.Decompress = Decompress;
/**
 * Asynchronous streaming GZIP, Zlib, or raw DEFLATE decompression
 */
var AsyncDecompress = /*#__PURE__*/ (function () {
    function AsyncDecompress(opts, cb) {
        Decompress.call(this, opts, cb);
        this.queuedSize = 0;
        this.G = AsyncGunzip;
        this.I = AsyncInflate;
        this.Z = AsyncUnzlib;
    }
    AsyncDecompress.prototype.i = function () {
        var _this = this;
        this.s.ondata = function (err, dat, final) {
            _this.ondata(err, dat, final);
        };
        this.s.ondrain = function (size) {
            _this.queuedSize -= size;
            if (_this.ondrain)
                _this.ondrain(size);
        };
    };
    /**
     * Pushes a chunk to be decompressed
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    AsyncDecompress.prototype.push = function (chunk, final) {
        this.queuedSize += chunk.length;
        Decompress.prototype.push.call(this, chunk, final);
    };
    return AsyncDecompress;
}());
exports.AsyncDecompress = AsyncDecompress;
function decompress(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzip(data, opts, cb)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflate(data, opts, cb)
            : unzlib(data, opts, cb);
}
/**
 * Expands compressed GZIP, Zlib, or raw DEFLATE data, automatically detecting the format
 * @param data The data to decompress
 * @param opts The decompression options
 * @returns The decompressed version of the data
 */
function decompressSync(data, opts) {
    return (data[0] == 31 && data[1] == 139 && data[2] == 8)
        ? gunzipSync(data, opts)
        : ((data[0] & 15) != 8 || (data[0] >> 4) > 7 || ((data[0] << 8 | data[1]) % 31))
            ? inflateSync(data, opts)
            : unzlibSync(data, opts);
}
// flatten a directory structure
var fltn = function (d, p, t, o) {
    for (var k in d) {
        var val = d[k], n = p + k, op = o;
        if (Array.isArray(val))
            op = mrg(o, val[1]), val = val[0];
        if (ArrayBuffer.isView(val))
            t[n] = [val, op];
        else {
            t[n += '/'] = [new u8(0), op];
            fltn(val, n, t, o);
        }
    }
};
// text encoder
var te = typeof TextEncoder != 'undefined' && /*#__PURE__*/ new TextEncoder();
// text decoder
var td = typeof TextDecoder != 'undefined' && /*#__PURE__*/ new TextDecoder();
// text decoder stream
var tds = 0;
try {
    td.decode(et, { stream: true });
    tds = 1;
}
catch (e) { }
// decode UTF8
var dutf8 = function (d) {
    for (var r = '', i = 0;;) {
        var c = d[i++];
        var eb = (c > 127) + (c > 223) + (c > 239);
        if (i + eb > d.length)
            return { s: r, r: slc(d, i - 1) };
        if (!eb)
            r += String.fromCharCode(c);
        else if (eb == 3) {
            c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63)) - 65536,
                r += String.fromCharCode(55296 | (c >> 10), 56320 | (c & 1023));
        }
        else if (eb & 1)
            r += String.fromCharCode((c & 31) << 6 | (d[i++] & 63));
        else
            r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | (d[i++] & 63));
    }
};
/**
 * Streaming UTF-8 decoding
 */
var DecodeUTF8 = /*#__PURE__*/ (function () {
    /**
     * Creates a UTF-8 decoding stream
     * @param cb The callback to call whenever data is decoded
     */
    function DecodeUTF8(cb) {
        this.ondata = cb;
        if (tds)
            this.t = new TextDecoder();
        else
            this.p = et;
    }
    /**
     * Pushes a chunk to be decoded from UTF-8 binary
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    DecodeUTF8.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        final = !!final;
        if (this.t) {
            this.ondata(this.t.decode(chunk, { stream: true }), final);
            if (final) {
                if (this.t.decode().length)
                    err(8);
                this.t = null;
            }
            return;
        }
        if (!this.p)
            err(4);
        var dat = new u8(this.p.length + chunk.length);
        dat.set(this.p);
        dat.set(chunk, this.p.length);
        var _a = dutf8(dat), s = _a.s, r = _a.r;
        if (final) {
            if (r.length)
                err(8);
            this.p = null;
        }
        else
            this.p = r;
        this.ondata(s, final);
    };
    return DecodeUTF8;
}());
exports.DecodeUTF8 = DecodeUTF8;
/**
 * Streaming UTF-8 encoding
 */
var EncodeUTF8 = /*#__PURE__*/ (function () {
    /**
     * Creates a UTF-8 decoding stream
     * @param cb The callback to call whenever data is encoded
     */
    function EncodeUTF8(cb) {
        this.ondata = cb;
    }
    /**
     * Pushes a chunk to be encoded to UTF-8
     * @param chunk The string data to push
     * @param final Whether this is the last chunk
     */
    EncodeUTF8.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        if (this.d)
            err(4);
        this.ondata(strToU8(chunk), this.d = final || false);
    };
    return EncodeUTF8;
}());
exports.EncodeUTF8 = EncodeUTF8;
/**
 * Converts a string into a Uint8Array for use with compression/decompression methods
 * @param str The string to encode
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless decoding a binary string.
 * @returns The string encoded in UTF-8/Latin-1 binary
 */
function strToU8(str, latin1) {
    if (latin1) {
        var ar_1 = new u8(str.length);
        for (var i = 0; i < str.length; ++i)
            ar_1[i] = str.charCodeAt(i);
        return ar_1;
    }
    if (te)
        return te.encode(str);
    var l = str.length;
    var ar = new u8(str.length + (str.length >> 1));
    var ai = 0;
    var w = function (v) { ar[ai++] = v; };
    for (var i = 0; i < l; ++i) {
        if (ai + 5 > ar.length) {
            var n = new u8(ai + 8 + ((l - i) << 1));
            n.set(ar);
            ar = n;
        }
        var c = str.charCodeAt(i);
        if (c < 128 || latin1)
            w(c);
        else if (c < 2048)
            w(192 | (c >> 6)), w(128 | (c & 63));
        else if (c > 55295 && c < 57344)
            c = 65536 + (c & 1023 << 10) | (str.charCodeAt(++i) & 1023),
                w(240 | (c >> 18)), w(128 | ((c >> 12) & 63)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
        else
            w(224 | (c >> 12)), w(128 | ((c >> 6) & 63)), w(128 | (c & 63));
    }
    return slc(ar, 0, ai);
}
/**
 * Converts a Uint8Array to a string
 * @param dat The data to decode to string
 * @param latin1 Whether or not to interpret the data as Latin-1. This should
 *               not need to be true unless encoding to binary string.
 * @returns The original UTF-8/Latin-1 string
 */
function strFromU8(dat, latin1) {
    if (latin1) {
        var r = '';
        for (var i = 0; i < dat.length; i += 16384)
            r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
        return r;
    }
    else if (td) {
        return td.decode(dat);
    }
    else {
        var _a = dutf8(dat), s = _a.s, r = _a.r;
        if (r.length)
            err(8);
        return s;
    }
}
;
// deflate bit flag
var dbf = function (l) { return l == 1 ? 3 : l < 6 ? 2 : l == 9 ? 1 : 0; };
// skip local zip header
var slzh = function (d, b) { return b + 30 + b2(d, b + 26) + b2(d, b + 28); };
// read zip header
var zh = function (d, b, z) {
    var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
    var _a = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a[0], su = _a[1], off = _a[2];
    return [b2(d, b + 10), sc, su, fn, es + efl + b2(d, b + 32), off];
};
// read zip64 header sizes
var z64hs = function (d, b, l, z, sc, su, off) {
    var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
    var nf = nsc + nsu + noff;
    if (z && nf) {
        for (; b + 4 < e; b += 4 + b2(d, b + 2)) {
            if (b2(d, b) == 1) {
                return [
                    nsc ? b8(d, b + 4 + 8 * nsu) : sc,
                    nsu ? b8(d, b + 4) : su,
                    noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
                    1
                ];
            }
        }
        // z == 2 for unknown whether or not zip64
        if (z < 2)
            err(13);
    }
    return [sc, su, off, 0];
};
// extra field length
var exfl = function (ex) {
    var le = 0;
    if (ex) {
        for (var k in ex) {
            var l = ex[k].length;
            if (l > 65535)
                err(9);
            le += l + 4;
        }
    }
    return le;
};
// write zip header
var wzh = function (d, b, f, fn, u, c, ce, co) {
    var fl = fn.length, ex = f.extra, col = co && co.length;
    var exl = exfl(ex);
    wbytes(d, b, ce != null ? 0x2014B50 : 0x4034B50), b += 4;
    if (ce != null)
        d[b++] = 20, d[b++] = f.os;
    d[b] = 20, b += 2; // spec compliance? what's that?
    d[b++] = (f.flag << 1) | (c < 0 && 8), d[b++] = u && 8;
    d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
    var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
    if (y < 0 || y > 119)
        err(10);
    wbytes(d, b, (y << 25) | ((dt.getMonth() + 1) << 21) | (dt.getDate() << 16) | (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1)), b += 4;
    if (c != -1) {
        wbytes(d, b, f.crc);
        wbytes(d, b + 4, c < 0 ? -c - 2 : c);
        wbytes(d, b + 8, f.size);
    }
    wbytes(d, b + 12, fl);
    wbytes(d, b + 14, exl), b += 16;
    if (ce != null) {
        wbytes(d, b, col);
        wbytes(d, b + 6, f.attrs);
        wbytes(d, b + 10, ce), b += 14;
    }
    d.set(fn, b);
    b += fl;
    if (exl) {
        for (var k in ex) {
            var exf = ex[k], l = exf.length;
            wbytes(d, b, +k);
            wbytes(d, b + 2, l);
            d.set(exf, b + 4), b += 4 + l;
        }
    }
    if (col)
        d.set(co, b), b += col;
    return b;
};
// write zip footer (end of central directory)
var wzf = function (o, b, c, d, e) {
    wbytes(o, b, 0x6054B50); // skip disk
    wbytes(o, b + 8, c);
    wbytes(o, b + 10, c);
    wbytes(o, b + 12, d);
    wbytes(o, b + 16, e);
};
/**
 * A pass-through stream to keep data uncompressed in a ZIP archive.
 */
var ZipPassThrough = /*#__PURE__*/ (function () {
    /**
     * Creates a pass-through stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     */
    function ZipPassThrough(filename) {
        this.filename = filename;
        this.c = crc();
        this.size = 0;
        this.compression = 0;
    }
    /**
     * Processes a chunk and pushes to the output stream. You can override this
     * method in a subclass for custom behavior, but by default this passes
     * the data through. You must call this.ondata(err, chunk, final) at some
     * point in this method.
     * @param chunk The chunk to process
     * @param final Whether this is the last chunk
     */
    ZipPassThrough.prototype.process = function (chunk, final) {
        this.ondata(null, chunk, final);
    };
    /**
     * Pushes a chunk to be added. If you are subclassing this with a custom
     * compression algorithm, note that you must push data from the source
     * file only, pre-compression.
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    ZipPassThrough.prototype.push = function (chunk, final) {
        if (!this.ondata)
            err(5);
        this.c.p(chunk);
        this.size += chunk.length;
        if (final)
            this.crc = this.c.d();
        // we shouldn't really do this cast, but properly handling ArrayBufferLike
        // makes the API unergonomic with Buffer
        this.process(chunk, final || false);
    };
    return ZipPassThrough;
}());
exports.ZipPassThrough = ZipPassThrough;
// I don't extend because TypeScript extension adds 1kB of runtime bloat
/**
 * Streaming DEFLATE compression for ZIP archives. Prefer using AsyncZipDeflate
 * for better performance
 */
var ZipDeflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    function ZipDeflate(filename, opts) {
        var _this = this;
        if (!opts)
            opts = {};
        ZipPassThrough.call(this, filename);
        this.d = new Deflate(opts, function (dat, final) {
            _this.ondata(null, dat, final);
        });
        this.compression = 8;
        this.flag = dbf(opts.level);
    }
    ZipDeflate.prototype.process = function (chunk, final) {
        try {
            this.d.push(chunk, final);
        }
        catch (e) {
            this.ondata(e, null, final);
        }
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    ZipDeflate.prototype.push = function (chunk, final) {
        ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return ZipDeflate;
}());
exports.ZipDeflate = ZipDeflate;
/**
 * Asynchronous streaming DEFLATE compression for ZIP archives
 */
var AsyncZipDeflate = /*#__PURE__*/ (function () {
    /**
     * Creates an asynchronous DEFLATE stream that can be added to ZIP archives
     * @param filename The filename to associate with this data stream
     * @param opts The compression options
     */
    function AsyncZipDeflate(filename, opts) {
        var _this = this;
        if (!opts)
            opts = {};
        ZipPassThrough.call(this, filename);
        this.d = new AsyncDeflate(opts, function (err, dat, final) {
            _this.ondata(err, dat, final);
        });
        this.compression = 8;
        this.flag = dbf(opts.level);
        this.terminate = this.d.terminate;
    }
    AsyncZipDeflate.prototype.process = function (chunk, final) {
        this.d.push(chunk, final);
    };
    /**
     * Pushes a chunk to be deflated
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    AsyncZipDeflate.prototype.push = function (chunk, final) {
        ZipPassThrough.prototype.push.call(this, chunk, final);
    };
    return AsyncZipDeflate;
}());
exports.AsyncZipDeflate = AsyncZipDeflate;
// TODO: Better tree shaking
/**
 * A zippable archive to which files can incrementally be added
 */
var Zip = /*#__PURE__*/ (function () {
    /**
     * Creates an empty ZIP archive to which files can be added
     * @param cb The callback to call whenever data for the generated ZIP archive
     *           is available
     */
    function Zip(cb) {
        this.ondata = cb;
        this.u = [];
        this.d = 1;
    }
    /**
     * Adds a file to the ZIP archive
     * @param file The file stream to add
     */
    Zip.prototype.add = function (file) {
        var _this = this;
        if (!this.ondata)
            err(5);
        // finishing or finished
        if (this.d & 2)
            this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, false);
        else {
            var f = strToU8(file.filename), fl_1 = f.length;
            var com = file.comment, o = com && strToU8(com);
            var u = fl_1 != file.filename.length || (o && (com.length != o.length));
            var hl_1 = fl_1 + exfl(file.extra) + 30;
            if (fl_1 > 65535)
                this.ondata(err(11, 0, 1), null, false);
            var header = new u8(hl_1);
            wzh(header, 0, file, f, u, -1);
            var chks_1 = [header];
            var pAll_1 = function () {
                for (var _i = 0, chks_2 = chks_1; _i < chks_2.length; _i++) {
                    var chk = chks_2[_i];
                    _this.ondata(null, chk, false);
                }
                chks_1 = [];
            };
            var tr_1 = this.d;
            this.d = 0;
            var ind_1 = this.u.length;
            var uf_1 = mrg(file, {
                f: f,
                u: u,
                o: o,
                t: function () {
                    if (file.terminate)
                        file.terminate();
                },
                r: function () {
                    pAll_1();
                    if (tr_1) {
                        var nxt = _this.u[ind_1 + 1];
                        if (nxt)
                            nxt.r();
                        else
                            _this.d = 1;
                    }
                    tr_1 = 1;
                }
            });
            var cl_1 = 0;
            file.ondata = function (err, dat, final) {
                if (err) {
                    _this.ondata(err, dat, final);
                    _this.terminate();
                }
                else {
                    cl_1 += dat.length;
                    chks_1.push(dat);
                    if (final) {
                        var dd = new u8(16);
                        wbytes(dd, 0, 0x8074B50);
                        wbytes(dd, 4, file.crc);
                        wbytes(dd, 8, cl_1);
                        wbytes(dd, 12, file.size);
                        chks_1.push(dd);
                        uf_1.c = cl_1, uf_1.b = hl_1 + cl_1 + 16, uf_1.crc = file.crc, uf_1.size = file.size;
                        if (tr_1)
                            uf_1.r();
                        tr_1 = 1;
                    }
                    else if (tr_1)
                        pAll_1();
                }
            };
            this.u.push(uf_1);
        }
    };
    /**
     * Ends the process of adding files and prepares to emit the final chunks.
     * This *must* be called after adding all desired files for the resulting
     * ZIP file to work properly.
     */
    Zip.prototype.end = function () {
        var _this = this;
        if (this.d & 2) {
            this.ondata(err(4 + (this.d & 1) * 8, 0, 1), null, true);
            return;
        }
        if (this.d)
            this.e();
        else
            this.u.push({
                r: function () {
                    if (!(_this.d & 1))
                        return;
                    _this.u.splice(-1, 1);
                    _this.e();
                },
                t: function () { }
            });
        this.d = 3;
    };
    Zip.prototype.e = function () {
        var bt = 0, l = 0, tl = 0;
        for (var _i = 0, _a = this.u; _i < _a.length; _i++) {
            var f = _a[_i];
            tl += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0);
        }
        var out = new u8(tl + 22);
        for (var _b = 0, _c = this.u; _b < _c.length; _b++) {
            var f = _c[_b];
            wzh(out, bt, f, f.f, f.u, -f.c - 2, l, f.o);
            bt += 46 + f.f.length + exfl(f.extra) + (f.o ? f.o.length : 0), l += f.b;
        }
        wzf(out, bt, this.u.length, tl, l);
        this.ondata(null, out, true);
        this.d = 2;
    };
    /**
     * A method to terminate any internal workers used by the stream. Subsequent
     * calls to add() will fail.
     */
    Zip.prototype.terminate = function () {
        for (var _i = 0, _a = this.u; _i < _a.length; _i++) {
            var f = _a[_i];
            f.t();
        }
        this.d = 2;
    };
    return Zip;
}());
exports.Zip = Zip;
function zip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    var r = {};
    fltn(data, '', r, opts);
    var k = Object.keys(r);
    var lft = k.length, o = 0, tot = 0;
    var slft = lft, files = new Array(lft);
    var term = [];
    var tAll = function () {
        for (var i = 0; i < term.length; ++i)
            term[i]();
    };
    var cbd = function (a, b) {
        mt(function () { cb(a, b); });
    };
    mt(function () { cbd = cb; });
    var cbf = function () {
        var out = new u8(tot + 22), oe = o, cdl = tot - o;
        tot = 0;
        for (var i = 0; i < slft; ++i) {
            var f = files[i];
            try {
                var l = f.c.length;
                wzh(out, tot, f, f.f, f.u, l);
                var badd = 30 + f.f.length + exfl(f.extra);
                var loc = tot + badd;
                out.set(f.c, loc);
                wzh(out, o, f, f.f, f.u, l, tot, f.m), o += 16 + badd + (f.m ? f.m.length : 0), tot = loc + l;
            }
            catch (e) {
                return cbd(e, null);
            }
        }
        wzf(out, o, files.length, cdl, oe);
        cbd(null, out);
    };
    if (!lft)
        cbf();
    var _loop_1 = function (i) {
        var fn = k[i];
        var _a = r[fn], file = _a[0], p = _a[1];
        var c = crc(), size = file.length;
        c.p(file);
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        var compression = p.level == 0 ? 0 : 8;
        var cbl = function (e, d) {
            if (e) {
                tAll();
                cbd(e, null);
            }
            else {
                var l = d.length;
                files[i] = mrg(p, {
                    size: size,
                    crc: c.d(),
                    c: d,
                    f: f,
                    m: m,
                    u: s != fn.length || (m && (com.length != ms)),
                    compression: compression
                });
                o += 30 + s + exl + l;
                tot += 76 + 2 * (s + exl) + (ms || 0) + l;
                if (!--lft)
                    cbf();
            }
        };
        if (s > 65535)
            cbl(err(11, 0, 1), null);
        if (!compression)
            cbl(null, file);
        else if (size < 160000) {
            try {
                cbl(null, deflateSync(file, p));
            }
            catch (e) {
                cbl(e, null);
            }
        }
        else
            term.push(deflate(file, p, cbl));
    };
    // Cannot use lft because it can decrease
    for (var i = 0; i < slft; ++i) {
        _loop_1(i);
    }
    return tAll;
}
/**
 * Synchronously creates a ZIP file. Prefer using `zip` for better performance
 * with more than one file.
 * @param data The directory structure for the ZIP archive
 * @param opts The main options, merged with per-file options
 * @returns The generated ZIP archive
 */
function zipSync(data, opts) {
    if (!opts)
        opts = {};
    var r = {};
    var files = [];
    fltn(data, '', r, opts);
    var o = 0;
    var tot = 0;
    for (var fn in r) {
        var _a = r[fn], file = _a[0], p = _a[1];
        var compression = p.level == 0 ? 0 : 8;
        var f = strToU8(fn), s = f.length;
        var com = p.comment, m = com && strToU8(com), ms = m && m.length;
        var exl = exfl(p.extra);
        if (s > 65535)
            err(11);
        var d = compression ? deflateSync(file, p) : file, l = d.length;
        var c = crc();
        c.p(file);
        files.push(mrg(p, {
            size: file.length,
            crc: c.d(),
            c: d,
            f: f,
            m: m,
            u: s != fn.length || (m && (com.length != ms)),
            o: o,
            compression: compression
        }));
        o += 30 + s + exl + l;
        tot += 76 + 2 * (s + exl) + (ms || 0) + l;
    }
    var out = new u8(tot + 22), oe = o, cdl = tot - o;
    for (var i = 0; i < files.length; ++i) {
        var f = files[i];
        wzh(out, f.o, f, f.f, f.u, f.c.length);
        var badd = 30 + f.f.length + exfl(f.extra);
        out.set(f.c, f.o + badd);
        wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
    }
    wzf(out, o, files.length, cdl, oe);
    return out;
}
/**
 * Streaming pass-through decompression for ZIP archives
 */
var UnzipPassThrough = /*#__PURE__*/ (function () {
    function UnzipPassThrough() {
    }
    UnzipPassThrough.prototype.push = function (chunk, final) {
        // same as ZipPassThrough: cast to retain Buffer ergonomics
        this.ondata(null, chunk, final);
    };
    UnzipPassThrough.compression = 0;
    return UnzipPassThrough;
}());
exports.UnzipPassThrough = UnzipPassThrough;
/**
 * Streaming DEFLATE decompression for ZIP archives. Prefer AsyncZipInflate for
 * better performance.
 */
var UnzipInflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    function UnzipInflate() {
        var _this = this;
        this.i = new Inflate(function (dat, final) {
            _this.ondata(null, dat, final);
        });
    }
    UnzipInflate.prototype.push = function (chunk, final) {
        try {
            this.i.push(chunk, final);
        }
        catch (e) {
            this.ondata(e, null, final);
        }
    };
    UnzipInflate.compression = 8;
    return UnzipInflate;
}());
exports.UnzipInflate = UnzipInflate;
/**
 * Asynchronous streaming DEFLATE decompression for ZIP archives
 */
var AsyncUnzipInflate = /*#__PURE__*/ (function () {
    /**
     * Creates a DEFLATE decompression that can be used in ZIP archives
     */
    function AsyncUnzipInflate(_, sz) {
        var _this = this;
        if (sz < 320000) {
            this.i = new Inflate(function (dat, final) {
                _this.ondata(null, dat, final);
            });
        }
        else {
            this.i = new AsyncInflate(function (err, dat, final) {
                _this.ondata(err, dat, final);
            });
            this.terminate = this.i.terminate;
        }
    }
    AsyncUnzipInflate.prototype.push = function (chunk, final) {
        if (this.i.terminate)
            chunk = slc(chunk, 0);
        this.i.push(chunk, final);
    };
    AsyncUnzipInflate.compression = 8;
    return AsyncUnzipInflate;
}());
exports.AsyncUnzipInflate = AsyncUnzipInflate;
/**
 * A ZIP archive decompression stream that emits files as they are discovered
 */
var Unzip = /*#__PURE__*/ (function () {
    /**
     * Creates a ZIP decompression stream
     * @param cb The callback to call whenever a file in the ZIP archive is found
     */
    function Unzip(cb) {
        this.onfile = cb;
        this.k = [];
        this.o = {
            0: UnzipPassThrough
        };
        this.p = et;
    }
    /**
     * Pushes a chunk to be unzipped
     * @param chunk The chunk to push
     * @param final Whether this is the last chunk
     */
    Unzip.prototype.push = function (chunk, final) {
        var _this = this;
        if (!this.onfile)
            err(5);
        if (!this.p)
            err(4);
        if (this.c > 0) {
            var len = Math.min(this.c, chunk.length);
            var toAdd = chunk.subarray(0, len);
            this.c -= len;
            if (this.d)
                this.d.push(toAdd, !this.c);
            else
                this.k[0].push(toAdd);
            chunk = chunk.subarray(len);
            if (chunk.length)
                return this.push(chunk, final);
        }
        else {
            var f = 0, i = 0, is = void 0, buf = void 0;
            if (!this.p.length)
                buf = chunk;
            else if (!chunk.length)
                buf = this.p;
            else {
                buf = new u8(this.p.length + chunk.length);
                buf.set(this.p), buf.set(chunk, this.p.length);
            }
            var l = buf.length, oc = this.c, add = oc && this.d;
            var _loop_2 = function () {
                var sig = b4(buf, i);
                if (sig == 0x4034B50) {
                    f = 1, is = i;
                    this_1.d = null;
                    this_1.c = 0;
                    var bf = b2(buf, i + 6), cmp_1 = b2(buf, i + 8), u = bf & 2048, dd = bf & 8, fnl = b2(buf, i + 26), es = b2(buf, i + 28);
                    if (l > i + 30 + fnl + es) {
                        var chks_3 = [];
                        this_1.k.unshift(chks_3);
                        f = 2;
                        var lsc = b4(buf, i + 18), lsu = b4(buf, i + 22);
                        var fn_1 = strFromU8(buf.subarray(i + 30, i += 30 + fnl), !u);
                        var _a = z64hs(buf, i, es, 2, lsc, lsu, 0), sc_1 = _a[0], su_1 = _a[1], z64 = _a[3];
                        if (dd)
                            sc_1 = -1 - z64;
                        i += es;
                        this_1.c = sc_1;
                        var d_1;
                        var file_1 = {
                            name: fn_1,
                            compression: cmp_1,
                            start: function () {
                                if (!file_1.ondata)
                                    err(5);
                                if (!sc_1)
                                    file_1.ondata(null, et, true);
                                else {
                                    var ctr = _this.o[cmp_1];
                                    if (!ctr)
                                        file_1.ondata(err(14, 'unknown compression type ' + cmp_1, 1), null, false);
                                    d_1 = sc_1 < 0 ? new ctr(fn_1) : new ctr(fn_1, sc_1, su_1);
                                    d_1.ondata = function (err, dat, final) { file_1.ondata(err, dat, final); };
                                    for (var _i = 0, chks_4 = chks_3; _i < chks_4.length; _i++) {
                                        var dat = chks_4[_i];
                                        d_1.push(dat, false);
                                    }
                                    if (_this.k[0] == chks_3 && _this.c)
                                        _this.d = d_1;
                                    else
                                        d_1.push(et, true);
                                }
                            },
                            terminate: function () {
                                if (d_1 && d_1.terminate)
                                    d_1.terminate();
                            }
                        };
                        if (sc_1 >= 0)
                            file_1.size = sc_1, file_1.originalSize = su_1;
                        this_1.onfile(file_1);
                    }
                    return "break";
                }
                else if (oc) {
                    if (sig == 0x8074B50) {
                        is = i += 12 + (oc == -2 && 8), f = 3, this_1.c = 0;
                        return "break";
                    }
                    else if (sig == 0x2014B50) {
                        is = i -= 4, f = 3, this_1.c = 0;
                        return "break";
                    }
                }
            };
            var this_1 = this;
            for (; i < l - 4; ++i) {
                var state_1 = _loop_2();
                if (state_1 === "break")
                    break;
            }
            this.p = et;
            if (oc < 0) {
                var dat = f ? buf.subarray(0, is - 12 - (oc == -2 && 8) - (b4(buf, is - 16) == 0x8074B50 && 4)) : buf.subarray(0, i);
                if (add)
                    add.push(dat, !!f);
                else
                    this.k[+(f == 2)].push(dat);
            }
            if (f & 2)
                return this.push(buf.subarray(i), final);
            this.p = buf.subarray(i);
        }
        if (final) {
            if (this.c)
                err(13);
            this.p = null;
        }
    };
    /**
     * Registers a decoder with the stream, allowing for files compressed with
     * the compression type provided to be expanded correctly
     * @param decoder The decoder constructor
     */
    Unzip.prototype.register = function (decoder) {
        this.o[decoder.compression] = decoder;
    };
    return Unzip;
}());
exports.Unzip = Unzip;
var mt = typeof queueMicrotask == 'function' ? queueMicrotask : typeof setTimeout == 'function' ? setTimeout : function (fn) { fn(); };
function unzip(data, opts, cb) {
    if (!cb)
        cb = opts, opts = {};
    if (typeof cb != 'function')
        err(7);
    var term = [];
    var tAll = function () {
        for (var i = 0; i < term.length; ++i)
            term[i]();
    };
    var files = {};
    var cbd = function (a, b) {
        mt(function () { cb(a, b); });
    };
    mt(function () { cbd = cb; });
    var e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558) {
            cbd(err(13, 0, 1), null);
            return tAll;
        }
    }
    ;
    var lft = b2(data, e + 8);
    if (lft) {
        var c = lft;
        var o = b4(data, e + 16);
        var z = b4(data, e - 20) == 0x7064B50;
        if (z) {
            var ze = b4(data, e - 12);
            z = b4(data, ze) == 0x6064B50;
            if (z) {
                c = lft = b4(data, ze + 32);
                o = b4(data, ze + 48);
            }
        }
        var fltr = opts && opts.filter;
        var _loop_3 = function (i) {
            var _a = zh(data, o, z), c_1 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
            o = no;
            var cbl = function (e, d) {
                if (e) {
                    tAll();
                    cbd(e, null);
                }
                else {
                    if (d)
                        files[fn] = d;
                    if (!--lft)
                        cbd(null, files);
                }
            };
            if (!fltr || fltr({
                name: fn,
                size: sc,
                originalSize: su,
                compression: c_1
            })) {
                if (!c_1)
                    cbl(null, slc(data, b, b + sc));
                else if (c_1 == 8) {
                    var infl = data.subarray(b, b + sc);
                    // Synchronously decompress under 512KB, or barely-compressed data
                    if (su < 524288 || sc > 0.8 * su) {
                        try {
                            cbl(null, inflateSync(infl, { out: new u8(su) }));
                        }
                        catch (e) {
                            cbl(e, null);
                        }
                    }
                    else
                        term.push(inflate(infl, { size: su }, cbl));
                }
                else
                    cbl(err(14, 'unknown compression type ' + c_1, 1), null);
            }
            else
                cbl(null, null);
        };
        for (var i = 0; i < c; ++i) {
            _loop_3(i);
        }
    }
    else
        cbd(null, {});
    return tAll;
}
/**
 * Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
 * performance with more than one file.
 * @param data The raw compressed ZIP file
 * @param opts The ZIP extraction options
 * @returns The decompressed files
 */
function unzipSync(data, opts) {
    var files = {};
    var e = data.length - 22;
    for (; b4(data, e) != 0x6054B50; --e) {
        if (!e || data.length - e > 65558)
            err(13);
    }
    ;
    var c = b2(data, e + 8);
    if (!c)
        return {};
    var o = b4(data, e + 16);
    var z = b4(data, e - 20) == 0x7064B50;
    if (z) {
        var ze = b4(data, e - 12);
        z = b4(data, ze) == 0x6064B50;
        if (z) {
            c = b4(data, ze + 32);
            o = b4(data, ze + 48);
        }
    }
    var fltr = opts && opts.filter;
    for (var i = 0; i < c; ++i) {
        var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
        o = no;
        if (!fltr || fltr({
            name: fn,
            size: sc,
            originalSize: su,
            compression: c_2
        })) {
            if (!c_2)
                files[fn] = slc(data, b, b + sc);
            else if (c_2 == 8)
                files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
            else
                err(14, 'unknown compression type ' + c_2);
        }
    }
    return files;
}


/***/ }),

/***/ 330:
/***/ ((module) => {

"use strict";
module.exports = /*#__PURE__*/JSON.parse('{"name":"rtcloud-deploy-action","version":"1.0.0","private":true,"description":"GitHub Action oficial da RTCloud: empacota o projeto e publica uma versão nova pela API pública v1.","license":"MIT","main":"dist/index.js","engines":{"node":">=20"},"scripts":{"build":"ncc build src/index.js -o dist --license licenses.txt --no-source-map-register","test":"node --test --test-concurrency=1 \\"test/*.test.js\\"","all":"npm run build && npm test"},"dependencies":{"fflate":"0.8.3","ignore":"7.0.14"},"devDependencies":{"@vercel/ncc":"0.45.0"}}');

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/asset-relocator-loader */
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";

/* Ponto de entrada do ncc: só chama o passo. A lógica fica em main.js (testável). */
const { executar } = __nccwpck_require__(936);
const { erro } = __nccwpck_require__(474);

executar().catch((e) => {
  erro(`Erro inesperado: ${e && e.message ? e.message : e}`, 'Deploy na RTCloud');
  process.exitCode = 1;
});

})();

module.exports = __webpack_exports__;
/******/ })()
;