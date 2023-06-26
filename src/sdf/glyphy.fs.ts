import { ProgramManager } from "./program.js";

ProgramManager.getInstance().addShader("glyphy.fs", `
	#extension GL_OES_standard_derivatives : enable

	precision highp float;

	// ================ begin demo-atlas.glsl

	// (max_offset, min_sdf, sdf_step)
	uniform vec3 u_info;

	uniform sampler2D u_index_tex;

	uniform sampler2D u_data_tex;
	
	// (grid_w, grid_h, item_w, item_h_q)
	// (纹理宽, 纹理高, 单元格宽, 单元格高) 
	uniform ivec4 u_index_info;
	
	vec4 glyphy_texture1D_func(
		int offset, 
		sampler2D tex, 
		ivec4 atlas_info, 
		ivec2 atlas_pos
	) {
		ivec2 item_geom = atlas_info.zw;
	
		// 将 1D 坐标 化成 2D 坐标，宽度是 item_geom.x 
		float x = mod(float(offset), float(item_geom.x));

		float y = float(offset) / float(item_geom.x);
	
		ivec2 v = atlas_pos.xy * item_geom + ivec2(x, y);
		vec2 fv = vec2(v);
	
		// + 0.5 移到 网格中心点 
		vec2 pos = (fv + vec2(0.5)) / vec2(atlas_info.xy);
	
		return texture2D(tex, pos);
	}

	// ================ end demo-atlas.glsl

	// ================ begin glyphy-common.glsl
	
	#ifndef GLYPHY_INFINITY
		#define GLYPHY_INFINITY 1e9
	#endif

	#ifndef GLYPHY_EPSILON
		#define GLYPHY_EPSILON  1e-5
	#endif

	// 从 p0 到 p1 的 圆弧
	// 2 * d 为 tan(弧心角)
	// d = 0 代表 这是 一条线段 
	struct glyphy_arc_t {
		vec2  p0;
		vec2  p1;
		float d;
	};

	// 圆弧 端点 
	struct glyphy_arc_endpoint_t {
		// 圆弧 第二个 端点 
		vec2  p;
		
		/** 
		 * d = 0 表示 这是一个 line 
		 * d = Infinity 表示 该点是 move_to 语义，通过 glyphy_isinf() 判断 
		 */
		float d;
	};

	// 列表  
	struct glyphy_arc_list_t {
		
		// 端点的数量 
		// 为 0 代表 远离 内测 或 外侧，这时 side 值 有效 
		// 为 -1 代表 该列表 是 线段，这时 line_* 有效  
		int num_endpoints;

		// num_endpoints = 0 时，该值表示 内(-1) / 外(+1)
		// 否则，该值 为 0，没啥用 
		int side;
		
		// 距离 glypy blob 的 偏移量 
		int offset;

		// 如果是 线段，倾斜多少度？ 
		// A single line is all we care about.  It's right here 
		float line_angle;
		// 到 nominal glyph 中心 的距离 
		float line_distance;
	};

	// 超过 最大值的 一半，就是 无穷 
	bool glyphy_isinf(const float v)
	{
		return abs (v) >= GLYPHY_INFINITY * 0.5;
	}

	// 小于 最小值 的 两倍 就是 0 
	bool glyphy_iszero(const float v)
	{
		return abs (v) <= GLYPHY_EPSILON * 2.0;
	}

	// v 的 垂直向量 
	vec2 glyphy_ortho(const vec2 v)
	{
		return vec2 (-v.y, v.x);
	}

	// [0, 1] 浮点 --> byte 
	int glyphy_float_to_byte(const float v)
	{
		return int (v * (256.0 - GLYPHY_EPSILON));
	}

	// [0, 1] 浮点 --> byte 
	ivec4 glyphy_vec4_to_bytes(const vec4 v)
	{
		return ivec4 (v * (256.0 - GLYPHY_EPSILON));
	}

	// 浮点编码，变成两个 整数 
	ivec2 glyphy_float_to_two_nimbles(const float v)
	{
		int f = glyphy_float_to_byte (v);

		return ivec2 (f / 16, int(mod (float(f), 16.0)));
	}

	// returns tan (2 * atan (d))
	float glyphy_tan2atan(const float d)
	{
		return 2.0 * d / (1.0 - d * d);
	}

	// 解码 arc 端点 
	glyphy_arc_endpoint_t glyphy_arc_endpoint_decode(const vec4 v, const ivec2 nominal_size)
	{
		vec2 p = (vec2 (glyphy_float_to_two_nimbles (v.a)) + v.gb) / 16.0;
		float d = v.r;
		if (d == 0.0) {
			d = GLYPHY_INFINITY;
		} else {
			#define GLYPHY_MAX_D 0.5
		
			d = float(glyphy_float_to_byte (d) - 128) * GLYPHY_MAX_D / 127.0;
		
			#undef GLYPHY_MAX_D
		}

		return glyphy_arc_endpoint_t (p * vec2(nominal_size), d);
	}

	// 取 arc 的 圆心 
	vec2 glyphy_arc_center(const glyphy_arc_t a)
	{
		return mix (a.p0, a.p1, 0.5) +
			glyphy_ortho(a.p1 - a.p0) / (2.0 * glyphy_tan2atan(a.d));
	}

	// 判断是否 尖角内 
	bool glyphy_arc_wedge_contains(const glyphy_arc_t a, const vec2 p)
	{
		float d2 = glyphy_tan2atan (a.d);

		return dot (p - a.p0, (a.p1 - a.p0) * mat2(1,  d2, -d2, 1)) >= 0.0 &&
			dot (p - a.p1, (a.p1 - a.p0) * mat2(1, -d2,  d2, 1)) <= 0.0;
	}

	float glyphy_arc_wedge_signed_dist_shallow(const glyphy_arc_t a, const vec2 p)
	{
		vec2 v = normalize (a.p1 - a.p0);
		float line_d = dot (p - a.p0, glyphy_ortho (v));
		if (a.d == 0.0)
		return line_d;

		float d0 = dot ((p - a.p0), v);
		if (d0 < 0.0) {
			return sign (line_d) * distance (p, a.p0);
		}

		float d1 = dot ((a.p1 - p), v);
		if (d1 < 0.0) {
			return sign (line_d) * distance (p, a.p1);
		}
		
		float r = 2.0 * a.d * (d0 * d1) / (d0 + d1);
		if (r * line_d > 0.0) {
			return sign (line_d) * min (abs (line_d + r), min (distance (p, a.p0), distance (p, a.p1)));
		}

		return line_d + r;
	}

	float glyphy_arc_wedge_signed_dist(const glyphy_arc_t a, const vec2 p)
	{
		if (abs (a.d) <= 0.03) {
			return glyphy_arc_wedge_signed_dist_shallow (a, p);
		}
		
		vec2 c = glyphy_arc_center (a);
		return sign (a.d) * (distance (a.p0, c) - distance (p, c));
	}

	// 点 到 圆弧 的 距离
	float glyphy_arc_extended_dist(const glyphy_arc_t a, const vec2 p)
	{
		// Note: this doesn't handle points inside the wedge.
		vec2 m = mix(a.p0, a.p1, 0.5);

		float d2 = glyphy_tan2atan(a.d);

		if (dot(p - m, a.p1 - m) < 0.0) {
			return dot(p - a.p0, normalize((a.p1 - a.p0) * mat2(+d2, -1, +1, +d2)));
		} else {
			return dot(p - a.p1, normalize((a.p1 - a.p0) * mat2(-d2, -1, +1, -d2)));
		}
	}

	// 取 列表信息 偏移 
	int glyphy_arc_list_offset(const vec2 p, const ivec2 nominal_size)
	{
		ivec2 cell = ivec2 (clamp (floor (p), vec2 (0.,0.), vec2(nominal_size - 1)));

		return cell.y * nominal_size.x + cell.x;
	}

	// 解码 列表信息 
	glyphy_arc_list_t glyphy_arc_list_decode(const vec4 v, const ivec2 nominal_size)
	{
		glyphy_arc_list_t l;
		ivec4 iv = glyphy_vec4_to_bytes (v);

		l.side = 0; // 默认 没有用 

		if (iv.r == 0) { // 圆弧列表 
			l.offset = (iv.g * 256) + iv.b;
			
			l.num_endpoints = iv.a;

			if (l.num_endpoints == 255) {
				// 和 C代码 约定: 端点数为 255 表示 里面 
				l.num_endpoints = 0;
				l.side = -1;
			} else if (l.num_endpoints == 0) {
				// 和 C代码 约定: 端点数为 0 表示 里面 
				l.side = +1;
			}
		} else { // 线段 
			l.num_endpoints = -1;

			l.line_distance = float(((iv.r - 128) * 256 + iv.g) - 0x4000) / float (0x1FFF)
							* max (float (nominal_size.x), float (nominal_size.y));

			l.line_angle = float(-((iv.b * 256 + iv.a) - 0x8000)) / float (0x7FFF) * 3.14159265358979;
		}

		return l;
	}

	// ================ end glyphy-common.glsl

	#define GLYPHY_SDF_PSEUDO_DISTANCE 1

	// ================ begin glyphy-sdf.glsl

	#ifndef GLYPHY_MAX_NUM_ENDPOINTS
		#define GLYPHY_MAX_NUM_ENDPOINTS 32
	#endif

	glyphy_arc_list_t glyphy_arc_list(const vec2 p, const ivec2 nominal_size, sampler2D tex, ivec4 atlas_info, ivec2 atlas_pos) {
		int cell_offset = glyphy_arc_list_offset(p, nominal_size);

		vec4 arc_list_data = glyphy_texture1D_func(cell_offset, tex, atlas_info, atlas_pos).rgba;
		
		return glyphy_arc_list_decode(arc_list_data, nominal_size);
	}

	// 重点 计算 sdf 
	float glyphy_sdf(const vec2 p, const ivec2 nominal_size, sampler2D tex, ivec4 atlas_info, ivec2 atlas_pos) {

		glyphy_arc_list_t arc_list = glyphy_arc_list(p, nominal_size, tex, atlas_info, atlas_pos);

		if(arc_list.num_endpoints == 0) { // 远离 边缘，直接返回即可 
			return GLYPHY_INFINITY * float(arc_list.side);
		}
		
		if(arc_list.num_endpoints == -1) { // 线段 
			float angle = arc_list.line_angle;
			
			vec2 n = vec2(cos(angle), sin(angle));
			
			return dot(p - (vec2(nominal_size) * 0.5), n) - arc_list.line_distance;
		}

		float side = float(arc_list.side);
		float min_dist = GLYPHY_INFINITY;
		glyphy_arc_t closest_arc;

		vec4 rgba = glyphy_texture1D_func(arc_list.offset, tex, atlas_info, atlas_pos).rgba;
		
		glyphy_arc_endpoint_t endpoint = glyphy_arc_endpoint_decode(rgba, nominal_size);
		vec2 pp = endpoint.p;
		
		// 1个像素 最多 32次 采样 
		for(int i = 1; i < GLYPHY_MAX_NUM_ENDPOINTS; i++) {
			// 如果 到达 记录的 端点数，结束 
			if(i >= arc_list.num_endpoints) {
				break;
			}

			vec4 rgba = glyphy_texture1D_func(arc_list.offset + i, tex, atlas_info, atlas_pos).rgba;

			endpoint = glyphy_arc_endpoint_decode(rgba, nominal_size);
			
			glyphy_arc_t a = glyphy_arc_t(pp, endpoint.p, endpoint.d);

			// 无穷的 d 代表 Move 语义 
			if(glyphy_isinf(a.d)) {
				pp = endpoint.p;
				continue;
			}

			if(glyphy_arc_wedge_contains(a, p)) { // 处理 尖角 
				float sdist = glyphy_arc_wedge_signed_dist(a, p);
				float udist = abs(sdist) * (1.0 - GLYPHY_EPSILON);

				if(udist <= min_dist) {
					min_dist = udist;
					side = sdist <= 0. ? -1.0 : +1.0;
				}
			} else {
				float udist = min(distance(p, a.p0), distance(p, a.p1));

				if(udist < min_dist - GLYPHY_EPSILON) {
					min_dist = udist;
					side = 0.0; /* unsure */
					closest_arc = a;
				} else if(side == 0.0 && udist - min_dist <= GLYPHY_EPSILON) {
					/** 
					 * If this new distance is the same as the current minimum,
					 * compare extended distances.  Take the sign from the arc
					 * with larger extended distance. 
					 */

					float old_ext_dist = glyphy_arc_extended_dist(closest_arc, p);
					float new_ext_dist = glyphy_arc_extended_dist(a, p);

					float ext_dist = abs(new_ext_dist) <= abs(old_ext_dist) ? old_ext_dist : new_ext_dist;

					#ifdef GLYPHY_SDF_PSEUDO_DISTANCE
						// For emboldening and stuff:
						min_dist = abs(ext_dist);
					#endif
		
					side = sign(ext_dist);
				}
			}
			pp = endpoint.p;
		} // 最多 32次 采样结束 

		if(side == 0.) {
			// Technically speaking this should not happen, but it does.  So try to fix it.
			float ext_dist = glyphy_arc_extended_dist(closest_arc, p);
			side = sign(ext_dist);
		}

		return min_dist * side;
	}

	float glyphy_point_dist(const vec2 p, const ivec2 nominal_size, sampler2D tex, ivec4 atlas_info, ivec2 atlas_pos) {

		glyphy_arc_list_t arc_list = glyphy_arc_list(p, nominal_size, tex, atlas_info, atlas_pos);

		float side = float(arc_list.side);
		float min_dist = GLYPHY_INFINITY;

		if(arc_list.num_endpoints == 0) {
			return min_dist;
		}

		glyphy_arc_endpoint_t endpoint;

		for(int i = 0; i < GLYPHY_MAX_NUM_ENDPOINTS; i++) {
			if(i >= arc_list.num_endpoints) {
				break;
			}
			
			vec4 rgba = glyphy_texture1D_func(arc_list.offset + i, tex, atlas_info, atlas_pos).rgba;
			
			endpoint = glyphy_arc_endpoint_decode(rgba, nominal_size);
			
			if(glyphy_isinf(endpoint.d)) {
				continue;
			}
			
			min_dist = min(min_dist, distance(p, endpoint.p));
		}

		return min_dist;
	}

	// ================ end glyphy-sdf.glsl

	// ================ begin demo-fshader.glsl

	// (网格的边界-宽, 网格的边界-高, z, w)
	// z(有效位 低15位) --> (高7位:纹理偏移.x, 中6位:网格宽高.x, 低2位: 00) 
	// w(有效位 低15位) --> (高7位:纹理偏移.y, 中6位:网格宽高.y, 低2位: 00) 
	varying vec4 v_glyph;

	// 1.0 / sqrt(2.0)
	#define SQRT2_2 0.70710678118654757 

	// sqrt(2.0)
	#define SQRT2   1.4142135623730951

	struct glyph_info_t {
		// 网格 宽度，高度 的 格子数量 
		ivec2 nominal_size;

		// 纹理头部的 索引 
		ivec2 atlas_pos;

		float sdf;

		
	};

	// 解码 
	// v.x (有效位 低15位) --> (高7位:纹理偏移.x, 中6位:网格宽高.x, 低2位: 00) 
	// v.y (有效位 低15位) --> (高7位:纹理偏移.y, 中6位:网格宽高.y, 低2位: 00) 
	glyph_info_t glyph_info_decode(vec2 v) {
		glyph_info_t gi;

		// mod 256 取低8位
		// 除4 取低8位中的 高6位
		// TODO +2 不了解什么意思 
		gi.nominal_size = (ivec2(mod(v, 256.)) + 2) / 4;

		// 去掉 低8位的 信息 
		gi.atlas_pos = ivec2(v) / 256;

		return gi;
	}

	// 抗锯齿 1像素 
	// d 在 [a, b] 返回 [0.0, 1.0] 
	float antialias(float d) {
		float b = 0.5;
		float a = -b;

		float r = (-d - a) / (b - a);

		return clamp(r, 0.0, 1.0);
	}

	void main() {
		vec2 p = v_glyph.xy;

		// 解码 p
		glyph_info_t gi = glyph_info_decode(v_glyph.zw);
	
		// 重点：计算 SDF 
		float gsdist = glyphy_sdf(p, gi.nominal_size, u_index_tex, u_index_info, gi.atlas_pos);

		// 均匀缩放 
		float scale = SQRT2 / length(fwidth(p));

		float sdist = gsdist * scale;

		float alpha = antialias(sdist);
		gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
	}

	// ================ end demo-fshader.glsl
`);