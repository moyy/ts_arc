import { AABB } from "./geometry/aabb.js";
import { Arc, ArcEndpoint } from "./geometry/arc.js";
import { glyphy_arc_list_extents } from "./geometry/arcs.js";
import { Point } from "./geometry/point.js";
import { Vector } from "./geometry/vector.js";
import { glyphy_sdf_from_arc_list } from "./sdf.js";
import { GLYPHY_INFINITY, is_inf } from "./util.js";

const MAX_GRID_SIZE = 63;

const GLYPHY_MAX_D = 0.5

const MAX_X = 4095;
const MAX_Y = 4095;

export interface UnitArc {
	offset: number, // 此单元（去重后）在数据纹理中的 像素偏移（不是字节偏移）；

	side: number, // 1 外；-1 内
	min_dist: number, // 方格中心对应的sdf

	data: ArcEndpoint[]
}

export interface BlobArc {
	cell_size: number,

	width_cells: number,
	height_cells: number,

	// 去重前 和 去重后的 端点 总数量
	before_pixels: number;
	after_pixels: number;

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
): [number, number] => {
	let num_endpoints = endpoints.length;

	// This can be improved:
	let synth_max = Math.max(enlighten_max, embolden_max);
	faraway = Math.max(faraway, synth_max);

	// cell 的 中心
	let c = c0.midpoint(c1);
	// 所有的 圆弧到 中心 的 距离
	let min_dist = glyphy_sdf_from_arc_list(endpoints, c);

	let side = min_dist >= 0 ? +1 : -1;
	min_dist = Math.abs(min_dist);
	let near_arcs: Arc[] = [];

	// If d is the distance from the center of the square to the nearest arc, then
	// all nearest arcs to the square must be at most almost [d + half_diagonal] from the center.
	// 最近的意思：某个半径的 圆内
	let half_diagonal = c.sub_point(c0).len();
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
			let endpoint = {
				p: arc.p0.clone(),
				d: GLYPHY_INFINITY
			};
			near_endpoints.push(endpoint);
			p1 = arc.p0;
		}

		let endpoint = {
			p: arc.p1,
			d: arc.d
		};

		near_endpoints.push(endpoint);
		p1 = arc.p1;
	}

	return [side, min_dist];
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

			before_pixels: 1,
			after_pixels: 1,

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
				side: 1,
				min_dist: 0,
				data: [],
			};
			row_arcs.push(unit_arc)

			let cp0 = origin.add_vector(new Vector((col + 0) * cell_unit, (row + 0) * cell_unit));
			let cp1 = origin.add_vector(new Vector((col + 1) * cell_unit, (row + 1) * cell_unit));

			near_endpoints.length = 0;

			// 判断 每个 格子 最近的 圆弧
			let [side, min_dist] = closest_arcs_to_cell(
				cp0, cp1,
				faraway,
				enlighten_max,
				embolden_max,
				endpoints,
				near_endpoints
			);
			unit_arc.side = side;
			unit_arc.min_dist = min_dist;

			// 线段，终点的 d = 0
			if (near_endpoints.length == 2 && near_endpoints[1].d == 0) {
				unit_arc.data.push(near_endpoints[0]);
				unit_arc.data.push(near_endpoints[1]);
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

	let data = {
		cell_size: cell_unit,
		width_cells: grid_w,
		height_cells: grid_h,

		before_pixels: 1,
		after_pixels: 1,

		data: result_arcs,
		extents: extents.clone(),
		avg_fetch_achieved: 1 + total_arcs / (grid_w * grid_h)
	};

	let [min_sdf, max_sdf] = travel_data(data);

	encode_to_tex(data, extents, glyph_width, glyph_height, grid_w, grid_h, min_sdf, max_sdf);

	return data;
}

// 两张纹理，索引纹理 和 数据纹理
// 
// 数据纹理：
//     32bit: [p.x, p.y, d]
//     按 数据 去重
// 索引纹理：共 grid_w * grid_h 个像素，每像素 2B
const encode_to_tex = (data: BlobArc, extents: AABB,
	glyph_width: number, glyph_height: number,
	grid_w: number, grid_h: number,
	min_sdf: number, max_sdf: number
) => {

	let [data_map, data_tex] = encode_data_tex(data, extents, glyph_width, glyph_height);

	// offset 最大位数
	let offset_bits = Math.ceil(Math.log2(data_tex.length / 4));

	// 2 * grid_w * grid_h 个 Uint8
	let indiecs = [];
	for (let row of data.data) {
		for (let unit_arc of row) {

			let num_points = 0;
			let side = unit_arc.side <= 0 ? 0 : 1;
			let min_dist = unit_arc.min_dist;
			let offset = 0;

			let key = get_key(unit_arc);
			if (key) {
				let map_arc_data = data_map.get(key);
				if (!map_arc_data) {
					throw new Error("unit_arc not found");
				}

				num_points = map_arc_data.data.length;
				if (num_points > 3) {
					num_points = 0;
				}

				offset = map_arc_data.offset;

				let r = encode_to_uint16(num_points, side, min_dist, offset, offset_bits, min_sdf, max_sdf);

				indiecs.push(r & 0xff);

				console.log(`offset_bits = ${offset_bits}, min_sdf = ${min_sdf}, max_sdf = ${max_sdf}`);

				console.log(`encode_to_uint16, r = ${r}`, { num_points, side, min_dist, offset });

				let r1 = decode_from_uint16(r, offset_bits, min_sdf, max_sdf);
				console.log("decode_from_uint16", r1);
			}
		}
	}
	return indiecs;
}

// 将下面数据编码成 UNSIGNED_SHORT_4_4_4_4, 共 2B
//    [15-14] num_endpoint, 2bit: 0, 1, 2, 3
//         0：到偏移处 一直 采样到 全0的像素 为止；
//	  [13] 0 SDF 为负，1 SDF 为正
//    [11-0]: abs_dist, offset
//        abs_dist = 0 全部都是内部
//        abs_dist 是浮点数，需要转换为定点数
//        offset 有 offset_bits 位。x >= Ceil(lg2(数据纹理的像素数量))
const encode_to_uint16 = (
	num_points: number,  // 只有 0，1，2，3 四个值
	side: number,        // 只有 0 或 1
	abs_dist: number,    // 大于0的浮点数
	offset: number,      // 正整数
	offset_bits: number, // 正整数
	min_sdf: number,     // abs_dist 的 最小值, 
	max_sdf: number      // abs_dist 的 最大值
): number => {
	// 计算 scaleFactor，需要确保 abs_dist 可以准确地被编码和解码
	const scaleFactor = (Math.pow(2, 12 - offset_bits) - 1) / (max_sdf - min_sdf);

	// 将浮点数 abs_dist 转换为定点数
	let fixedPointAbsDist = 0;

	// 当 abs_dist 不为 0 时，将其转换为定点数
	if (abs_dist !== 0) {
		fixedPointAbsDist = Math.round((abs_dist - min_sdf) * scaleFactor);
	}

	let result =
		(num_points << 14) |
		(side << 13) |
		(fixedPointAbsDist << offset_bits) |
		(offset & ((1 << offset_bits) - 1)); // 保证 offset 不会超出其分配的位数

	return result;
}

const decode_from_uint16 = (
	value: number,
	offset_bits: number,
	min_sdf: number,     // abs_dist 的 最小值, 
	max_sdf: number      // abs_dist 的 最大值
) => {
	let num_points = value >> 14;
	let side = (value >> 13) & 1;

	// 计算 scaleFactor
	const scaleFactor = (Math.pow(2, 12 - offset_bits) - 1) / (max_sdf - min_sdf);

	let fixedPointAbsDist = (value >> offset_bits) & ((1 << (12 - offset_bits)) - 1);
	let offset = value & ((1 << offset_bits) - 1);

	let abs_dist = 0;

	// 当 fixedPointAbsDist 不为 0 时，将其转换回浮点数
	if (fixedPointAbsDist !== 0) {
		abs_dist = fixedPointAbsDist / scaleFactor + min_sdf;
	}

	return { num_points, side, abs_dist, offset };
}

const get_key = (unit_arc: UnitArc) => {
	let key = ``;
	for (let endpoint of unit_arc.data) {
		key += `${endpoint.p.x}_${endpoint.p.y}_${endpoint.d}_`;
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

	data.before_pixels = before_size;
	data.after_pixels = after_size;

	let r = [];
	for (let unit_arc of map.values()) {
		unit_arc.offset = r.length / 4;
		for (let endpoint of unit_arc.data) {
			let qx = quantize_x(endpoint.p.x, extents, width_cells);
			let qy = quantize_y(endpoint.p.y, extents, height_cells);
			let rgba = arc_endpoint_encode(qx, qy, endpoint.d);
			r.push(...rgba);
		}

		// 单元的端点个数超过 3 个，补充一个全零像素代表结束；
		if (unit_arc.data.length > 3) {
			r.push(0, 0, 0, 0);
		}
	}

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

	let queue: [number, number, UnitArc][] = [];
	// 初始化队列
	for (let i = 0; i < blob.data.length; ++i) {
		let row = blob.data[i];
		for (let j = 0; j < row.length; ++j) {
			let unit_arc = row[j];
			if (unit_arc.data.length > 0) {
				queue.push([i, j, unit_arc]);
			}
		}
	}

	while (queue.length > 0) {
		let d = queue.shift();
		if (!d) {
			continue;
		}

		let [i, j, unit_arc] = d;
		if (unit_arc.min_dist < min_sdf) {
			min_sdf = unit_arc.min_dist;
		}
		if (unit_arc.min_dist > max_sdf) {
			max_sdf = unit_arc.min_dist;
		}

		let neibors = get_neibor(blob, i, j);
		for (let [ii, jj] of neibors) {
			let neibor_arc = blob.data[ii][jj];

			let new_dist = unit_arc.min_dist + blob.cell_size * Math.sqrt((ii - i) ** 2 + (jj - j) ** 2)
			if (neibor_arc.data.length === 0) {
				/// 没数据，就复制当前的过去
				if (neibor_arc.side >= 0) {
					// 中心点在里面，又没有相交，不处理
					neibor_arc.data = unit_arc.data;
					neibor_arc.min_dist = new_dist;
					queue.push([ii, jj, neibor_arc]);
				}
			} else {
				// 有数据，而且 旧数据 比 new_dist 大，就更新
				if (neibor_arc.min_dist > new_dist) {
					neibor_arc.data = unit_arc.data;
					neibor_arc.min_dist = new_dist;
					queue.push([ii, jj, neibor_arc]);
				}
			}
		}
	}

	return [min_sdf, max_sdf]
}

const get_neibor = (blob: BlobArc, i: number, j: number): [number, number][] => {
	let neibors: [number, number][] = [];

	let rows = blob.data.length;
	let cols = blob.data[0].length;

	for (let ii = i - 1; ii <= i + 1; ++ii) {
		// 边界不算邻居
		if (ii < 0 || ii >= rows) {
			continue;
		}

		for (let jj = j - 1; jj <= j + 1; ++jj) {
			// 边界不算邻居
			if (jj < 0 || jj >= cols) {
				continue;
			}

			// 本格子不算邻居
			if (ii == i && jj == j) {
				continue;
			}

			neibors.push([ii, jj])
		}
	}

	return neibors;
}