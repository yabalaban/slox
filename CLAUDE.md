# CLAUDE.md - Project Guide for AI Assistants

This document provides context for AI assistants working on the slox project.

## Project Overview

**slox** is a Swift implementation of the Lox programming language from "Crafting Interpreters" by Robert Nystrom. It compiles to WebAssembly for browser-based execution via a terminal-style REPL.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   web/app.js    │────▶│  slox-wasm.wasm  │────▶│    SloxCore     │
│   (xterm.js)    │◀────│  (JavaScriptKit) │◀────│   (Swift Lox)   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| SloxCore | `Sources/SloxCore/` | Core interpreter library |
| slox-wasm | `Sources/slox-wasm/main.swift` | WASM entry point & JS API |
| Web REPL | `web/app.js` | Terminal UI (xterm.js) |
| CLI | `Sources/slox/` | Native command-line tool |

## Build Commands

```bash
# Native build (for local testing)
swift build

# Run tests
swift test

# WASM build (requires SwiftWasm toolchain)
swift build --triple wasm32-unknown-wasi -c release --product slox-wasm \
  -Xswiftc -Xclang-linker -Xswiftc -mexec-model=reactor \
  -Xlinker --export=slox_init

# Copy WASM to web folder
cp .build/release/slox-wasm.wasm web/
```

## WASM/JavaScript Integration

### Exported API (`window.slox`)

| Function | Signature | Description |
|----------|-----------|-------------|
| `initInterpreter` | `(callback: Function) -> bool` | Initialize with output callback |
| `execute` | `(source: string) -> void` | Execute Lox code (REPL mode) |
| `getEnvironment` | `() -> string` | Get local scope as string |
| `getGlobals` | `() -> string` | Get global definitions |
| `reset` | `() -> void` | Reset interpreter state |

### JavaScriptKit Notes

- `JSClosure` instances must be stored globally to prevent GC
- Use `JSFunction` (not `JSObject`) for JavaScript function callbacks
- Use `.object()` (not `.function()`) when assigning closures to properties
- `@_cdecl("name")` exports functions with predictable C names

## Interpreter Pipeline

```
Source → Scanner → Tokens → Parser → AST → Resolver → Interpreter → Result
```

### Key Classes

| Class | File | Responsibility |
|-------|------|----------------|
| `Driver` | `Driver.swift` | Orchestrates the pipeline |
| `Scanner` | `Scanner.swift` | Lexical analysis |
| `Parser` | `Parser.swift` | Syntax analysis (recursive descent) |
| `Resolver` | `Resolver.swift` | Variable binding resolution |
| `Interpreter` | `Interpreter.swift` | AST evaluation |

### Driver Methods

- `run(source:)` - Batch execution (print statements only)
- `runRepl(source:)` - REPL mode (returns evaluation result)
- `getGlobals()` - Introspection for `%globals` command
- `getEnvironment()` - Introspection for `%env` command
- `reset()` - Clear user-defined state

## Web REPL Features

### Terminal Commands
- `help` - Display language reference
- `clear` - Clear screen

### Magic Commands
- `%env` - Show current local scope
- `%globals` - Show global definitions
- `%reset` - Reset interpreter state

### Input Features
- Multiline input (unclosed braces/parens/strings continue)
- Command history (Up/Down arrows)
- Cursor navigation (Left/Right, Ctrl+Left/Right, Home/End)
- Ctrl+C to cancel, Ctrl+L to clear screen

## Testing

```bash
# Run all tests
swift test

# Run specific test file
swift test --filter OutputTests
```

### Test Categories (OutputTests.swift)
- Print output tests
- REPL evaluation tests
- Magic command support tests

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Install SwiftWasm toolchain
2. Build WASM binary
3. Inject build timestamp into `web/app.js`
4. Deploy to GitHub Pages

### Build Time Injection
The placeholder `__BUILD_TIME__` in `web/app.js` is replaced with the actual build timestamp during CI via `sed`.

## File Structure

```
slox/
├── Sources/
│   ├── SloxCore/           # Core interpreter library
│   │   ├── Driver.swift    # Main entry point
│   │   ├── Scanner.swift   # Lexer
│   │   ├── Parser.swift    # Parser
│   │   ├── Resolver.swift  # Variable resolution
│   │   ├── Interpreter.swift # Execution
│   │   └── ...             # AST, Environment, etc.
│   ├── slox/               # Native CLI
│   │   └── main.swift
│   └── slox-wasm/          # WASM target
│       └── main.swift      # JS API exports
├── Tests/
│   └── SloxCoreTests/      # Unit tests
├── web/                    # Static web files
│   ├── index.html
│   ├── app.js              # REPL implementation
│   └── *.js/*.mjs          # Runtime dependencies
├── Package.swift           # Swift package manifest
└── .github/workflows/      # CI configuration
```

## Common Tasks

### Adding a New Built-in Function
1. Add to `Interpreter.defineGlobals()` in `Interpreter.swift`
2. Add tests in `OutputTests.swift`

### Modifying WASM API
1. Update `Sources/slox-wasm/main.swift`
2. Add corresponding handler in `web/app.js`
3. Store any new `JSClosure` in a global variable

### Adding a New Magic Command
1. Add handler in `SloxRepl.handleMagicCommand()` in `app.js`
2. Add Swift support in `Driver.swift` if needed
3. Update help text in `MANPAGE` constant
4. Add tests in `OutputTests.swift`

## Known Limitations

- WASM binary is ~1.5MB (JavaScriptKit overhead)
- No file I/O in browser environment
- `clock()` uses JavaScript `Date.now()` via configured provider
