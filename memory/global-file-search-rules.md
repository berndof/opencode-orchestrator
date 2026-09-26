---
description: 'Global rule: bash commands for file search within allowed directories are always permitted'
label: global-file-search-rules
limit: 5000
read_only: false
---
Global Rule: Bash commands for file search within allowed directories are ALWAYS permitted — glob, grep, read, edit, write, task (with explore agent), bash (for ls, find, grep, rg within workspace) can run without restriction when searching/reading files in permitted project directories. No approval needed for file discovery operations.
