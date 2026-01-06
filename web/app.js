/**
 * slox Web REPL
 *
 * A terminal-based REPL for the Slox (Swift Lox) interpreter running in WebAssembly.
 * Uses xterm.js for terminal emulation and JavaScriptKit for Swift/JS interop.
 */

// =============================================================================
// Constants
// =============================================================================

// Build timestamp injected by CI (remains placeholder in dev)
const BUILD_TIME = '__BUILD_TIME__';

// Terminal prompts (ANSI colored)
const PROMPT = '\x1b[32m>>>\x1b[0m ';
const CONTINUATION_PROMPT = '\x1b[32m...\x1b[0m ';

// Man-page style help text with ANSI formatting
const MANPAGE = `\x1b[1mSLOX(1)                       User Commands                        SLOX(1)\x1b[0m

\x1b[1mNAME\x1b[0m
    slox - Lox language interpreter compiled to WebAssembly

\x1b[1mDESCRIPTION\x1b[0m
    Lox is a dynamically-typed scripting language from the book
    "Crafting Interpreters" by Robert Nystrom. This implementation is
    written in Swift and compiled to WebAssembly.

\x1b[1mDATA TYPES\x1b[0m
    \x1b[33mnil\x1b[0m             The absence of a value
    \x1b[33mtrue\x1b[0m / \x1b[33mfalse\x1b[0m    Boolean values
    \x1b[33m123\x1b[0m, \x1b[33m3.14\x1b[0m       Numbers (double-precision floats)
    \x1b[33m"hello"\x1b[0m         Strings (double quotes only)

\x1b[1mVARIABLES\x1b[0m
    var name = "value";
    var count = 42;

\x1b[1mCONTROL FLOW\x1b[0m
    if (cond) { ... } else { ... }
    while (cond) { ... }
    for (var i = 0; i < 10; i = i + 1) { ... }

\x1b[1mFUNCTIONS\x1b[0m
    fun greet(name) {
        print("Hello, " + name + "!");
    }
    greet("World");

\x1b[1mCLASSES\x1b[0m
    class Animal {
        init(name) { this.name = name; }
        speak() { print(this.name + " speaks"); }
    }
    class Dog < Animal {
        speak() { print(this.name + " barks!"); }
    }

\x1b[1mBUILT-INS\x1b[0m
    \x1b[32mprint\x1b[0m(value)     Output a value
    \x1b[32mclock\x1b[0m()          Seconds since epoch

\x1b[1mREPL COMMANDS\x1b[0m
    \x1b[32mhelp\x1b[0m             Show this manual
    \x1b[32mclear\x1b[0m            Clear the screen
    \x1b[32mCtrl+C\x1b[0m           Cancel input
    \x1b[32mCtrl+L\x1b[0m           Clear screen
    \x1b[32mUp/Down\x1b[0m          Command history
    \x1b[32mLeft/Right\x1b[0m       Move cursor
    \x1b[32mCtrl+Left/Right\x1b[0m  Move by word
    \x1b[32mHome/End\x1b[0m         Start/end of line

\x1b[1mMULTILINE INPUT\x1b[0m
    Incomplete statements (unclosed braces/strings) continue
    on the next line with a "..." prompt.

\x1b[1mMAGIC COMMANDS\x1b[0m
    \x1b[36m%env\x1b[0m             Show current environment (local scope)
    \x1b[36m%globals\x1b[0m         Show global definitions
    \x1b[36m%reset\x1b[0m           Reset interpreter state

\x1b[1mEXAMPLES\x1b[0m
    \x1b[90m>>> print("Hello!");\x1b[0m
    Hello!

    \x1b[90m>>> fun fib(n) { if (n<2) return n; return fib(n-1)+fib(n-2); }\x1b[0m
    \x1b[90m>>> print(fib(20));\x1b[0m
    6765

\x1b[1mSEE ALSO\x1b[0m
    https://craftinginterpreters.com
    https://github.com/yabalaban/slox

`;

// =============================================================================
// SloxRepl Class
// =============================================================================

/**
 * Main REPL controller class.
 * Manages terminal I/O, command history, multiline input, and WASM communication.
 */
class SloxRepl {
    constructor() {
        this.terminal = null;       // xterm.js Terminal instance
        this.line = '';             // Current input line
        this.cursor = 0;            // Cursor position within line
        this.history = [];          // Command history
        this.historyPos = -1;       // Current position in history (-1 = new input)
        this.ready = false;         // Terminal ready for input
        this.wasmLoaded = false;    // WASM interpreter loaded successfully
        this.multilineBuffer = [];  // Accumulated lines for multiline input
        this.init();
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    async init() {
        // Configure xterm.js terminal with dark theme
        this.terminal = new Terminal({
            cols: 80,
            rows: 24,
            theme: {
                background: '#0a0a0a',
                foreground: '#b0b0b0',
                cursor: '#5a5',
                cursorAccent: '#0a0a0a',
                selectionBackground: 'rgba(90, 170, 90, 0.3)',
                black: '#1a1a1a',
                red: '#c66',
                green: '#6a6',
                yellow: '#aa6',
                blue: '#68a',
                magenta: '#a6a',
                cyan: '#6aa',
                white: '#aaa',
                brightBlack: '#444',
                brightRed: '#e88',
                brightGreen: '#8c8',
                brightYellow: '#cc8',
                brightBlue: '#8ac',
                brightMagenta: '#c8c',
                brightCyan: '#8cc',
                brightWhite: '#ccc'
            },
            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace',
            fontSize: 14,
            lineHeight: 1.4,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 5000
        });

        // Enable clickable links
        this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
        this.terminal.open(document.getElementById('terminal'));

        // Resize terminal to fit container (fixed 80 cols, dynamic rows)
        const resize = () => {
            const container = document.getElementById('terminal');
            const charHeight = 14 * 1.4;
            const rows = Math.floor((container.clientHeight - 32) / charHeight);
            this.terminal.resize(80, Math.max(rows, 10));
        };
        window.addEventListener('resize', resize);
        resize();

        // Handle all terminal input
        this.terminal.onData(data => this.handleInput(data));

        // Display welcome message
        this.terminal.writeln('\x1b[1;32mslox\x1b[0m \x1b[38;5;242m- Lox interpreter in Swift/WASM\x1b[0m');
        this.terminal.writeln('\x1b[38;5;242mType "help" for language reference.\x1b[0m');
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[38;5;242mInitializing WASM...\x1b[0m');

        await this.loadWasm();
    }

    /**
     * Load and initialize the WASM interpreter.
     * Sets up WASI environment and JavaScriptKit runtime.
     */
    async loadWasm() {
        const startTime = Date.now();

        try {
            // Prepare global namespace for WASM exports
            window.slox = {};
            window.sloxReady = () => {};

            // Fetch WASM binary
            const response = await fetch('slox-wasm.wasm');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const wasmBytes = await response.arrayBuffer();
            const wasmSize = (wasmBytes.byteLength / 1024).toFixed(1);

            // Load WASI and JavaScriptKit runtime
            const { WASI, File, OpenFile, ConsoleStdout } = await import('./wasi-loader.js');
            const { SwiftRuntime } = await import('./javascriptkit-runtime.mjs');

            // Configure WASI with stdio
            const terminal = this.terminal;
            const wasi = new WASI([], [], [
                new OpenFile(new File([])),                              // stdin
                ConsoleStdout.lineBuffered(msg => terminal.writeln(msg)), // stdout
                ConsoleStdout.lineBuffered(msg => console.error(msg)),   // stderr
            ]);

            // Instantiate WASM module
            const swift = new SwiftRuntime();
            const { instance } = await WebAssembly.instantiate(wasmBytes, {
                wasi_snapshot_preview1: wasi.wasiImport,
                javascript_kit: swift.wasmImports
            });

            // Initialize runtimes
            swift.setInstance(instance);
            wasi.initialize(instance);

            // Call WASM initialization functions
            if (instance.exports._initialize) instance.exports._initialize();
            if (instance.exports.slox_init) instance.exports.slox_init();

            // Brief delay for async initialization
            await new Promise(r => setTimeout(r, 50));

            // Initialize interpreter with output callback
            if (window.slox?.initInterpreter) {
                const initOk = window.slox.initInterpreter(out => {
                    this.terminal.writeln(out);
                });
                if (!initOk) throw new Error('initInterpreter returned false');

                this.wasmLoaded = true;
                this.ready = true;

                // Display success message with timing info
                const elapsed = Date.now() - startTime;
                const buildInfo = BUILD_TIME !== '__BUILD_TIME__' ? `, built: ${BUILD_TIME}` : '';
                this.terminal.writeln(`\x1b[32m✓\x1b[0m \x1b[38;5;242mReady (${wasmSize}KB, ${elapsed}ms${buildInfo})\x1b[0m`);
            } else {
                throw new Error('API initialization failed');
            }
        } catch (e) {
            console.error('WASM load error:', e);
            this.terminal.writeln(`\x1b[31m✗\x1b[0m \x1b[38;5;242mWASM error: ${e.message}\x1b[0m`);
            this.ready = true; // Allow basic terminal use even if WASM fails
        }

        this.terminal.writeln('');
        document.getElementById('loading').classList.add('hidden');
        this.terminal.write(PROMPT);
        this.terminal.focus();
    }

    // =========================================================================
    // Input Handling
    // =========================================================================

    /** Returns the appropriate prompt based on multiline state */
    getCurrentPrompt() {
        return this.multilineBuffer.length > 0 ? CONTINUATION_PROMPT : PROMPT;
    }

    /**
     * Main input handler - processes all terminal input data.
     * Handles escape sequences, control characters, and printable input.
     */
    handleInput(data) {
        if (!this.ready) return;

        // Handle escape sequences as a unit
        if (data.startsWith('\x1b[')) {
            this.handleEscapeSequence(data);
            return;
        }
        if (data.startsWith('\x1b')) {
            return; // Ignore other escape sequences
        }

        // Process each character
        for (const char of data) {
            const code = char.charCodeAt(0);

            if (char === '\r' || char === '\n') {
                this.terminal.write('\r\n');
                this.handleEnter();
            } else if (code === 127 || code === 8) {
                this.handleBackspace();
            } else if (char === '\x03') {
                // Ctrl+C: cancel current input
                this.line = '';
                this.cursor = 0;
                this.multilineBuffer = [];
                this.terminal.write('^C\r\n' + PROMPT);
            } else if (char === '\x0c') {
                // Ctrl+L: clear screen
                this.terminal.clear();
                this.terminal.write(this.getCurrentPrompt() + this.line);
                this.moveCursorToPosition();
            } else if (char === '\x01') {
                // Ctrl+A: beginning of line
                this.cursor = 0;
                this.refreshLine();
            } else if (char === '\x05') {
                // Ctrl+E: end of line
                this.cursor = this.line.length;
                this.refreshLine();
            } else if (char === '\x17') {
                // Ctrl+W: delete word backward
                this.deleteWordBackward();
            } else if (code >= 32) {
                // Printable character
                this.insertChar(char);
            }
        }
    }

    /** Handle escape sequences (arrow keys, home/end, etc.) */
    handleEscapeSequence(seq) {
        switch (seq) {
            case '\x1b[A': this.historyUp(); break;           // Up arrow
            case '\x1b[B': this.historyDown(); break;         // Down arrow
            case '\x1b[C': this.moveCursorRight(); break;     // Right arrow
            case '\x1b[D': this.moveCursorLeft(); break;      // Left arrow
            case '\x1b[H':                                     // Home
            case '\x1b[1~':
                this.cursor = 0;
                this.refreshLine();
                break;
            case '\x1b[F':                                     // End
            case '\x1b[4~':
                this.cursor = this.line.length;
                this.refreshLine();
                break;
            case '\x1b[3~': this.handleDelete(); break;       // Delete
            case '\x1b[1;5C': this.moveWordRight(); break;    // Ctrl+Right
            case '\x1b[1;5D': this.moveWordLeft(); break;     // Ctrl+Left
        }
    }

    // =========================================================================
    // Line Editing
    // =========================================================================

    /** Insert character at cursor position */
    insertChar(char) {
        this.line = this.line.slice(0, this.cursor) + char + this.line.slice(this.cursor);
        this.cursor++;
        this.refreshLine();
    }

    /** Delete character before cursor */
    handleBackspace() {
        if (this.cursor > 0) {
            this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
            this.cursor--;
            this.refreshLine();
        }
    }

    /** Delete character at cursor */
    handleDelete() {
        if (this.cursor < this.line.length) {
            this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
            this.refreshLine();
        }
    }

    /** Move cursor one character left */
    moveCursorLeft() {
        if (this.cursor > 0) {
            this.cursor--;
            this.terminal.write('\x1b[D');
        }
    }

    /** Move cursor one character right */
    moveCursorRight() {
        if (this.cursor < this.line.length) {
            this.cursor++;
            this.terminal.write('\x1b[C');
        }
    }

    /** Move cursor one word left */
    moveWordLeft() {
        if (this.cursor === 0) return;
        while (this.cursor > 0 && this.line[this.cursor - 1] === ' ') this.cursor--;
        while (this.cursor > 0 && this.line[this.cursor - 1] !== ' ') this.cursor--;
        this.refreshLine();
    }

    /** Move cursor one word right */
    moveWordRight() {
        if (this.cursor >= this.line.length) return;
        while (this.cursor < this.line.length && this.line[this.cursor] !== ' ') this.cursor++;
        while (this.cursor < this.line.length && this.line[this.cursor] === ' ') this.cursor++;
        this.refreshLine();
    }

    /** Delete word before cursor (Ctrl+W) */
    deleteWordBackward() {
        if (this.cursor === 0) return;
        const oldCursor = this.cursor;
        while (this.cursor > 0 && this.line[this.cursor - 1] === ' ') this.cursor--;
        while (this.cursor > 0 && this.line[this.cursor - 1] !== ' ') this.cursor--;
        this.line = this.line.slice(0, this.cursor) + this.line.slice(oldCursor);
        this.refreshLine();
    }

    /** Redraw current line with cursor at correct position */
    refreshLine() {
        const prompt = this.getCurrentPrompt();
        this.terminal.write('\r\x1b[K' + prompt + this.line);
        this.moveCursorToPosition();
    }

    /** Move terminal cursor to match this.cursor position */
    moveCursorToPosition() {
        const promptLen = 4; // ">>> " or "... " (without ANSI codes)
        const targetCol = promptLen + this.cursor;
        this.terminal.write(`\r\x1b[${targetCol + 1}G`);
    }

    // =========================================================================
    // History Navigation
    // =========================================================================

    /** Navigate to previous command in history */
    historyUp() {
        if (this.history.length === 0) return;
        if (this.historyPos === -1) {
            this.historyPos = this.history.length - 1;
        } else if (this.historyPos > 0) {
            this.historyPos--;
        }
        this.setLine(this.history[this.historyPos]);
    }

    /** Navigate to next command in history */
    historyDown() {
        if (this.historyPos === -1) return;
        if (this.historyPos < this.history.length - 1) {
            this.historyPos++;
            this.setLine(this.history[this.historyPos]);
        } else {
            this.historyPos = -1;
            this.setLine('');
        }
    }

    /** Set current line content and move cursor to end */
    setLine(text) {
        this.line = text;
        this.cursor = text.length;
        this.refreshLine();
    }

    // =========================================================================
    // Multiline Input Detection
    // =========================================================================

    /**
     * Check if code is incomplete (needs continuation).
     * Detects unclosed braces, parentheses, or strings.
     */
    isIncomplete(code) {
        let braces = 0, parens = 0, inString = false;

        for (let i = 0; i < code.length; i++) {
            const char = code[i];
            const prev = i > 0 ? code[i - 1] : '';

            if (char === '"' && prev !== '\\') {
                inString = !inString;
            } else if (!inString) {
                if (char === '{') braces++;
                else if (char === '}') braces--;
                else if (char === '(') parens++;
                else if (char === ')') parens--;
            }
        }

        return inString || braces > 0 || parens > 0;
    }

    // =========================================================================
    // Command Execution
    // =========================================================================

    /** Handle Enter key - check for continuation or execute */
    handleEnter() {
        const currentLine = this.line;
        this.line = '';
        this.cursor = 0;
        this.historyPos = -1;

        // Accumulate multiline input
        this.multilineBuffer.push(currentLine);
        const fullCode = this.multilineBuffer.join('\n');

        // Check if input is incomplete
        if (this.isIncomplete(fullCode)) {
            this.terminal.write(CONTINUATION_PROMPT);
            return;
        }

        // Execute complete input
        const code = fullCode.trim();
        this.multilineBuffer = [];

        // Add to history (avoid duplicates)
        if (code && this.history[this.history.length - 1] !== code) {
            this.history.push(code);
        }

        if (!code) {
            this.terminal.write(PROMPT);
            return;
        }

        // Handle built-in commands
        if (code === 'clear') {
            this.terminal.clear();
        } else if (code === 'help') {
            this.terminal.write(MANPAGE.replace(/\n/g, '\r\n'));
        } else if (code.startsWith('%')) {
            this.handleMagicCommand(code);
        } else if (this.wasmLoaded && window.slox?.execute) {
            // Execute Lox code via WASM
            try {
                window.slox.execute(code);
            } catch (e) {
                this.terminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
            }
        } else {
            this.terminal.writeln('\x1b[38;5;242mWASM not available\x1b[0m');
        }

        this.terminal.write(PROMPT);
    }

    /** Handle magic commands (%env, %globals, %reset) */
    handleMagicCommand(cmd) {
        if (!this.wasmLoaded) {
            this.terminal.writeln('\x1b[38;5;242mWASM not available\x1b[0m');
            return;
        }

        const command = cmd.toLowerCase().trim();

        switch (command) {
            case '%env':
                try {
                    const env = window.slox.getEnvironment();
                    this.terminal.writeln(`\x1b[36mEnvironment:\x1b[0m ${env}`);
                } catch (e) {
                    this.terminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
                }
                break;

            case '%globals':
                try {
                    const globals = window.slox.getGlobals();
                    this.terminal.writeln(`\x1b[36mGlobals:\x1b[0m ${globals}`);
                } catch (e) {
                    this.terminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
                }
                break;

            case '%reset':
                try {
                    window.slox.reset();
                    this.terminal.writeln('\x1b[36mInterpreter state reset.\x1b[0m');
                } catch (e) {
                    this.terminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
                }
                break;

            default:
                this.terminal.writeln(`\x1b[31mUnknown magic command: ${cmd}\x1b[0m`);
                this.terminal.writeln('\x1b[38;5;242mAvailable: %env, %globals, %reset\x1b[0m');
        }
    }
}

// =============================================================================
// Entry Point
// =============================================================================

document.addEventListener('DOMContentLoaded', () => new SloxRepl());
