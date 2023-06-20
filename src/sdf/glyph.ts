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
}

export const get_glyph = (char: string): null | Glyph => {
    let res = map.get(char);
    return res ? res : null;
}

// 切换字体时，需要清空缓冲
export const clear_glyph = () => {
    map.clear();
}

export class GlyphyMaterial extends Material {
    data_texture: WebGLTexture;

    tex_data: TexData
    index_texture: WebGLTexture;

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

    setWorldMatrix(m: mat4) {
        this.uWorld = m;
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

        let item_w = 64;
        let item_h_q = 8;

        let tex_data = this.tex_data;

        let u_info = program.getUniform(gl, "u_info");
        gl.uniform3f(u_info, tex_data.max_offset, tex_data.min_sdf, tex_data.sdf_step);
        
        let u_index_info = program.getUniform(gl, "u_index_info");
        gl.uniform4i(u_index_info, tex_data.grid_w, tex_data.grid_h, item_w, item_h_q);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.index_texture);

        let u_index_tex = program.getUniform(gl, "u_index_tex");
        gl.uniform1i(u_index_tex, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.data_texture);

        let u_data_tex = program.getUniform(gl, "u_data_tex");
        gl.uniform1i(u_data_tex, 1);

        let uColor = program.getUniform(gl, "uColor");
        gl.uniform4f(uColor, ...this.uColor);

        let uView = program.getUniform(gl, "uView");
        gl.uniformMatrix4fv(uView, false, camera.uView);

        let uProj = program.getUniform(gl, "uProj");
        gl.uniformMatrix4fv(uProj, false, camera.uProj);

        let uWorld = program.getUniform(gl, "uWorld");
        gl.uniformMatrix4fv(uWorld, false, this.uWorld);
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

    let indices = [0, 1, 2, 0, 2, 3];

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

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);

    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
}

const createIndexTexture = (
    gl: WebGLRenderingContext,
    tex_w: number,
    tex_h: number,
    data: Uint16Array,
) => {
    let tex = gl.createTexture();

    gl.bindTexture(gl.TEXTURE_2D, tex);

    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tex_w, tex_h, 0, gl.RGBA, gl.UNSIGNED_SHORT_4_4_4_4, null);

    let w = 64;
    let pixels = data.length / 4;
    let h = Math.ceil(pixels / w);

    let len = w * h - pixels;

    if (len > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h - 1, gl.RGBA, gl.UNSIGNED_SHORT_4_4_4_4, data);

        let data1 = data.slice(4 * w * (h - 1));
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, h - 1, data1.length / 4, 1, gl.RGBA, gl.UNSIGNED_SHORT_4_4_4_4, data1);
    } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_SHORT_4_4_4_4, data);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);

    return tex;
}

