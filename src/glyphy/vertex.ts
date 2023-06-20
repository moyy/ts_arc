import { AABB } from "./geometry/aabb";
import { Point } from "./geometry/point";
import { assert } from "./util";

export class GlyphInfo {

	extents: AABB;

	// 晶格 的 宽-高
	nominal_w: number;
	nominal_h: number;

	// 数据 在 纹理 的 起始地址
	// 单个字符，永远为0
	atlas_x: number;
	atlas_y: number;

	constructor() {
		this.extents = new AABB();

		this.nominal_w = 0;
		this.nominal_h = 0;

		this.atlas_x = 0;
		this.atlas_y = 0;
	}
};

export interface GlyphyVertex {

	// 位置信息
	// 就是 该字符 包围盒 对应 的 位置
	x: number;
	y: number;

	// Glyph 信息，具体包含内容如下：
	//   + 纹理 起始位置
	//   + corner_x / corner_y: 0 代表 左 / 上，1代表 右 / 下
	//   + 格子个数（宽，高）
	g16hi: number;
	g16lo: number;
};

/**
 * 顶点数据，每字符 一个 四边形，2个三角形，6个顶点
 * 
 * 拐点: 0, 0, 1, 1
 * 
 * 通过 glyph_vertex_encode 函数 编码，数据如下：
 *    - 位置信息: x, y
 *	  - corner_x/corner_y: 0 代表 左/上，1代表 右/下
 *	  - 纹理信息: 纹理 起始位置, corner_x/corner_y, 格子个数（宽，高）
 */
export const add_glyph_vertices = (
	font_size: number,
	gi: GlyphInfo,
	extents: AABB | null = null,
): GlyphyVertex[] => {
	let r: GlyphyVertex[] = []

	r.push(encode_corner(0, 0, gi, font_size))
	r.push(encode_corner(0, 1, gi, font_size));
	r.push(encode_corner(1, 0, gi, font_size));
	r.push(encode_corner(1, 1, gi, font_size));

	if (extents) {
		extents.clear();
		for (let i = 0; i < 4; i++) {
			let p = new Point(r[i].x, r[i].y);
			extents.add(p);
		}
	}

	return r;
}

const encode_corner = (cx: number, cy: number, gi: GlyphInfo, font_size: number) => {
	let vx = font_size * ((1.0 - cx) * gi.extents.min_x + cx * gi.extents.max_x);

	let vy = font_size * ((1.0 - cy) * gi.extents.min_y + cy * gi.extents.max_y);

	return glyph_vertex_encode(vx, vy, cx, cy, gi);
}

/**
 * 顶点 编码
 */
const glyph_vertex_encode = (
	x: number, y: number,
	corner_x: number, corner_y: number, // 0 代表 左/上，1代表 右/下
	gi: GlyphInfo): GlyphyVertex => {

	let encoded = glyph_encode(
		gi.atlas_x, gi.atlas_y,
		corner_x, corner_y,
		gi.nominal_w, gi.nominal_h);

	return {
		x, y,
		g16hi: encoded >> 16,
		g16lo: encoded & 0xFFFF
	}
}

const glyph_encode = (
	atlas_x: number,  /* 7 bits */
	atlas_y: number,   /* 7 bits */

	corner_x: number,  /* 1 bit */
	corner_y: number,  /* 1 bit */

	nominal_w: number, /* 6 bits */
	nominal_h: number,  /* 6 bits */
): number => {
	assert(0 == (atlas_x & ~0x7F));
	assert(0 == (atlas_y & ~0x7F));

	assert(0 == (corner_x & ~1));
	assert(0 == (corner_y & ~1));

	assert(0 == (nominal_w & ~0x3F));
	assert(0 == (nominal_h & ~0x3F));

	// 共  16 位
	// 最高 2 位 --> 00
	//      7 位 --> 纹理偏移
	//      6 位 --> 网格宽高
	//   低 1 位 --> 是否 右下角
	let x = (((atlas_x << 6) | nominal_w) << 1) | corner_x;

	// 共 16位
	let y = (((atlas_y << 6) | nominal_h) << 1) | corner_y;

	return (x << 16) | y;
}
