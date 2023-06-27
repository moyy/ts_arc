import { Camera } from "./camera.js";
import { get_glyph } from "./glyph.js";
import { ProgramManager } from "./program.js";

export class SdfContext {
    char: string;
    camera: Camera;

    canvas: HTMLCanvasElement;
    gl: WebGLRenderingContext;

    constructor(canvas: HTMLCanvasElement) {
        let gl = canvas.getContext("webgl", {
            antialias: false,
            alpha: false,
        });
        if (!gl) {
            throw new Error("Could not initialise WebGL");
        }

        this.gl = gl;
        this.char = "";
        this.canvas = canvas;
        this.camera = new Camera();
        this.init();
    }

    init() {
        let gl = this.gl;

        if (!gl.getExtension('OES_standard_derivatives')) {
            throw new Error("gl isn't support OES_standard_derivatives");
        }

        this.setSize();
        ProgramManager.getInstance().setGL(gl);

        this.initGLState();
    }

    setSize() {
        let gl = this.gl;

        let ratio = window.devicePixelRatio;

        let w = Math.round(ratio * this.canvas.clientWidth);
        let h = Math.round(ratio * this.canvas.clientHeight);

        if (w !== this.canvas.width || h !== this.canvas.height) {
            this.canvas.width = w;
            this.canvas.height = h;
            console.log("========= canvas resize = (" + w + ", " + h + ")");
        }

        this.camera.setSize(w, h);

        gl.viewport(0, 0, w, h);
        gl.scissor(0, 0, w, h);
    }

    setChar(char: string) {
        this.char = char;
    }

    drawChar() {
        let gl = this.gl;

        if (!this.char) {
            return;
        }

        let glyph = get_glyph(this.char);
        if (!glyph) {
            return;
        }

        this.setSize();

        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        glyph.draw(gl, this.camera);
    }

    draw() {
        this.drawChar();

        let that = this;
        requestAnimationFrame(() => {
            that.draw();
        })
    }

    initGLState() {
        let gl = this.gl;

        gl.clearColor(1.0, 1.0, 1.0, 1.0);

        gl.disable(gl.DEPTH_TEST);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
}
