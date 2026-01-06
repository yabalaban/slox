// slox Web REPL

const PROMPT = '\x1b[32m>>>\x1b[0m ';

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
        this.history = [];
        this.historyPos = -1;
        this.ready = false;
        this.wasmLoaded = false;
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
                window.slox.initInterpreter(out => this.terminal.writeln(out));
                this.wasmLoaded = true;
                this.ready = true;

                const elapsed = Date.now() - startTime;
                this.terminal.writeln(`\x1b[32m✓\x1b[0m \x1b[38;5;242mWASM loaded (${wasmSize}KB, ${elapsed}ms)\x1b[0m`);
            } else {
                throw new Error('API initialization failed');
            }
        } catch (e) {
            this.terminal.writeln(`\x1b[31m✗\x1b[0m \x1b[38;5;242mWASM error: ${e.message}\x1b[0m`);
            this.ready = true;
        }

        this.terminal.writeln('');
        document.getElementById('loading').classList.add('hidden');
        this.terminal.write(PROMPT);
        this.terminal.focus();
    }

    handleInput(data) {
        if (!this.ready) return;

        // Handle escape sequences as a unit
        if (data === '\x1b[A') {
            this.historyUp();
            return;
        }
        if (data === '\x1b[B') {
            this.historyDown();
            return;
        }
        if (data === '\x1b[C' || data === '\x1b[D') {
            return;
        }

        for (const char of data) {
            const code = char.charCodeAt(0);

            if (char === '\r' || char === '\n') {
                this.terminal.write('\r\n');
                this.execute();
            } else if (code === 127 || code === 8) {
                if (this.line.length > 0) {
                    this.line = this.line.slice(0, -1);
                    this.terminal.write('\b \b');
                }
            } else if (char === '\x03') {
                this.line = '';
                this.terminal.write('^C\r\n' + PROMPT);
            } else if (char === '\x0c') {
                this.terminal.clear();
                this.terminal.write(PROMPT + this.line);
            } else if (char === '\x1b') {
                return;
            } else if (code >= 32) {
                this.line += char;
                this.terminal.write(char);
            }
        }
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
        this.terminal.write('\r\x1b[K' + PROMPT + text);
        this.line = text;
    }

    execute() {
        const code = this.line.trim();
        this.line = '';
        this.historyPos = -1;

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
            this.terminal.write(MANPAGE);
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
}

document.addEventListener('DOMContentLoaded', () => new SloxRepl());
