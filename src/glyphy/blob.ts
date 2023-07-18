import { AABB } from "./geometry/aabb.js";
import { Arc, ArcEndpoint } from "./geometry/arc.js";
import { glyphy_arc_list_extents } from "./geometry/arcs.js";
import { Line } from "./geometry/line.js";
import { Point } from "./geometry/point.js";
import { Vector } from "./geometry/vector.js";
import { glyphy_sdf_from_arc_list } from "./sdf.js";
import { GLYPHY_INFINITY, assert, float_equals, is_inf } from "./util.js";

const MAX_GRID_SIZE = 63;

const GLYPHY_MAX_D = 0.5

const MAX_X = 4095;
const MAX_Y = 4095;

export interface UnitArc {
	offset: number, // 此单元（去重后）在数据纹理中的 像素偏移（不是字节偏移）；

	sdf: number, // 方格中心对应的sdf

	show: string, // 用于Canvas显示的字符串

	data: ArcEndpoint[],

	origin_data: ArcEndpoint[], // 原始数据, 用于显示 点 (因为data 对 1, 0 做了优化)
}

export interface BlobArc {
	cell_size: number,

	width_cells: number,
	height_cells: number,

	tex_data: null | TexData,

	// 显示
	show: string,

	extents: AABB,
	data: UnitArc[][],
	avg_fetch_achieved: number,
}

/**
 * 找 距离 cell 最近的 圆弧，放到 near_endpoints 返回
 * Uses idea that all close arcs to cell must be ~close to center of cell.
 * @returns {number} 1 外；-1 内
 */
export const closest_arcs_to_cell = (
	// cell 坐标
	cx: number,
	cy: number,

	// cell 的 左上 和 右下 顶点 坐标
	c0: Point,
	c1: Point, /* corners */
	// 近距离的判断
	faraway: number,

	enlighten_max: number,
	embolden_max: number,

	// 改字体 所有的 圆弧
	endpoints: ArcEndpoint[],

	// 输出参数
	near_endpoints: ArcEndpoint[],
): [number, ArcEndpoint[]] => {
	let num_endpoints = endpoints.length;

	// This can be improved:
	let synth_max = Math.max(enlighten_max, embolden_max);
	faraway = Math.max(faraway, synth_max);

	// cell 的 中心
	let c = c0.midpoint(c1);
	// 所有的 圆弧到 中心 的 距离
	let [min_dist, effect_endpoints] = glyphy_sdf_from_arc_list(endpoints, c);

	let side = min_dist >= 0 ? +1 : -1;
	min_dist = Math.abs(min_dist);
	let near_arcs: Arc[] = [];

	// If d is the distance from the center of the square to the nearest arc, then
	// all nearest arcs to the square must be at most almost [d + half_diagonal] from the center.
	
	// 最近的意思：某个半径的 圆内
	// 放大一点点，否则 “我” 会有问题
	let half_diagonal = 5.0 + c.sub_point(c0).len();
	
	// CHANGE_ME: 减少半径
	let added = half_diagonal;
	// let added = min_dist + half_diagonal + synth_max;

	let radius_squared = added * added;

	if (min_dist - half_diagonal <= faraway) {
		let p0 = new Point();
		for (let i = 0; i < num_endpoints; i++) {
			let endpoint = endpoints[i];
			if (endpoint.d == GLYPHY_INFINITY) {
				p0 = endpoint.p;
				continue;
			}
			let arc = new Arc(p0, endpoint.p, endpoint.d);
			p0 = endpoint.p;

			if (arc.squared_distance_to_point(c) <= radius_squared)
				near_arcs.push(arc);
		}
	}

	let p1 = new Point();
	for (let i = 0; i < near_arcs.length; i++) {
		let arc = near_arcs[i];

		if (i == 0 || !p1.equals(arc.p0)) {
			let endpoint = new ArcEndpoint(arc.p0.x, arc.p0.y, GLYPHY_INFINITY);
			near_endpoints.push(endpoint);
			p1 = arc.p0;
		}

		let endpoint = new ArcEndpoint(arc.p1.x, arc.p1.y, arc.d);
		near_endpoints.push(endpoint);
		p1 = arc.p1;
	}

	return [side * min_dist, effect_endpoints];
}

export const glyphy_arc_list_encode_blob2 = (
	endpoints: ArcEndpoint[],
	faraway: number,
	grid_unit: number,
	enlighten_max: number,
	embolden_max: number,
	pextents: AABB): BlobArc => {

	let extents = new AABB();

	glyphy_arc_list_extents(endpoints, extents);

	if (extents.is_empty()) {
		// 不可显示 字符，比如 空格，制表符 等 
		pextents.set(extents);

		return {
			width_cells: 1,
			height_cells: 1,
			cell_size: 1,

			show: "",

			tex_data: null,

			extents: extents.clone(),
			data: [],
			avg_fetch_achieved: 0,
		}
	}

	// 添加 抗锯齿的 空隙
	extents.min_x -= faraway + embolden_max;
	extents.min_y -= faraway + embolden_max;
	extents.max_x += faraway + embolden_max;
	extents.max_y += faraway + embolden_max;

	let glyph_width = extents.max_x - extents.min_x;
	let glyph_height = extents.max_y - extents.min_y;
	let unit = Math.max(glyph_width, glyph_height);

	// 字符 的 glyph 被分成 grid_w * grid_h 个 格子
	let grid_w = Math.min(MAX_GRID_SIZE, Math.ceil(glyph_width / grid_unit));
	let grid_h = Math.min(MAX_GRID_SIZE, Math.ceil(glyph_height / grid_unit));

	if (glyph_width > glyph_height) {
		glyph_height = grid_h * unit / grid_w;
		extents.max_y = extents.min_y + glyph_height;
	} else {
		glyph_width = grid_w * unit / grid_h;
		extents.max_x = extents.min_x + glyph_width;
	}

	let cell_unit = unit / Math.max(grid_w, grid_h);

	// 每个 格子的 最近的 圆弧
	let near_endpoints: ArcEndpoint[] = [];

	let origin = new Point(extents.min_x, extents.min_y);
	let total_arcs = 0;

	let result_arcs: UnitArc[][] = []
	for (let row = 0; row < grid_h; row++) {
		let row_arcs: UnitArc[] = [];
		result_arcs.push(row_arcs);
		for (let col = 0; col < grid_w; col++) {

			let unit_arc: UnitArc = {
				offset: 0,
				sdf: 0,
				show: "",
				data: [],
				origin_data: [],
			};
			row_arcs.push(unit_arc)

			let cp0 = origin.add_vector(new Vector((col + 0) * cell_unit, (row + 0) * cell_unit));
			let cp1 = origin.add_vector(new Vector((col + 1) * cell_unit, (row + 1) * cell_unit));

			near_endpoints.length = 0;

			if (col === 20 && row === 0) {
				console.log(`col: ${col}, row: ${row}, cp0: ${cp0.x}, ${cp0.y}, cp1: ${cp1.x}, ${cp1.y}`)
			}

			// 判断 每个 格子 最近的 圆弧
			let [sdf, effect_endpoints] = closest_arcs_to_cell(
				col, row,
				cp0, cp1,
				faraway,
				enlighten_max,
				embolden_max,
				endpoints,
				near_endpoints
			);
			unit_arc.sdf = sdf;

			if (near_endpoints.length === 0) {
				near_endpoints = effect_endpoints;
			}

			// 线段，终点的 d = 0
			if (near_endpoints.length == 2 && near_endpoints[1].d == 0) {
				// unit_arc.data.push(near_endpoints[0]);
				// unit_arc.data.push(near_endpoints[1]);

				let start = near_endpoints[0];
				let end = near_endpoints[1];

				let line = Line.from_points(
					snap(start.p, extents, glyph_width, glyph_height),
					snap(end.p, extents, glyph_width, glyph_height)
				);

				// c 第一个网格的中心
				let c = new Point(extents.min_x + glyph_width * .5, extents.min_y + glyph_height * .5);

				// Shader的最后 要加回去
				line.c -= line.n.dot(c.into_vector());
				// shader 的 decode 要 乘回去
				line.c /= unit;

				let line_key = get_line_key(near_endpoints[0], near_endpoints[1]);
				let le = line_encode(line);
				
				let line_data = new ArcEndpoint(0.0, 0.0, 0.0);
				line_data.line_key = line_key;
				line_data.line_encode = le;

				unit_arc.data.push(line_data);
				
				unit_arc.origin_data.push(start);
				unit_arc.origin_data.push(end);

				continue;
			}

			// If the arclist is two arcs that can be combined in encoding if reordered, do that.
			if (near_endpoints.length === 4
				&& is_inf(near_endpoints[2].d)
				&& near_endpoints[0].p.x === near_endpoints[3].p.x
				&& near_endpoints[0].p.y === near_endpoints[3].p.y) {

				let e0 = near_endpoints[2];
				let e1 = near_endpoints[3];
				let e2 = near_endpoints[1];

				near_endpoints.length = 0;
				near_endpoints.push(e0);
				near_endpoints.push(e1);
				near_endpoints.push(e2);
			}

			// 编码到纹理：该格子 对应 的 圆弧数据
			for (let i = 0; i < near_endpoints.length; i++) {
				let endpoint = near_endpoints[i];
				unit_arc.data.push(endpoint)
			}
		}
	}

	pextents.set(extents);

	let data: BlobArc = {
		cell_size: cell_unit,
		width_cells: grid_w,
		height_cells: grid_h,

		show: "",

		tex_data: null,

		data: result_arcs,
		extents: extents.clone(),
		avg_fetch_achieved: 1 + total_arcs / (grid_w * grid_h)
	};

	let [min_sdf, max_sdf] = travel_data(data);

	data.show += `<br> 格子数：宽 = ${grid_w}, 高 = ${grid_h} <br>`;

	data.tex_data = encode_to_tex(data, extents, glyph_width, glyph_height, grid_w, grid_h, min_sdf, max_sdf);

	return data;
}

export interface TexData {
	index_tex: Uint8Array, // 字节数 = 2 * 像素个数
	data_tex: Uint8Array,  // 字节数 = 4 * 像素个数

	grid_w: number,
	grid_h: number,

	cell_size: number,

	max_offset: number,
	min_sdf: number,
	sdf_step: number,
}

// 两张纹理，索引纹理 和 数据纹理
// 
// 数据纹理：
//     32bit: [p.x, p.y, d]
//     按 数据 去重
//素，每像素 2B
// uniform: [max_offset, min_sdf,  索引纹理：共 grid_w * grid_h 个像sdf_step]
const encode_to_tex = (data: BlobArc, extents: AABB,
	glyph_width: number, glyph_height: number,
	grid_w: number, grid_h: number,
	min_sdf: number, max_sdf: number
): TexData => {

	let [data_map, data_tex] = encode_data_tex(data, extents, glyph_width, glyph_height);

	let max_offset = data_tex.length / 4;
	// 计算sdf的 梯度等级
	let level = Math.floor(2 ** 14 / max_offset) - 1;
	if (level < 1) {
		level = 1;
	}
	let sdf_range = max_sdf - min_sdf + 0.1;
	// 量化：将 sdf_range 分成 level 个区间，看 sdf 落在哪个区间
	let sdf_step = sdf_range / level;

	// 2 * grid_w * grid_h 个 Uint8
	let indiecs = [];
	for (let i = 0; i < data.data.length; ++i) {
		let row = data.data[i];
		for (let j = 0; j < row.length; ++j) {
			let unit_arc = row[j];
			let key = get_key(unit_arc);
			if (key) {
				let map_arc_data = data_map.get(key);
				if (!map_arc_data) {
					throw new Error("unit_arc not found");
				}

				let num_points = map_arc_data.data.length;
				if (num_points > 3) {
					num_points = 0;
				}

				let offset = map_arc_data.offset;
				let sdf = unit_arc.sdf;

				let [encode, sdf_index] = encode_to_uint16(num_points, offset, max_offset, sdf, min_sdf, sdf_step);
				
				indiecs.push(encode);

				let r = decode_from_uint16(encode, max_offset, min_sdf, sdf_step);
				
				if (r.num_points !== num_points || r.offset !== offset) {
					console.error(`encode index error: min_sdf: ${min_sdf}, max_sdf: ${max_sdf}, max_offset: ${max_offset}`);
					console.error(`encode index error: encode_to_uint16: num_points: ${num_points}, offset: ${offset}, sdf: ${sdf}, encode: ${encode}`);
					console.error(`encode index error: decode_from_uint16: num_points: ${r.num_points}, offset: ${r.offset}, sdf: ${r.sdf}`);
					console.error(``);

					throw new Error("encode index error")
				}

				// if (i === 16 && j === 15) {
				// 	console.warn(`encode index: num_points: ${num_points}, offset: ${offset}, sdf: ${sdf}, encode: ${encode}`);
				// }

				// 解码后的 sdf
				let dsdf = min_sdf + sdf_index * sdf_step;
				// unit_arc.show = `${num_points}:${dsdf.toFixed(1)}`;
				unit_arc.show = `${num_points}`;
				// unit_arc.show = `${offset}`;
			}
		}
	}

	let cell_size = data.cell_size;
	data.show += `<br> var max_offset = ${max_offset}, min_sdf = ${min_sdf.toFixed(2)}, max_sdf = ${max_sdf.toFixed(2)}, sdf_step = ${sdf_step.toFixed(2)}, cell_size = ${cell_size.toFixed(2)} <br>`;

	let level_sdf = [];
	for (let i = 0; i < level; i++) {
		let sdf = min_sdf + sdf_step * i;
		level_sdf.push(sdf.toFixed(2));
	}
	// data.show += `<br> sdf_level: ${level_sdf.join(", ")} <br>`;

	let index_tex = new Uint8Array(2 * indiecs.length);
	for (let i = 0; i < indiecs.length; i++) {
		let d = indiecs[i];
		index_tex[2 * i] = d & 0xff;
		index_tex[2 * i + 1] = d >> 8;
	}

	return {
		data_tex,
		index_tex,

		// unitform

		cell_size,

		grid_w,
		grid_h,

		max_offset,

		min_sdf,
		sdf_step,
	}
}

// 返回 u16，从高到低
// num_points: 2-bit
// offset + sdf: 14-bit
// 返回 [encode, sdf_index]
const encode_to_uint16 = (
	num_points: number,  // 只有 0，1，2，3 四个值

	offset: number,      // 数据 在 数据纹理 的偏移，单位：像素，介于 [0, max_offset] 之间
	max_offset: number,  // 最大的偏移，单位像素

	sdf: number,         // 浮点数，介于 [min_sdf, max_sdf] 之间
	min_sdf: number,     // sdf 的 最小值, 为负数表示内部
	sdf_step: number,
): [number, number] => {
	// 以区间的索引作为sdf的编码
	let sdf_index = Math.floor((sdf - min_sdf) / sdf_step);

	// 将 sdf_index 和 offset 编码到一个 uint16 中
	// 注：二维坐标 编码成 一维数字的常用做法
	let sdf_and_offset_index = sdf_index * max_offset + offset

	let r = (num_points << 14) | sdf_and_offset_index;
	r = r & 0xffff;
	return [r, sdf_index];
}

// value: u16，从高到低
// num_points: 2-bit
// offset + sdf: 14-bit
const decode_from_uint16 = (
	value: number,
	max_offset: number,
	min_sdf: number,
	sdf_step: number,

) => {
	let num_points = Math.floor(value / 16384);
	let sdf_and_offset_index = value % 16384;

	let sdf_index = Math.floor(sdf_and_offset_index / max_offset);
	let offset = sdf_and_offset_index % max_offset;

	let sdf = sdf_index * sdf_step + min_sdf;

	return { num_points, sdf, offset };
}

const get_line_key = (ep0: ArcEndpoint, ep1: ArcEndpoint) => {
	let key = ``;
	key += `${ep0.p.x}_${ep0.p.y}_${ep0.d}_`;
	key += `${ep1.p.x}_${ep1.p.y}_${ep1.d}_`;
	return key;
}

const get_key = (unit_arc: UnitArc) => {
	let key = ``;
	if (unit_arc.data.length === 1 && unit_arc.data[0].line_key) {
		// 线段
		key += unit_arc.data[0].line_key;
	}
	else {
		for (let endpoint of unit_arc.data) {
			key += `${endpoint.p.x}_${endpoint.p.y}_${endpoint.d}_`;
		}
	}
	return key;
}

// 按数据去重，并编码到纹理
const encode_data_tex = (data: BlobArc, extents: AABB, width_cells: number, height_cells: number): [Map<string, UnitArc>, Uint8Array] => {
	let map = new Map<string, UnitArc>()

	let before_size = 0;

	for (let row of data.data) {
		for (let unit_arc of row) {
			let key = get_key(unit_arc);
			before_size += unit_arc.data.length;
			if (key) {
				map.set(key, unit_arc);
			}
		}
	}

	let after_size = 0;
	for (let [_, value] of map) {
		after_size += value.data.length;
	}

	let r = [];

	// console.warn(`map size = ${map.size}, before_size = ${before_size}, after_size = ${after_size}, ratio = ${after_size / before_size}`)
	
	for (let k of map.keys()) {
		let unit_arc = map.get(k);
		if (!unit_arc) {
			throw new Error("unit_arc is null");
		}

		unit_arc.offset = r.length / 4;
		
		if (unit_arc.data.length === 1) {
			assert(unit_arc.data[0].line_encode !== null);
			if (unit_arc.data[0].line_encode !== null) {
				let e = unit_arc.data[0].line_encode;
				r.push(...e);
			}
		} else {
			for (let endpoint of unit_arc.data) {
				let qx = quantize_x(endpoint.p.x, extents, width_cells);
				let qy = quantize_y(endpoint.p.y, extents, height_cells);
				let rgba = arc_endpoint_encode(qx, qy, endpoint.d);

				// console.warn(`encode_data_tex ${r.length / 4}, (${endpoint.p.x.toFixed(1)}, ${endpoint.p.y.toFixed(1)}), d = ${endpoint.d.toFixed(2)}`)
				r.push(...rgba);
			}
		}

		// 单元的端点个数超过 3 个，补充一个全零像素代表结束；
		if (unit_arc.data.length > 3) {
			r.push(0, 0, 0, 0);
		}
	}

	data.show += `<br>数据纹理 像素数量: before = ${before_size}, after = ${r.length / 4}<br>`;

	let tex_data = new Uint8Array(r);

	return [map, tex_data];
}

const quantize_x = (x: number, extents: AABB, glyph_width: number): number => {
	return Math.round(MAX_X * ((x - extents.min_x) / glyph_width));
}

const quantize_y = (y: number, extents: AABB, glyph_height: number): number => {
	return Math.round(MAX_Y * ((y - extents.min_y) / glyph_height));
}

const dequantize_x = (x: number, extents: AABB, glyph_width: number): number => {
	return x / MAX_X * glyph_width + extents.min_x;
}

const dequantize_y = (y: number, extents: AABB, glyph_height: number): number => {
	return y / MAX_Y * glyph_height + extents.min_y;
}

const snap = (p: Point, extents: AABB, glyph_width: number, glyph_height: number): Point => {

	let qx = quantize_x(p.x, extents, glyph_width);
	let x = dequantize_x(qx, extents, glyph_width)

	let qy = quantize_y(p.y, extents, glyph_height);
	let y = dequantize_y(qy, extents, glyph_height);

	return new Point(x, y);
}

const upper_bits = (v: number, bits: number, total_bits: number): number => {
	return v >> (total_bits - bits);
}

const lower_bits = (v: number, bits: number, total_bits: number): number => {
	return v & ((1 << bits) - 1);
}

// 将 一个圆弧端点 编码为 RGBA, 4个字节
const arc_endpoint_encode = (ix: number, iy: number, d: number): [number, number, number, number] => {
	if (ix > MAX_X) {
		throw new Error("ix must be less than or equal to MAX_X");
	}
	if (iy > MAX_Y) {
		throw new Error("iy must be less than or equal to MAX_Y");
	}
	let id: number;
	if (is_inf(d)) {
		id = 0;
	} else {
		if (Math.abs(d) > GLYPHY_MAX_D) {
			throw new Error("d must be less than or equal to GLYPHY_MAX_D");
		}

		id = 128 + Math.round(d * 127 / GLYPHY_MAX_D);
	}
	if (id >= 256) {
		throw new Error("id must be less than 256");
	}
	const r = id;
	const g = lower_bits(ix, 8, 12);
	const b = lower_bits(iy, 8, 12);
	const a = ((ix >> 8) << 4) | (iy >> 8);

	return [r, g, b, a];
}

const travel_data = (blob: BlobArc) => {
	let min_sdf = Infinity;
	let max_sdf = -Infinity;

	// 初始化队列
	for (let i = 0; i < blob.data.length; ++i) {
		let row = blob.data[i];
		for (let j = 0; j < row.length; ++j) {
			let unit_arc = row[j];
			let curr_dist = unit_arc.sdf;

			if (curr_dist < min_sdf) {
				min_sdf = curr_dist;
			}
			if (curr_dist > max_sdf) {
				max_sdf = curr_dist;
			}
		}
	}

	return [min_sdf, max_sdf]
}

// rgba
const line_encode = (line: Line): [number, number, number, number] => {
	let l = line.normalized();

	let angle = l.n.angle();
	let ia = Math.round(-angle / Math.PI * 0x7FFF);
	let ua = ia + 0x8000;
	assert(0 == (ua & ~0xFFFF));

	let d = l.c;
	let id = Math.round(d * 0x1FFF);
	let ud = id + 0x4000;
	assert(0 == (ud & ~0x7FFF));
	ud |= 0x8000;

	return [ud >> 8, ud & 0xFF, ua >> 8, ua & 0xFF];
}

const line_decode = (encoded: [number, number, number, number], nominal_size: [number, number]) => {

	let ua = encoded[2] * 256 + encoded[3];
	let ia = ua - 0x8000;
	let angle = -ia / 0x7FFF * 3.14159265358979;

	const ud = (encoded[0] - 128) * 256 + encoded[1];
	
	const id = ud - 0x4000;
	const d = id / 0x1FFF;
	const scale = Math.max(nominal_size[0], nominal_size[1]);

	let n = new Vector(Math.cos(angle), Math.sin(angle));

	return Line.from_normal_d(n, d * scale);
}
