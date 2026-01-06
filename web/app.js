// slox Web REPL

const PROMPT = '\x1b[32m>>>\x1b[0m ';
const CONTINUATION_PROMPT = '\x1b[32m...\x1b[0m ';

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

class SloxRepl {
    constructor() {
        this.terminal = null;
        this.line = '';
        this.cursor = 0; // Cursor position within current line
        this.history = [];
        this.historyPos = -1;
        this.ready = false;
        this.wasmLoaded = false;
        this.multilineBuffer = []; // For multiline input
        this.init();
    }

    async init() {
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

        this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());
        this.terminal.open(document.getElementById('terminal'));

        // Resize handler to adjust rows only
        const resize = () => {
            const container = document.getElementById('terminal');
            const charHeight = 14 * 1.4; // fontSize * lineHeight
            const rows = Math.floor((container.clientHeight - 32) / charHeight);
            this.terminal.resize(80, Math.max(rows, 10));
        };
        window.addEventListener('resize', resize);
        resize();

        this.terminal.onData(data => this.handleInput(data));

        this.terminal.writeln('\x1b[1;32mslox\x1b[0m \x1b[38;5;242m- Lox interpreter in Swift/WASM\x1b[0m');
        this.terminal.writeln('\x1b[38;5;242mType "help" for language reference.\x1b[0m');
        this.terminal.writeln('');
        this.terminal.writeln('\x1b[38;5;242mInitializing WASM...\x1b[0m');

        await this.loadWasm();
    }

    async loadWasm() {
        const startTime = Date.now();

        try {
            window.slox = {};
            window.sloxReady = () => {};

            const response = await fetch('slox-wasm.wasm');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const wasmBytes = await response.arrayBuffer();
            const wasmSize = (wasmBytes.byteLength / 1024).toFixed(1);

            const { WASI, File, OpenFile, ConsoleStdout } = await import('./wasi-loader.js');
            const { SwiftRuntime } = await import('./javascriptkit-runtime.mjs');

            const terminal = this.terminal;
            const wasi = new WASI([], [], [
                new OpenFile(new File([])),
                ConsoleStdout.lineBuffered(msg => terminal.writeln(msg)),
                ConsoleStdout.lineBuffered(msg => console.error(msg)),
            ]);

            const swift = new SwiftRuntime();
            const { instance } = await WebAssembly.instantiate(wasmBytes, {
                wasi_snapshot_preview1: wasi.wasiImport,
                javascript_kit: swift.wasmImports
            });

            swift.setInstance(instance);
            wasi.initialize(instance);

            if (instance.exports._initialize) instance.exports._initialize();
            if (instance.exports.slox_init) instance.exports.slox_init();

            await new Promise(r => setTimeout(r, 50));

            if (window.slox?.initInterpreter) {
                const initOk = window.slox.initInterpreter(out => {
                    this.terminal.writeln(out);
                });
                if (!initOk) throw new Error('initInterpreter returned false');

                this.wasmLoaded = true;
                this.ready = true;

                const elapsed = Date.now() - startTime;
                this.terminal.writeln(`\x1b[32m✓\x1b[0m \x1b[38;5;242mReady (${wasmSize}KB, ${elapsed}ms)\x1b[0m`);
            } else {
                throw new Error('API initialization failed');
            }
        } catch (e) {
            console.error('WASM load error:', e);
            this.terminal.writeln(`\x1b[31m✗\x1b[0m \x1b[38;5;242mWASM error: ${e.message}\x1b[0m`);
            this.ready = true;
        }

        this.terminal.writeln('');
        document.getElementById('loading').classList.add('hidden');
        this.terminal.write(PROMPT);
        this.terminal.focus();
    }

    getCurrentPrompt() {
        return this.multilineBuffer.length > 0 ? CONTINUATION_PROMPT : PROMPT;
    }

    handleInput(data) {
        if (!this.ready) return;

        // Handle escape sequences
        if (data.startsWith('\x1b[')) {
            this.handleEscapeSequence(data);
            return;
        }
        if (data.startsWith('\x1b')) {
            // Other escape sequences - ignore
            return;
        }

        for (const char of data) {
            const code = char.charCodeAt(0);

            if (char === '\r' || char === '\n') {
                this.terminal.write('\r\n');
                this.handleEnter();
            } else if (code === 127 || code === 8) {
                // Backspace
                this.handleBackspace();
            } else if (char === '\x03') {
                // Ctrl+C - cancel
                this.line = '';
                this.cursor = 0;
                this.multilineBuffer = [];
                this.terminal.write('^C\r\n' + PROMPT);
            } else if (char === '\x0c') {
                // Ctrl+L - clear screen
                this.terminal.clear();
                this.terminal.write(this.getCurrentPrompt() + this.line);
                this.moveCursorToPosition();
            } else if (char === '\x01') {
                // Ctrl+A - beginning of line
                this.cursor = 0;
                this.refreshLine();
            } else if (char === '\x05') {
                // Ctrl+E - end of line
                this.cursor = this.line.length;
                this.refreshLine();
            } else if (char === '\x17') {
                // Ctrl+W - delete word backward
                this.deleteWordBackward();
            } else if (code >= 32) {
                // Printable character
                this.insertChar(char);
            }
        }
    }

    handleEscapeSequence(seq) {
        switch (seq) {
            case '\x1b[A': // Up arrow
                this.historyUp();
                break;
            case '\x1b[B': // Down arrow
                this.historyDown();
                break;
            case '\x1b[C': // Right arrow
                this.moveCursorRight();
                break;
            case '\x1b[D': // Left arrow
                this.moveCursorLeft();
                break;
            case '\x1b[H': // Home
            case '\x1b[1~':
                this.cursor = 0;
                this.refreshLine();
                break;
            case '\x1b[F': // End
            case '\x1b[4~':
                this.cursor = this.line.length;
                this.refreshLine();
                break;
            case '\x1b[3~': // Delete
                this.handleDelete();
                break;
            case '\x1b[1;5C': // Ctrl+Right - word right
                this.moveWordRight();
                break;
            case '\x1b[1;5D': // Ctrl+Left - word left
                this.moveWordLeft();
                break;
            default:
                // Unknown sequence - ignore
                break;
        }
    }

    insertChar(char) {
        this.line = this.line.slice(0, this.cursor) + char + this.line.slice(this.cursor);
        this.cursor++;
        this.refreshLine();
    }

    handleBackspace() {
        if (this.cursor > 0) {
            this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
            this.cursor--;
            this.refreshLine();
        }
    }

    handleDelete() {
        if (this.cursor < this.line.length) {
            this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1);
            this.refreshLine();
        }
    }

    moveCursorLeft() {
        if (this.cursor > 0) {
            this.cursor--;
            this.terminal.write('\x1b[D');
        }
    }

    moveCursorRight() {
        if (this.cursor < this.line.length) {
            this.cursor++;
            this.terminal.write('\x1b[C');
        }
    }

    moveWordLeft() {
        if (this.cursor === 0) return;
        // Skip spaces
        while (this.cursor > 0 && this.line[this.cursor - 1] === ' ') {
            this.cursor--;
        }
        // Skip word characters
        while (this.cursor > 0 && this.line[this.cursor - 1] !== ' ') {
            this.cursor--;
        }
        this.refreshLine();
    }

    moveWordRight() {
        if (this.cursor >= this.line.length) return;
        // Skip word characters
        while (this.cursor < this.line.length && this.line[this.cursor] !== ' ') {
            this.cursor++;
        }
        // Skip spaces
        while (this.cursor < this.line.length && this.line[this.cursor] === ' ') {
            this.cursor++;
        }
        this.refreshLine();
    }

    deleteWordBackward() {
        if (this.cursor === 0) return;
        const oldCursor = this.cursor;
        // Skip spaces
        while (this.cursor > 0 && this.line[this.cursor - 1] === ' ') {
            this.cursor--;
        }
        // Skip word characters
        while (this.cursor > 0 && this.line[this.cursor - 1] !== ' ') {
            this.cursor--;
        }
        this.line = this.line.slice(0, this.cursor) + this.line.slice(oldCursor);
        this.refreshLine();
    }

    refreshLine() {
        const prompt = this.getCurrentPrompt();
        this.terminal.write('\r\x1b[K' + prompt + this.line);
        this.moveCursorToPosition();
    }

    moveCursorToPosition() {
        // Move cursor to correct position
        const prompt = this.getCurrentPrompt();
        const promptLen = 4; // ">>> " or "... " without ANSI codes
        const targetCol = promptLen + this.cursor;
        this.terminal.write(`\r\x1b[${targetCol + 1}G`);
    }

    historyUp() {
        if (this.history.length === 0) return;
        if (this.historyPos === -1) {
            this.historyPos = this.history.length - 1;
        } else if (this.historyPos > 0) {
            this.historyPos--;
        }
        this.setLine(this.history[this.historyPos]);
    }

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

    setLine(text) {
        this.line = text;
        this.cursor = text.length;
        this.refreshLine();
    }

    // Check if input is incomplete (needs continuation)
    isIncomplete(code) {
        let braces = 0;
        let parens = 0;
        let inString = false;

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

    handleEnter() {
        const currentLine = this.line;
        this.line = '';
        this.cursor = 0;
        this.historyPos = -1;

        // Add to multiline buffer
        this.multilineBuffer.push(currentLine);
        const fullCode = this.multilineBuffer.join('\n');

        // Check if we need more input
        if (this.isIncomplete(fullCode)) {
            this.terminal.write(CONTINUATION_PROMPT);
            return;
        }

        // Complete input - execute it
        const code = fullCode.trim();
        this.multilineBuffer = [];

        if (code && this.history[this.history.length - 1] !== code) {
            this.history.push(code);
        }

        if (!code) {
            this.terminal.write(PROMPT);
            return;
        }

        if (code === 'clear') {
            this.terminal.clear();
        } else if (code === 'help') {
            this.terminal.write(MANPAGE.replace(/\n/g, '\r\n'));
        } else if (code.startsWith('%')) {
            this.handleMagicCommand(code);
        } else if (this.wasmLoaded && window.slox?.execute) {
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

document.addEventListener('DOMContentLoaded', () => new SloxRepl());
