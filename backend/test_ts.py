from tree_sitter import Language, Parser
import tree_sitter_javascript as tsjs

lang = Language(tsjs.language())
parser = Parser(lang)

code = b"import { useState } from 'react'; import Button from './Button';"
tree = parser.parse(code)

query = lang.query("(import_statement source: (string) @path)")
captures = query.captures(tree.root_node)
print("type:", type(captures))
print("captures:", captures)