// ============================================================
// COMMIT PLATFORM — Error Interpretation System
// frontend/src/lib/errorInterpreter.ts
// ============================================================
// Translates raw Python tracebacks into friendly messages
// tuned to the student's scaffold level.
// ============================================================

export type ScaffoldLevel =
  | 'block_pseudo'
  | 'typed_pseudo'
  | 'block_python'
  | 'typed_python'

export interface ErrorInterpretation {
  title: string          // Short friendly error name
  message: string        // Plain English explanation
  docsKey: string | null // Which docs entry to link to
  lessonHint: string     // What topic to look for in the lesson
}

// ── SCAFFOLD LEVEL HELPERS ───────────────────────────────────

const isBeginnerLevel = (level: ScaffoldLevel) =>
  level === 'block_pseudo' || level === 'typed_pseudo'

const isMidLevel = (level: ScaffoldLevel) =>
  level === 'block_python'

// ── ERROR PATTERNS ──────────────────────────────────────────

interface ErrorPattern {
  match: RegExp
  interpret: (groups: RegExpMatchArray, level: ScaffoldLevel) => ErrorInterpretation
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // NameError
  {
    match: /NameError: name '(.+)' is not defined/,
    interpret: (groups, level) => ({
      title: "unknown name",
      message: isBeginnerLevel(level)
        ? `You used the word "${groups[1]}" but Python doesn't know what it is yet. Did you spell it right? Or did you forget to create it before using it?`
        : isMidLevel(level)
        ? `"${groups[1]}" hasn't been defined yet. Check your spelling and make sure you created this variable before using it.`
        : `NameError: "${groups[1]}" is referenced before assignment. Check spelling and verify it's defined in the current scope.`,
      docsKey: 'Variables & Types',
      lessonHint: 'variables',
    }),
  },

  // IndentationError
  {
    match: /IndentationError: (.+)/,
    interpret: (_, level) => ({
      title: "indentation problem",
      message: isBeginnerLevel(level)
        ? "The spacing at the start of this line is wrong. Python uses spaces to know what goes inside what — like how a paragraph indent shows something belongs together."
        : isMidLevel(level)
        ? "This line's indentation is off. Make sure code inside an if, for, while, or def is indented consistently."
        : "IndentationError — check for mixed spaces and tabs, or inconsistent indentation levels inside a block.",
      docsKey: 'Loops',
      lessonHint: 'indentation',
    }),
  },

  // SyntaxError - missing colon
  {
    match: /SyntaxError: expected ':'/,
    interpret: (_, level) => ({
      title: "missing colon",
      message: isBeginnerLevel(level)
        ? "You're missing a colon (:) at the end of this line. In Python, lines that start a block — like if, for, while, and def — always need a colon at the end."
        : "Missing colon at the end of an if, for, while, def, or class statement.",
      docsKey: 'Conditionals',
      lessonHint: 'colon syntax',
    }),
  },

  // SyntaxError - generic
  {
    match: /SyntaxError: (.+)/,
    interpret: (groups, level) => ({
      title: "syntax error",
      message: isBeginnerLevel(level)
        ? "Something on this line isn't written quite right. Check for missing colons, parentheses, or quote marks. Every opening bracket needs a closing one!"
        : isMidLevel(level)
        ? "Syntax error — check for missing colons after if/for/def, unmatched brackets, or unclosed strings."
        : `SyntaxError: ${groups[1]}. Check bracket matching, colons after blocks, and string quotes.`,
      docsKey: null,
      lessonHint: 'syntax',
    }),
  },

  // TypeError - concatenation
  {
    match: /TypeError: can only concatenate str \(not "(.+)"\) to str/,
    interpret: (groups, level) => ({
      title: "mixing text and numbers",
      message: isBeginnerLevel(level)
        ? `You tried to combine text with a ${groups[1]} (a number). Python can't mix those directly. Wrap the number with str() to turn it into text first — like str(42) becomes "42".`
        : isMidLevel(level)
        ? `Can't add a ${groups[1]} directly to a string. Use str() to convert it first, or use an f-string: f"your text {variable}"`
        : `TypeError: can only concatenate str to str, not "${groups[1]}". Use str() or an f-string.`,
      docsKey: 'String Operations',
      lessonHint: 'string concatenation',
    }),
  },

  // TypeError - not callable
  {
    match: /TypeError: '(.+)' object is not callable/,
    interpret: (groups, level) => ({
      title: "can't call that",
      message: isBeginnerLevel(level)
        ? `You tried to use "${groups[1]}" like a function (with parentheses) but it's not a function. Check if you accidentally overwrote a function name with a variable.`
        : `"${groups[1]}" is not callable — you may have a variable with the same name as a function, or you're calling something that isn't a function.`,
      docsKey: 'Functions',
      lessonHint: 'functions',
    }),
  },

  // TypeError - wrong number of arguments
  {
    match: /TypeError: (.+)\(\) takes (\d+) positional argument[s]? but (\d+) w(?:as|ere) given/,
    interpret: (groups, level) => ({
      title: "wrong number of inputs",
      message: isBeginnerLevel(level)
        ? `The function "${groups[1]}" expects ${groups[2]} input${groups[2] === '1' ? '' : 's'}, but you gave it ${groups[3]}. Check how many values the function needs.`
        : `${groups[1]}() takes ${groups[2]} argument(s) but ${groups[3]} were given. Check the function definition for the correct number of parameters.`,
      docsKey: 'Functions',
      lessonHint: 'function parameters',
    }),
  },

  // TypeError - generic
  {
    match: /TypeError: (.+)/,
    interpret: (groups, level) => ({
      title: "type mismatch",
      message: isBeginnerLevel(level)
        ? "You're using the wrong kind of value somewhere. Python is picky about mixing numbers, text, and other types."
        : `TypeError: ${groups[1]}. Check that you're using the right types — str(), int(), float() can help convert between them.`,
      docsKey: 'Variables & Types',
      lessonHint: 'data types',
    }),
  },

  // IndexError
  {
    match: /IndexError: list index out of range/,
    interpret: (_, level) => ({
      title: "list index out of range",
      message: isBeginnerLevel(level)
        ? "You tried to grab an item from your list using a number that's too big. Remember: lists start counting at 0, and the last item is at len(list) - 1."
        : isMidLevel(level)
        ? "You're accessing an index that doesn't exist in the list. Check your list's length with len() and make sure your index stays within range."
        : "IndexError: index out of range. Verify list length with len() before accessing and check for off-by-one errors.",
      docsKey: 'Lists',
      lessonHint: 'lists and indexing',
    }),
  },

  // KeyError
  {
    match: /KeyError: (.+)/,
    interpret: (groups, level) => ({
      title: "key not found",
      message: isBeginnerLevel(level)
        ? `You tried to look up ${groups[1]} in a dictionary but that key doesn't exist. Check your spelling or use .get() to safely look things up.`
        : `KeyError: ${groups[1]} — this key doesn't exist in the dictionary. Use .get(key) to return None instead of an error, or check with "key in dict" first.`,
      docsKey: null,
      lessonHint: 'dictionaries',
    }),
  },

  // ZeroDivisionError
  {
    match: /ZeroDivisionError: division by zero/,
    interpret: (_, level) => ({
      title: "dividing by zero",
      message: isBeginnerLevel(level)
        ? "You tried to divide a number by zero, which isn't allowed in math or Python! Check what value is in the bottom of your division — it might be 0 without you realizing it."
        : "ZeroDivisionError — add a check before dividing: if divisor != 0: before your division operation.",
      docsKey: null,
      lessonHint: 'arithmetic',
    }),
  },

  // AttributeError
  {
    match: /AttributeError: '(.+)' object has no attribute '(.+)'/,
    interpret: (groups, level) => ({
      title: "attribute not found",
      message: isBeginnerLevel(level)
        ? `A ${groups[1]} doesn't have a "${groups[2]}" option. Check your spelling — maybe you meant a different method?`
        : `AttributeError: "${groups[2]}" doesn't exist on a ${groups[1]} object. Check the spelling and make sure you're calling the right method.`,
      docsKey: 'String Operations',
      lessonHint: 'methods',
    }),
  },

  // ValueError
  {
    match: /ValueError: invalid literal for int\(\) with base 10: '(.+)'/,
    interpret: (groups, level) => ({
      title: "can't convert to number",
      message: isBeginnerLevel(level)
        ? `You tried to convert "${groups[1]}" into a whole number but it doesn't look like one. Make sure the value is actually a number before using int() on it.`
        : `ValueError: "${groups[1]}" can't be converted to an integer with int(). Make sure the input is a valid whole number string.`,
      docsKey: 'Variables & Types',
      lessonHint: 'type conversion',
    }),
  },

  // ValueError - generic
  {
    match: /ValueError: (.+)/,
    interpret: (groups, level) => ({
      title: "value error",
      message: isBeginnerLevel(level)
        ? "The value you're using doesn't work for what you're trying to do. Check that the data is in the right format."
        : `ValueError: ${groups[1]}. The value is the right type but an inappropriate value for this operation.`,
      docsKey: null,
      lessonHint: 'data types',
    }),
  },

  // RecursionError
  {
    match: /RecursionError: maximum recursion depth exceeded/,
    interpret: (_, level) => ({
      title: "infinite loop in function",
      message: isBeginnerLevel(level)
        ? "Your function keeps calling itself without stopping! It needs a way to know when to stop. Check if you have a condition that ends the repetition."
        : "RecursionError: your recursive function has no base case or the base case is never reached. Add a stopping condition.",
      docsKey: 'Functions',
      lessonHint: 'recursion',
    }),
  },

  // StopIteration / Generator
  {
    match: /StopIteration/,
    interpret: (_, level) => ({
      title: "ran out of items",
      message: "You tried to get the next item from something that has run out of items. Check your loop logic.",
      docsKey: 'Loops',
      lessonHint: 'loops and iteration',
    }),
  },

  // FileNotFoundError
  {
    match: /FileNotFoundError: \[Errno 2\] No such file or directory: '(.+)'/,
    interpret: (groups, level) => ({
      title: "file not found",
      message: isBeginnerLevel(level)
        ? `Python couldn't find a file called "${groups[1]}". Check that the filename is spelled correctly.`
        : `FileNotFoundError: "${groups[1]}" doesn't exist. Check the filename and path.`,
      docsKey: null,
      lessonHint: 'file reading',
    }),
  },
]

// ── MAIN INTERPRETER FUNCTION ────────────────────────────────

export function interpretError(
  stderr: string,
  scaffoldLevel: ScaffoldLevel = 'typed_python'
): ErrorInterpretation | null {
  if (!stderr) return null

  // Extract just the error line (last non-empty line usually)
  const lines = stderr.split('\n').filter(l => l.trim())
  const errorLine = lines[lines.length - 1] || stderr

  for (const pattern of ERROR_PATTERNS) {
    const match = errorLine.match(pattern.match)
    if (match) {
      return pattern.interpret(match, scaffoldLevel)
    }
  }

  // Fallback for unknown errors
  return {
    title: "something went wrong",
    message: isBeginnerLevel(scaffoldLevel)
      ? "Python ran into a problem it couldn't handle. Read the error message carefully — it usually tells you which line caused the issue."
      : `Runtime error: ${errorLine}. Check the traceback above for the line number and error type.`,
    docsKey: null,
    lessonHint: 'error messages',
  }
}

// ── LINE NUMBER EXTRACTOR ────────────────────────────────────

export function getErrorLineNumber(stderr: string): number | null {
  const match = stderr.match(/line (\d+)/i)
  return match ? parseInt(match[1]) : null
}