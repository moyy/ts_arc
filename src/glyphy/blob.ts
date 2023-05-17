import { AABB } from "./geometry/aabb.js";
import { Arc, ArcEndpoint } from "./geometry/arc.js";
import { glyphy_arc_list_extents } from "./geometry/arcs.js";
import { Line } from "./geometry/line.js";
import { Point } from "./geometry/point.js";
import { Vector } from "./geometry/vector.js";
import { glyphy_sdf_from_arc_list } from "./sdf.js";
import { GLYPHY_INFINITY, is_inf } from "./util.js";

const MAX_GRID_SIZE = 63;

const MAX_X = 4095;
const MAX_Y = 4095;

export interface UnitArc {
	side: number, // 1 外；-1 内
	data: ArcEndpoint[]
}

export interface BlobArc {
	cell_size: number,
	width_cells: number,
	height_cells: number,
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
): number => {
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
	let added = min_dist + half_diagonal + synth_max;
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

	return side;
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
				side: 1,
				data: [],
			};
			row_arcs.push(unit_arc)

			let cp0 = origin.add_vector(new Vector((col + 0) * cell_unit, (row + 0) * cell_unit));
			let cp1 = origin.add_vector(new Vector((col + 1) * cell_unit, (row + 1) * cell_unit));

			near_endpoints.length = 0;

			// 判断 每个 格子 最近的 圆弧
			unit_arc.side = closest_arcs_to_cell(
				cp0, cp1,
				faraway,
				enlighten_max,
				embolden_max,
				endpoints,
				near_endpoints
			);

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

	return {
		cell_size: cell_unit,
		width_cells: grid_w,
		height_cells: grid_h,
		data: result_arcs,
		extents: extents.clone(),
		avg_fetch_achieved: 1 + total_arcs / (grid_w * grid_h)
	}
}
