import { mat4 } from "gl-matrix";
import { Camera } from "./camera.js";
import { Program } from "./program.js";

export class Material {
    program: null | Program;

    constructor() {
        this.program = null;
    }

    clone(): Material {
        return new Material();
    }

    use(
        gl: WebGLRenderingContext,
        camera: Camera) {
    }

    setWorldMatrix(m: mat4) {
    }
}