// slox Web REPL - xterm.js integration with SwiftWasm

const PROMPT = '\x1b[32m>>> \x1b[0m';
const WELCOME_MESSAGE = `\x1b[1;35ms(wift)lox repl\x1b[0m – Lox language interpreter written in Swift/WASM
Type Lox code and press Enter to execute. Type \x1b[33menv\x1b[0m to see defined variables.
\x1b[90mExamples: print("Hello!"); | var x = 42; | fun add(a, b) { return a + b; }\x1b[0m

`;

class SloxRepl {
    constructor() {
        this.terminal = null;
        this.fitAddon = null;
        this.currentLine = '';
        this.history = [];
        this.historyIndex = -1;
        this.wasmReady = false;
        this.demoMode = false;

        this.init();
    }

    async init() {
        // Initialize xterm.js
        this.terminal = new Terminal({
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                cursorAccent: '#0d1117',
                selection: 'rgba(56, 139, 253, 0.4)',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#f0f6fc'
            },
            fontFamily: '"SF Mono", "Fira Code", "Consolas", monospace',
            fontSize: 14,
            lineHeight: 1.2,
            cursorBlink: true,
            cursorStyle: 'bar',
            scrollback: 1000
        });

        // Add fit addon
        this.fitAddon = new FitAddon.FitAddon();
        this.terminal.loadAddon(this.fitAddon);

        // Add web links addon
        const webLinksAddon = new WebLinksAddon.WebLinksAddon();
        this.terminal.loadAddon(webLinksAddon);

        // Open terminal
        const terminalElement = document.getElementById('terminal');
        this.terminal.open(terminalElement);
        this.fitAddon.fit();

        // Handle resize
        window.addEventListener('resize', () => {
            this.fitAddon.fit();
        });

        // Handle input
        this.terminal.onKey(({ key, domEvent }) => {
            this.handleKey(key, domEvent);
        });

        // Handle paste
        this.terminal.onData(data => {
            // Handle pasted text
            if (data.length > 1 && !data.startsWith('\x1b')) {
                this.handlePaste(data);
            }
        });

        // Write welcome message
        this.terminal.write(WELCOME_MESSAGE);

        // Load WASM
        await this.loadWasm();
    }

    async loadWasm() {
        const loadingEl = document.getElementById('loading');

        try {
            // Set up ready callback before loading WASM
            window.sloxReady = () => {
                console.log('WASM ready callback received');
            };

            // Initialize slox namespace
            window.slox = {};

            // Try to load carton-generated bundle first
            let wasmLoaded = false;

            // Check for carton bundle
            try {
                const bundleScript = document.createElement('script');
                bundleScript.src = 'slox-wasm.js';
                await new Promise((resolve, reject) => {
                    bundleScript.onload = resolve;
                    bundleScript.onerror = reject;
                    document.head.appendChild(bundleScript);
                });
                wasmLoaded = true;
            } catch (e) {
                console.log('Carton bundle not found, trying manual load...');
            }

            // If carton bundle not available, try manual loading
            if (!wasmLoaded) {
                await this.loadWasmManually();
            }

            // Wait a bit for WASM to initialize
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check if slox API is available
            if (window.slox && window.slox.initInterpreter) {
                window.slox.initInterpreter((output) => {
                    this.terminal.writeln(output);
                });
                this.wasmReady = true;
                loadingEl.classList.add('hidden');
                this.terminal.write(PROMPT);
                this.terminal.focus();
            } else {
                throw new Error('slox API not available after WASM initialization');
            }

        } catch (error) {
            console.error('Failed to load WASM:', error);

            // Fall back to demo mode
            this.terminal.writeln('\x1b[33mRunning in demo mode (WASM not available)\x1b[0m');
            this.terminal.writeln(`\x1b[90mReason: ${error.message}\x1b[0m\n`);
            this.wasmReady = true;
            this.demoMode = true;
            loadingEl.classList.add('hidden');
            this.terminal.write(PROMPT);
            this.terminal.focus();
        }
    }

    async loadWasmManually() {
        // Try to load the WASM module manually
        const response = await fetch('slox-wasm.wasm');
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM: ${response.status}`);
        }

        const wasmBytes = await response.arrayBuffer();

        // Dynamic imports for WASI and JavaScriptKit runtime
        const wasiShimUrl = 'https://unpkg.com/@bjorn3/browser-wasi-shim@0.3.0/dist/index.js';
        const jskRuntimeUrl = 'https://unpkg.com/javascript-kit-swift@0.19.2/Runtime/index.js';

        const { WASI, File, OpenFile, ConsoleStdout } = await import(wasiShimUrl);

        // Set up WASI with console output
        const terminal = this.terminal;
        const wasi = new WASI([], [], [
            new OpenFile(new File([])), // stdin
            ConsoleStdout.lineBuffered(msg => {
                terminal.writeln(msg);
            }),
            ConsoleStdout.lineBuffered(msg => {
                console.error('WASM stderr:', msg);
            }),
        ]);

        // Import JavaScriptKit runtime
        const { SwiftRuntime } = await import(jskRuntimeUrl);
        const swift = new SwiftRuntime();

        // Instantiate WASM
        const { instance } = await WebAssembly.instantiate(wasmBytes, {
            wasi_snapshot_preview1: wasi.wasiImport,
            javascript_kit: swift.wasmImports
        });

        // Initialize WASI and Swift runtime
        swift.setInstance(instance);
        wasi.initialize(instance);

        // Start the WASM module
        if (instance.exports._start) {
            instance.exports._start();
        } else if (instance.exports.main) {
            instance.exports.main();
        }
    }

    handleKey(key, domEvent) {
        const keyCode = domEvent.keyCode;

        // Prevent default for special keys
        if (domEvent.ctrlKey || domEvent.metaKey) {
            if (domEvent.key === 'c') {
                // Ctrl+C - cancel current line
                this.currentLine = '';
                this.terminal.write('^C\r\n' + PROMPT);
                return;
            }
            if (domEvent.key === 'l') {
                // Ctrl+L - clear screen
                domEvent.preventDefault();
                this.terminal.clear();
                this.terminal.write(PROMPT);
                return;
            }
            return;
        }

        if (keyCode === 13) {
            // Enter
            this.terminal.write('\r\n');
            this.execute(this.currentLine);
            if (this.currentLine.trim()) {
                this.history.push(this.currentLine);
            }
            this.currentLine = '';
            this.historyIndex = -1;
        } else if (keyCode === 8) {
            // Backspace
            if (this.currentLine.length > 0) {
                this.currentLine = this.currentLine.slice(0, -1);
                this.terminal.write('\b \b');
            }
        } else if (keyCode === 38) {
            // Up arrow - history
            if (this.history.length > 0) {
                if (this.historyIndex === -1) {
                    this.historyIndex = this.history.length - 1;
                } else if (this.historyIndex > 0) {
                    this.historyIndex--;
                }
                this.replaceCurrentLine(this.history[this.historyIndex]);
            }
        } else if (keyCode === 40) {
            // Down arrow - history
            if (this.historyIndex !== -1) {
                if (this.historyIndex < this.history.length - 1) {
                    this.historyIndex++;
                    this.replaceCurrentLine(this.history[this.historyIndex]);
                } else {
                    this.historyIndex = -1;
                    this.replaceCurrentLine('');
                }
            }
        } else if (keyCode >= 32 && keyCode <= 126) {
            // Printable characters
            this.currentLine += key;
            this.terminal.write(key);
        }
    }

    handlePaste(data) {
        // Filter to printable characters and handle line by line
        const lines = data.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].replace(/[^\x20-\x7E]/g, '');
            this.currentLine += line;
            this.terminal.write(line);

            if (i < lines.length - 1) {
                this.terminal.write('\r\n');
                this.execute(this.currentLine);
                if (this.currentLine.trim()) {
                    this.history.push(this.currentLine);
                }
                this.currentLine = '';
            }
        }
    }

    replaceCurrentLine(newLine) {
        // Clear current line
        const clearLength = this.currentLine.length;
        this.terminal.write('\b'.repeat(clearLength) + ' '.repeat(clearLength) + '\b'.repeat(clearLength));
        // Write new line
        this.currentLine = newLine;
        this.terminal.write(newLine);
    }

    execute(code) {
        const trimmed = code.trim();

        if (!trimmed) {
            this.terminal.write(PROMPT);
            return;
        }

        if (this.demoMode) {
            // Demo mode - simulate some basic output
            this.simulateExecution(trimmed);
        } else if (this.wasmReady && window.slox && window.slox.execute) {
            try {
                if (trimmed === 'env') {
                    const env = window.slox.getEnvironment();
                    this.terminal.writeln(env);
                } else {
                    window.slox.execute(trimmed);
                }
            } catch (error) {
                this.terminal.writeln(`\x1b[31mError: ${error.message}\x1b[0m`);
            }
        }

        this.terminal.write(PROMPT);
    }

    simulateExecution(code) {
        // Simple demo mode interpreter for when WASM isn't available
        if (code === 'env') {
            this.terminal.writeln('{}');
        } else if (code.startsWith('print(')) {
            const match = code.match(/print\s*\(\s*"([^"]*)"\s*\)/);
            if (match) {
                this.terminal.writeln(match[1]);
            } else {
                const numMatch = code.match(/print\s*\(\s*(\d+(?:\.\d+)?)\s*\)/);
                if (numMatch) {
                    this.terminal.writeln(numMatch[1]);
                } else {
                    this.terminal.writeln('\x1b[31m[Demo mode: Complex print expressions not supported]\x1b[0m');
                }
            }
        } else if (code.match(/^var\s+\w+\s*=\s*.+;?$/)) {
            // Variable declaration - silently accept
        } else if (code.match(/^fun\s+\w+\s*\(/)) {
            this.terminal.writeln('\x1b[33m[Demo mode: Function defined]\x1b[0m');
        } else if (code.match(/^class\s+\w+/)) {
            this.terminal.writeln('\x1b[33m[Demo mode: Class defined]\x1b[0m');
        } else if (code.match(/^\d+(\.\d+)?(\s*[+\-*/]\s*\d+(\.\d+)?)*;?$/)) {
            // Simple arithmetic
            try {
                const result = eval(code.replace(';', ''));
                this.terminal.writeln(`${result}`);
            } catch {
                this.terminal.writeln('\x1b[31m[Demo mode: Expression error]\x1b[0m');
            }
        } else {
            this.terminal.writeln('\x1b[90m[Demo mode: Statement executed]\x1b[0m');
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new SloxRepl();
});
