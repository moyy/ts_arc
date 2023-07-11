import { mat4 } from "gl-matrix";

export class Camera {
    uView: mat4;
    uProj: mat4;

    constructor() {
        this.uView = mat4.create();
        this.uProj = mat4.create();

        mat4.identity(this.uView);
        mat4.identity(this.uProj);

    }

    setSize(w: number, h: number) {
        mat4.ortho(this.uProj, 0, w, 0, h, -1.0, 1.0);
    }
}