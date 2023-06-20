import { Camera } from "./camera.js";
import { Program } from "./program.js";

export class Material {
    program: null | Program;

    constructor() {
        this.program = null;
    }

    use(
        gl: WebGLRenderingContext,
        camera: Camera) {

    }
}