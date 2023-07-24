import { Camera } from "./camera";
import { Material } from "./material";
import { Program } from "./program";

let lastUseGeometry: null | Geometry = null;

export interface VBO {
    itemSize: number;
    numItems: number;

    id: null | WebGLBuffer;
}

export interface IBO {
    id: null | WebGLBuffer;

    numItems: number;
}

export class Geometry {
    drawCount: number;

    // key = string, value = VBO
    vbo: Map<string, VBO>;

    ibo: IBO;

    constructor(gl: WebGLRenderingContext) {
        this.drawCount = 1;

        this.vbo = new Map();

        this.ibo = {
            id: gl.createBuffer(),
            numItems: 0,
        };
    }

    dispose(gl: WebGLRenderingContext) {
        for (let [name, { id }] of this.vbo) {
            gl.deleteBuffer(id);
        }
        this.vbo.clear();

        if (this.ibo.id) {
            gl.deleteBuffer(this.ibo.id);
            this.ibo.id = 0;
        }
    }

    addAttribute(
        gl: WebGLRenderingContext,
        name: string,
        itemSize: number,
        value: number[]) {
        let vbo = this.vbo.get(name);
        if (!vbo) {
            vbo = {
                itemSize: 0,
                numItems: 0,
                id: gl.createBuffer(),
            };
            this.vbo.set(name, vbo);
        }

        gl.bindBuffer(gl.ARRAY_BUFFER, vbo.id);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(value), gl.STATIC_DRAW);

        vbo.itemSize = itemSize;
        vbo.numItems = value.length / vbo.itemSize;
    }

    setIndices(gl: WebGLRenderingContext, indices: number[]) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo.id);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        this.ibo.numItems = indices.length;
    }

    use(gl: WebGLRenderingContext, program: Program) {
        if (lastUseGeometry === this) {
            return this.ibo.numItems;
        }
        lastUseGeometry = this;

        for (let [name, {
            id,
            itemSize
        }] of this.vbo) {

            gl.bindBuffer(gl.ARRAY_BUFFER, id);

            let location = program.getAttribute(gl, name);

            if (location === undefined) {
                throw new Error(`getAttributeLocation failed, name = ${name}`);
            }

            gl.vertexAttribPointer(
                location,
                itemSize,
                gl.FLOAT,
                false,
                0,
                0
            );

            gl.enableVertexAttribArray(location);
        }

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo.id);

        return this.ibo.numItems;
    }
}

export class Mesh {
    drawCount: number;
    material: null | Material;
    geometry: null | Geometry;

    constructor(gl: WebGLRenderingContext, geometry: null | Geometry = null) {
        this.drawCount = 1;

        this.material = null;
        this.geometry = geometry ? geometry : new Geometry(gl);
    }

    dispose(gl: WebGLRenderingContext) {
        if (this.geometry) {
            this.geometry.dispose(gl);
            this.geometry = null;
        }

        if (this.material) {
            this.material.dispose(gl);
            this.material = null;
        }
    }

    setDrawCount(count: number) {
        this.drawCount = count;
    }

    setMaterial(m: Material) {
        this.material = m;
    }

    addAttribute(
        gl: WebGLRenderingContext,
        name: string,
        itemSize: number,
        value: number[]) {
        if (this.geometry) {
            this.geometry.addAttribute(gl, name, itemSize, value);
        }
    }

    setIndices(
        gl: WebGLRenderingContext,
        indices: number[]) {
        if (this.geometry) {
            this.geometry.setIndices(gl, indices);
        }
    }

    draw(
        gl: WebGLRenderingContext,
        camera: Camera
    ) {
        if (!this.material) {
            return;
        }
        if (!this.material.program) {
            return;
        }
        if(!this.geometry) {
            return;
        }
        
        this.material.use(gl, camera);

        let numItems = this.geometry.use(gl, this.material.program);

        for (let i = 0; i < this.drawCount; ++i) {
            gl.drawElements(gl.TRIANGLES, numItems, gl.UNSIGNED_SHORT, 0);
        }
    }
}