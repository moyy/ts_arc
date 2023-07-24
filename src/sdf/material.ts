import { mat4 } from "gl-matrix";
import { Camera } from "./camera";
import { Program } from "./program";

export class Material {
    program: null | Program;

    constructor() {
        this.program = null;
    }

    dispose(gl: WebGLRenderingContext) {

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