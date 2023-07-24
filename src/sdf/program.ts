
// Shader 管理器
export class ProgramManager {

    gl: WebGLRenderingContext | null;

    sourceMap: Map<string, string>;

    programMap: Map<string, Program>;

    static getInstance() {
        return instance;
    }

    constructor() {
        this.gl = null;

        // key = string, value = string
        this.sourceMap = new Map();

        // key = string, value = class Program
        this.programMap = new Map();
    }

    setGL(gl: WebGLRenderingContext) {
        this.gl = gl;
    }

    addShader(key: string, source: string) {
        this.sourceMap.set(key, source);
    }

    // return class Program
    getProgram(vsKey: string, fsKey: string) {
        const key = `${vsKey}:${fsKey}`;
        let program = this.programMap.get(key);
        if (!program) {
            program = this._createProgram(vsKey, fsKey);
        }
        this.programMap.set(key, program);
        return program;
    }

    _createProgram(vsKey: string, fsKey: string) {
        let gl = this.gl;
        if (!gl) {
            throw new Error("gl is null");
        }

        let vsSource = this.sourceMap.get(vsKey);
        if (!vsSource) {
            throw new Error("vsSource is null");
        }

        let fsSource = this.sourceMap.get(fsKey);
        if (!fsSource) {
            throw new Error("fsSource is null");
        }

        let vs = this._createShader(gl, gl.VERTEX_SHADER, vsSource);
        if (!vs) {
            throw new Error("createShader failed");
        }
        let fs = this._createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!fs) {
            throw new Error("createShader failed");
        }

        let id = gl.createProgram();
        if (!id) {
            throw new Error("createProgram failed");
        }

        gl.attachShader(id, vs);
        gl.attachShader(id, fs);
        gl.linkProgram(id);

        if (!gl.getProgramParameter(id, gl.LINK_STATUS)) {
            let info = gl.getProgramInfoLog(id);
            throw new Error(info ? info : "linkProgram failed");
        }

        gl.deleteShader(vs);
        gl.deleteShader(fs);

        return new Program(id);
    }

    _createShader(
        gl: WebGLRenderingContext,
        type: number,
        source: string
    ) {
        let shader = gl.createShader(type);
        if (!shader) {
            throw new Error("createShader failed");
        }

        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            let info = gl.getShaderInfoLog(shader)
            throw new Error(info ? info : "compileShader failed");
        }

        return shader;
    }
}

export class Program {
    id: WebGLProgram;
    uniforms: Map<string, WebGLUniformLocation>;
    attributes: Map<string, number>;

    constructor(id: WebGLProgram) {
        this.id = id;

        this.uniforms = new Map();

        this.attributes = new Map();
    }

    getUniform(
        gl: WebGLRenderingContext,
        name: string,
    ) {
        let u = this.uniforms.get(name);
        if (!u) {
            let u1 = gl.getUniformLocation(this.id, name);
            if (u1) {
                u = u1;
                this.uniforms.set(name, u);
            }
        }
        return u;
    }

    getAttribute(
        gl: WebGLRenderingContext,
        name: string,
    ) {
        let a = this.attributes.get(name);
        if (typeof a !== typeof 0) {
            a = gl.getAttribLocation(this.id, name);
            if (typeof a !== typeof 0) {
                throw new Error(`getAttributeLocation failed, name = ${name}`);
            }
            this.attributes.set(name, a);
        }
        return a;
    }
}

Promise.resolve().then(() => {
    import("./glyphy.vs");

    import("./glyphy.fs");
})

let instance = new ProgramManager();