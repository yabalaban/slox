// WASI Loader - Browser WASI shim for SwiftWasm
// This file provides WASI implementation for running Swift WASM in browsers

const WASI_ESUCCESS = 0;
const WASI_EBADF = 8;
const WASI_EINVAL = 28;
const WASI_ENOSYS = 52;

// Simple in-memory file descriptor
class FileDescriptor {
    constructor(data = new Uint8Array(0)) {
        this.data = data;
        this.offset = 0;
    }
    
    read(len) {
        const result = this.data.slice(this.offset, this.offset + len);
        this.offset += result.length;
        return result;
    }
    
    write(data) {
        this.data = new Uint8Array([...this.data, ...data]);
        return data.length;
    }
}

// Console output wrapper
class ConsoleOutput {
    constructor(writeFn) {
        this.writeFn = writeFn;
        this.buffer = '';
    }
    
    write(data) {
        const text = new TextDecoder().decode(data);
        this.buffer += text;
        const lines = this.buffer.split('
');
        for (let i = 0; i < lines.length - 1; i++) {
            this.writeFn(lines[i]);
        }
        this.buffer = lines[lines.length - 1];
        return data.length;
    }
    
    flush() {
        if (this.buffer) {
            this.writeFn(this.buffer);
            this.buffer = '';
        }
    }
}

export class WASI {
    constructor(args = [], env = [], fds = []) {
        this.args = args;
        this.env = env;
        this.fds = fds.length > 0 ? fds : [
            new FileDescriptor(), // stdin
            new ConsoleOutput(console.log), // stdout
            new ConsoleOutput(console.error) // stderr
        ];
        this.memory = null;
        this.view = null;
    }
    
    get wasiImport() {
        return {
            args_get: (argv, argv_buf) => {
                return WASI_ESUCCESS;
            },
            args_sizes_get: (argc, argv_buf_size) => {
                this.view.setUint32(argc, this.args.length, true);
                this.view.setUint32(argv_buf_size, 0, true);
                return WASI_ESUCCESS;
            },
            environ_get: (environ, environ_buf) => {
                return WASI_ESUCCESS;
            },
            environ_sizes_get: (environc, environ_buf_size) => {
                this.view.setUint32(environc, 0, true);
                this.view.setUint32(environ_buf_size, 0, true);
                return WASI_ESUCCESS;
            },
            clock_res_get: (id, resolution) => {
                this.view.setBigUint64(resolution, BigInt(1000000), true);
                return WASI_ESUCCESS;
            },
            clock_time_get: (id, precision, time) => {
                const now = BigInt(Date.now()) * BigInt(1000000);
                this.view.setBigUint64(time, now, true);
                return WASI_ESUCCESS;
            },
            fd_advise: () => WASI_ENOSYS,
            fd_allocate: () => WASI_ENOSYS,
            fd_close: (fd) => {
                if (this.fds[fd]) {
                    this.fds[fd] = null;
                    return WASI_ESUCCESS;
                }
                return WASI_EBADF;
            },
            fd_datasync: () => WASI_ENOSYS,
            fd_fdstat_get: (fd, stat) => {
                if (!this.fds[fd]) return WASI_EBADF;
                // filetype: character_device = 2
                this.view.setUint8(stat, 2);
                this.view.setUint16(stat + 2, 0, true); // flags
                this.view.setBigUint64(stat + 8, BigInt(0), true); // rights_base
                this.view.setBigUint64(stat + 16, BigInt(0), true); // rights_inheriting
                return WASI_ESUCCESS;
            },
            fd_fdstat_set_flags: () => WASI_ENOSYS,
            fd_fdstat_set_rights: () => WASI_ENOSYS,
            fd_filestat_get: () => WASI_ENOSYS,
            fd_filestat_set_size: () => WASI_ENOSYS,
            fd_filestat_set_times: () => WASI_ENOSYS,
            fd_pread: () => WASI_ENOSYS,
            fd_prestat_get: (fd, buf) => {
                return WASI_EBADF;
            },
            fd_prestat_dir_name: () => WASI_EBADF,
            fd_pwrite: () => WASI_ENOSYS,
            fd_read: (fd, iovs, iovs_len, nread) => {
                if (!this.fds[fd]) return WASI_EBADF;
                let totalRead = 0;
                for (let i = 0; i < iovs_len; i++) {
                    const ptr = this.view.getUint32(iovs + i * 8, true);
                    const len = this.view.getUint32(iovs + i * 8 + 4, true);
                    const data = this.fds[fd].read ? this.fds[fd].read(len) : new Uint8Array(0);
                    new Uint8Array(this.memory.buffer, ptr, data.length).set(data);
                    totalRead += data.length;
                }
                this.view.setUint32(nread, totalRead, true);
                return WASI_ESUCCESS;
            },
            fd_readdir: () => WASI_ENOSYS,
            fd_renumber: () => WASI_ENOSYS,
            fd_seek: (fd, offset, whence, newoffset) => {
                return WASI_ENOSYS;
            },
            fd_sync: () => WASI_ENOSYS,
            fd_tell: () => WASI_ENOSYS,
            fd_write: (fd, iovs, iovs_len, nwritten) => {
                if (!this.fds[fd]) return WASI_EBADF;
                let totalWritten = 0;
                for (let i = 0; i < iovs_len; i++) {
                    const ptr = this.view.getUint32(iovs + i * 8, true);
                    const len = this.view.getUint32(iovs + i * 8 + 4, true);
                    const data = new Uint8Array(this.memory.buffer, ptr, len);
                    if (this.fds[fd].write) {
                        totalWritten += this.fds[fd].write(data);
                    } else {
                        totalWritten += len;
                    }
                }
                this.view.setUint32(nwritten, totalWritten, true);
                return WASI_ESUCCESS;
            },
            path_create_directory: () => WASI_ENOSYS,
            path_filestat_get: () => WASI_ENOSYS,
            path_filestat_set_times: () => WASI_ENOSYS,
            path_link: () => WASI_ENOSYS,
            path_open: () => WASI_ENOSYS,
            path_readlink: () => WASI_ENOSYS,
            path_remove_directory: () => WASI_ENOSYS,
            path_rename: () => WASI_ENOSYS,
            path_symlink: () => WASI_ENOSYS,
            path_unlink_file: () => WASI_ENOSYS,
            poll_oneoff: () => WASI_ENOSYS,
            proc_exit: (code) => {
                throw new Error('Process exited with code ' + code);
            },
            proc_raise: () => WASI_ENOSYS,
            sched_yield: () => WASI_ESUCCESS,
            random_get: (buf, buf_len) => {
                const buffer = new Uint8Array(this.memory.buffer, buf, buf_len);
                crypto.getRandomValues(buffer);
                return WASI_ESUCCESS;
            },
            sock_accept: () => WASI_ENOSYS,
            sock_recv: () => WASI_ENOSYS,
            sock_send: () => WASI_ENOSYS,
            sock_shutdown: () => WASI_ENOSYS,
        };
    }
    
    initialize(instance) {
        this.memory = instance.exports.memory;
        this.view = new DataView(this.memory.buffer);
    }
}

export class File {
    constructor(data = []) {
        this.data = new Uint8Array(data);
        this.offset = 0;
    }
    
    read(len) {
        const result = this.data.slice(this.offset, this.offset + len);
        this.offset += result.length;
        return result;
    }
}

export class OpenFile {
    constructor(file) {
        this.file = file;
    }
    
    read(len) {
        return this.file.read(len);
    }
}

export const ConsoleStdout = {
    lineBuffered(writeFn) {
        return new ConsoleOutput(writeFn);
    }
};
