// Beginner-friendly Python reference shown on lesson pages, the standalone
// /docs page, and from the docs button on any coding assignment. Authors can
// extend categories or items here without touching any UI.

export interface PythonDocItem {
  name: string
  syntax: string
  desc: string
  example: string
}

export interface PythonDocCategory {
  category: string
  items: PythonDocItem[]
}

export const PYTHON_DOCS: PythonDocCategory[] = [
  {
    category: 'Output',
    items: [
      { name: 'print()', syntax: 'print(value)', desc: 'Prints value to the console', example: 'print("Hello!")\nprint(42)' },
      { name: 'print() with sep', syntax: 'print(a, b, sep=",")', desc: 'Print multiple values with separator', example: 'print("a", "b", sep=", ")' },
    ]
  },
  {
    category: 'Variables & Types',
    items: [
      { name: 'String', syntax: 'x = "text"', desc: 'Stores text', example: 'name = "Alex"\ngreeting = \'Hello\'' },
      { name: 'Integer', syntax: 'x = 42', desc: 'Whole number', example: 'age = 17\ncount = 0' },
      { name: 'Float', syntax: 'x = 3.14', desc: 'Decimal number', example: 'gpa = 3.9\nprice = 1.99' },
      { name: 'Boolean', syntax: 'x = True', desc: 'True or False', example: 'is_logged_in = True\ndone = False' },
      { name: 'type()', syntax: 'type(x)', desc: 'Returns the type of a variable', example: 'print(type(42))      # int\nprint(type("hi"))    # str' },
    ]
  },
  {
    category: 'String Operations',
    items: [
      { name: 'Concatenation', syntax: 'a + b', desc: 'Join two strings', example: 'first = "Hello"\nsecond = " World"\nprint(first + second)' },
      { name: 'f-string', syntax: 'f"text {variable}"', desc: 'Embed variable in string', example: 'name = "Alex"\nprint(f"Hello, {name}!")' },
      { name: 'len()', syntax: 'len(string)', desc: 'Length of string', example: 'word = "Python"\nprint(len(word))  # 6' },
      { name: '.upper() / .lower()', syntax: 'str.upper()', desc: 'Change case', example: 'print("hello".upper())  # HELLO' },
      { name: '.split()', syntax: 'str.split(",")', desc: 'Split into list', example: 'words = "a,b,c".split(",")\nprint(words)  # [\'a\', \'b\', \'c\']' },
    ]
  },
  {
    category: 'Input',
    items: [
      { name: 'input()', syntax: 'x = input("prompt")', desc: 'Gets user input as string', example: 'name = input("What is your name? ")\nprint(f"Hello, {name}!")' },
      { name: 'int(input())', syntax: 'x = int(input())', desc: 'Gets numeric input', example: 'age = int(input("Enter age: "))\nprint(age + 1)' },
    ]
  },
  {
    category: 'Conditionals',
    items: [
      { name: 'if / elif / else', syntax: 'if condition:', desc: 'Branches based on condition', example: 'x = 10\nif x > 5:\n    print("big")\nelif x == 5:\n    print("five")\nelse:\n    print("small")' },
      { name: 'Comparison ops', syntax: '== != > < >= <=', desc: 'Compare values', example: 'print(5 == 5)   # True\nprint(3 != 4)   # True\nprint(10 >= 10) # True' },
      { name: 'Logical ops', syntax: 'and, or, not', desc: 'Combine conditions', example: 'x = 7\nif x > 5 and x < 10:\n    print("between 5 and 10")' },
    ]
  },
  {
    category: 'Loops',
    items: [
      { name: 'for loop', syntax: 'for i in range(n):', desc: 'Repeat n times', example: 'for i in range(5):\n    print(i)  # 0 1 2 3 4' },
      { name: 'for in list', syntax: 'for item in list:', desc: 'Loop through items', example: 'fruits = ["apple","banana"]\nfor fruit in fruits:\n    print(fruit)' },
      { name: 'while loop', syntax: 'while condition:', desc: 'Repeat while true', example: 'count = 0\nwhile count < 3:\n    print(count)\n    count += 1' },
      { name: 'break', syntax: 'break', desc: 'Exit the loop early', example: 'for i in range(10):\n    if i == 5:\n        break\n    print(i)' },
      { name: 'continue', syntax: 'continue', desc: 'Skip to next iteration', example: 'for i in range(5):\n    if i == 2:\n        continue\n    print(i)' },
    ]
  },
  {
    category: 'Functions',
    items: [
      { name: 'def', syntax: 'def name(params):', desc: 'Define a function', example: 'def greet(name):\n    return f"Hello, {name}!"\n\nprint(greet("Alex"))' },
      { name: 'return', syntax: 'return value', desc: 'Return a value', example: 'def add(a, b):\n    return a + b\n\nresult = add(3, 4)\nprint(result)  # 7' },
      { name: 'Default params', syntax: 'def f(x=default):', desc: 'Parameter with default', example: 'def greet(name="friend"):\n    print(f"Hi, {name}!")\n\ngreet()         # Hi, friend!\ngreet("Alex")   # Hi, Alex!' },
    ]
  },
  {
    category: 'Lists',
    items: [
      { name: 'Create list', syntax: 'x = [1, 2, 3]', desc: 'Create a list', example: 'nums = [1, 2, 3]\nnames = ["Alice", "Bob"]' },
      { name: 'Indexing', syntax: 'list[0]', desc: 'Access by index (0-based)', example: 'fruits = ["apple","banana","cherry"]\nprint(fruits[0])   # apple\nprint(fruits[-1])  # cherry' },
      { name: '.append()', syntax: 'list.append(x)', desc: 'Add to end', example: 'nums = [1, 2]\nnums.append(3)\nprint(nums)  # [1, 2, 3]' },
      { name: '.remove()', syntax: 'list.remove(x)', desc: 'Remove first match', example: 'nums = [1, 2, 3]\nnums.remove(2)\nprint(nums)  # [1, 3]' },
      { name: 'len()', syntax: 'len(list)', desc: 'Number of items', example: 'nums = [1, 2, 3, 4]\nprint(len(nums))  # 4' },
    ]
  },
]
