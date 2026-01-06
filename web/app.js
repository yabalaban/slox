// slox Web REPL

const PROMPT = '\x1b[38;5;242m>>>\x1b[0m ';
const WELCOME = `\x1b[1;32mslox\x1b[0m \x1b[38;5;242m– Lox interpreter in Swift/WASM\x1b[0m

`;

class SloxRepl {
    constructor() {
        this.terminal = null;
        this.fitAddon = null;
        this.line = '';
        this.history = [];
        this.historyPos = -1;
        this.ready = false;
        this.init();
    }

    async init() {
        this.terminal = new Terminal({
            theme: {
                background: '#0a0a0a',
                foreground: '#b0b0b0',
                cursor: '#4a4',
                cursorAccent: '#0a0a0a',
                selectionBackground: 'rgba(74, 170, 74, 0.3)',
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
            scrollback: 5000,
            allowProposedApi: true
        });

        this.fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this.fitAddon);
        this.terminal.loadAddon(new WebLinksAddon.WebLinksAddon());

        this.terminal.open(document.getElementById('terminal'));
        this.fitAddon.fit();

        window.addEventListener('resize', () => this.fitAddon.fit());

        // Use onData for all input - handles keyboard, paste, IME
        this.terminal.onData(data => this.handleInput(data));

        this.terminal.write(WELCOME);
        await this.loadWasm();
    }

    async loadWasm() {
        try {
            window.slox = {};
            window.sloxReady = () => {};

            const response = await fetch('slox-wasm.wasm');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const wasmBytes = await response.arrayBuffer();
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

            await new Promise(r => setTimeout(r, 100));

            if (window.slox?.initInterpreter) {
                window.slox.initInterpreter(out => this.terminal.writeln(out));
                this.ready = true;
            } else {
                throw new Error('API not available');
            }
        } catch (e) {
            this.terminal.writeln(`\x1b[38;5;242mWASM unavailable: ${e.message}\x1b[0m`);
            this.ready = true;
        }

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
            // Left/Right arrows - ignore for now
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
                // Start of escape sequence - skip
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
        // Clear current line and write new one
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

        if (code && this.ready && window.slox?.execute) {
            try {
                if (code === 'clear') {
                    this.terminal.clear();
                } else if (code === 'help') {
                    this.showHelp();
                } else {
                    window.slox.execute(code);
                }
            } catch (e) {
                this.terminal.writeln(`\x1b[31mError: ${e.message}\x1b[0m`);
            }
        }

        this.terminal.write(PROMPT);
    }

    showHelp() {
        this.terminal.writeln(`\x1b[1mslox commands:\x1b[0m
  \x1b[32mclear\x1b[0m     Clear the screen
  \x1b[32mhelp\x1b[0m      Show this help

\x1b[1mLox examples:\x1b[0m
  \x1b[38;5;242mprint("Hello");\x1b[0m
  \x1b[38;5;242mvar x = 42;\x1b[0m
  \x1b[38;5;242mfun fib(n) { if (n < 2) return n; return fib(n-1) + fib(n-2); }\x1b[0m
`);
    }
}

document.addEventListener('DOMContentLoaded', () => new SloxRepl());
