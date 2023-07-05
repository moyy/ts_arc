/**
 * 模拟 glyphy库：字体渲染 的 圆弧 实现
 * 
 * 见 https://github.com/moyy/glyphy
 */

import { mat4 } from "gl-matrix";
import { TexData } from "glyphy/blob.js";
import { GlyphyVertex } from "glyphy/vertex.js";
import { Camera } from "./camera.js";
import { Material } from "./material.js";
import { Geometry, Mesh } from "./mesh.js";
import { Program, ProgramManager } from "./program.js";

export class Glyph {
    char: string;
    mesh: null | Mesh;

    constructor(
        gl: WebGLRenderingContext,
        char: string,
        verties: GlyphyVertex[],
        tex_data: TexData,
    ) {
        this.char = char;

        let g = createGeometry(gl, verties);
        this.mesh = this.createMesh(gl, g, tex_data);
    }

    draw(
        gl: WebGLRenderingContext,
        camera: Camera
    ) {
        if (this.mesh) {
            this.mesh.draw(gl, camera);
        }
    }

    dispose(gl: WebGLRenderingContext) {
        if (this.mesh) {
            this.mesh.dispose(gl);
            this.mesh = null;
        }
    }

    private createMesh(
        gl: WebGLRenderingContext,
        g: Geometry,
        tex_data: TexData,
    ) {
        let program = ProgramManager.getInstance().getProgram("glyphy.vs", "glyphy.fs");

        let data_texture = createDataTexture(gl, tex_data.data_tex);
        let index_texture = createIndexTexture(gl, tex_data.grid_w, tex_data.grid_h, tex_data.index_tex);

        if (!data_texture || !index_texture) {
            throw new Error("data_texture or index_texture is null");
        }

        let material = new GlyphyMaterial(gl, program, tex_data, data_texture, index_texture);
        if (!material) {
            throw new Error("GlyphyMaterial is null");
        }

        let mesh = new Mesh(gl, g);
        if (!mesh) {
            throw new Error("mesh is null");
        }

        mesh.setMaterial(material);
        return mesh;
    }
}

let g_gl: null | WebGLRenderingContext = null;
let map = new Map<string, Glyph>();

export const set_gl = (gl: WebGLRenderingContext) => {
    g_gl = gl
}

export const get_gl = () => {
    return g_gl;
}

export const set_glyph = (
    char: string,
    verties: GlyphyVertex[],

    tex_data: TexData,
) => {
    if (!g_gl) {
        throw new Error("g_gl is null");
    }

    let res = map.get(char);
    if (!res) {
        res = new Glyph(g_gl, char, verties, tex_data);
        map.set(char, res);
    }

    return res;
}

export const get_glyph = (char: string): null | Glyph => {
    let res = map.get(char);
    return res ? res : null;
}

export const delete_glyph = (char: string) => {
    let res = map.get(char);
    if (res && g_gl) {
        res.dispose(g_gl);
    }
    map.delete(char);
}

// 切换字体时，需要清空缓冲
export const clear_glyph = () => {
    map.clear();
}

export class GlyphyMaterial extends Material {
    data_texture: null | WebGLTexture;

    tex_data: TexData
    index_texture: null | WebGLTexture;

    uWorld: mat4;
    uColor: [number, number, number, number];

    program: Program

    constructor(
        gl: WebGLRenderingContext,
        program: Program,
        tex_data: TexData,
        data: WebGLTexture,
        index: WebGLTexture
    ) {
        super();

        this.program = program;
        this.data_texture = data;

        this.tex_data = tex_data;

        this.index_texture = index;

        this.uColor = [1.0, 0.0, 0.0, 1.0];

        this.uWorld = mat4.create();
        mat4.identity(this.uWorld);
    }

    dispose(gl: WebGLRenderingContext) {
        if (this.tex_data) {
            gl.deleteTexture(this.data_texture);
            this.data_texture = null;
        }
        if (this.index_texture) {
            gl.deleteTexture(this.index_texture);
            this.index_texture = null;
        }
    }

    setWorldMatrix(m: mat4) {
        this.uWorld = m;
    }

    setColor(r: number, g: number, b: number, a: number) {
        this.uColor = [r, g, b, a];
    }

    use(
        gl: WebGLRenderingContext,
        camera: Camera
    ) {
        let program = this.program;

        gl.useProgram(program.id);

        let tex_data = this.tex_data;
        // 如果 晶格的 sdf 在 [-check, check]，该晶格 和 字体轮廓 可能 相交 
        let check = tex_data.cell_size * 0.5 * Math.sqrt(2);

        let u_info = program.getUniform(gl, "u_info");
        if (u_info) {
            gl.uniform4f(u_info, tex_data.max_offset, tex_data.min_sdf, tex_data.sdf_step, check);
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.index_texture);

        let u_index_tex = program.getUniform(gl, "u_index_tex");
        if (u_index_tex) {
            gl.uniform1i(u_index_tex, 0);
        }

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.data_texture);

        let u_data_tex = program.getUniform(gl, "u_data_tex");
        if (u_data_tex) {
            gl.uniform1i(u_data_tex, 1);
        }

        let uColor = program.getUniform(gl, "uColor");
        if (uColor) {
            gl.uniform4f(uColor, ...this.uColor);
        }

        let uView = program.getUniform(gl, "uView");
        if (uView) {
            gl.uniformMatrix4fv(uView, false, camera.uView);
        }

        let uProj = program.getUniform(gl, "uProj");
        if (uProj) {
            gl.uniformMatrix4fv(uProj, false, camera.uProj);
        }

        let uWorld = program.getUniform(gl, "uWorld");
        if (uWorld) {
            gl.uniformMatrix4fv(uWorld, false, this.uWorld);
        }
    }
}

const createGeometry = (
    gl: WebGLRenderingContext,
    vs: GlyphyVertex[]
) => {
    let a_glyph_vertex = [
        vs[0].x, vs[0].y, vs[0].g16hi, vs[0].g16lo,
        vs[1].x, vs[1].y, vs[1].g16hi, vs[1].g16lo,
        vs[2].x, vs[2].y, vs[2].g16hi, vs[2].g16lo,
        vs[3].x, vs[3].y, vs[3].g16hi, vs[3].g16lo,
    ];

    let indices = [0, 1, 2, 1, 2, 3];

    let geometry = new Geometry(gl);

    geometry.setIndices(gl, indices);

    geometry.addAttribute(gl, "a_glyph_vertex", 4, a_glyph_vertex);

    return geometry;
}

const createDataTexture = (
    gl: WebGLRenderingContext,
    data: Uint8Array,
) => {
    let tex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.length / 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
}

const createIndexTexture = (
    gl: WebGLRenderingContext,
    tex_w: number,
    tex_h: number,
    data: Uint8Array, // 2 * tex_w * tex_h
) => {
    let tex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE_ALPHA, tex_w, tex_h, 0, gl.LUMINANCE_ALPHA, gl.UNSIGNED_BYTE, data);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
}