import { ProgramManager } from "./program.js";

ProgramManager.getInstance().addShader("glyphy.fs", `

#extension GL_OES_standard_derivatives : enable

precision highp float;

#define GLYPHY_INFINITY 1e9
#define GLYPHY_EPSILON  1e-6
#define GLYPHY_MAX_D 0.5
#define GLYPHY_MAX_NUM_ENDPOINTS 32

uniform vec4 uColor; 

// (max_offset, min_sdf, sdf_step, check)
// 如果 晶格的 sdf 在 [-check, check]，该晶格 和 字体轮廓 可能 相交 
uniform vec4 u_info;

uniform sampler2D u_index_tex;
uniform sampler2D u_data_tex;

// 索引信息  
struct glyphy_index_t {
	
	// 编码信息
	int encode;

	// 端点的数量 
	// 0 代表 一直读取到 像素为 (0, 0, 0, 0) 的 数据为止
	int num_endpoints;

	// 在数据纹理的偏移，单位：像素
	int offset;

	// 晶格中心点的sdf
	float sdf;
};

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

struct line_t {
	float distance;

	float angle;
};

// 修复glsl bug 的 取余
// 某些显卡, 当b为uniform, 且 a % b 为 0 时候，会返回 b

vec2 div_mod(float a, float b) {
	float d = floor(a / b);
	float m = mod(a, b);
	if (m == b) {
		return vec2(d + 1.0, 0.0);
	}
	return vec2(d, m);
}

// 取 索引 uv
vec2 get_index_uv(const vec2 p, const ivec2 nominal_size)
{
	ivec2 cell = ivec2 (clamp (floor(p), vec2 (0.0, 0.0), vec2(nominal_size - 1)));

	return vec2(cell) / vec2(nominal_size);
}

// 解码 索引纹理 
glyphy_index_t decode_glyphy_index(const vec4 v, const ivec2 nominal_size)
{	
	float value = 255.0 * (v.r + v.a * 256.0);

	vec2 r1 = div_mod(value, 16384.0);
	float num_endpoints = r1.x;
    float sdf_and_offset_index = r1.y;

    vec2 r2 = div_mod(sdf_and_offset_index, u_info.x);
	float sdf_index = r2.x;
	float offset = r2.y;

	float sdf = sdf_index * u_info.z + u_info.y;

	glyphy_index_t index;

	index.sdf = sdf;
	index.encode = int(value);
	index.offset = int(offset);
	index.num_endpoints = int(num_endpoints);
	
	return index;
}

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


	vec2 r = div_mod(float(f), 16.0);

	return ivec2 (f / 16, int(r.y));
}

// returns tan (2 * atan (d))
float glyphy_tan2atan(const float d)
{
	return 2.0 * d / (1.0 - d * d);
}

// 取 arc 的 圆心 
vec2 glyphy_arc_center(const glyphy_arc_t a)
{
	return mix (a.p0, a.p1, 0.5) +
		glyphy_ortho(a.p1 - a.p0) / (2.0 * glyphy_tan2atan(a.d));
}

float glyphy_arc_wedge_signed_dist_shallow(const glyphy_arc_t a, const vec2 p)
{
	vec2 v = normalize (a.p1 - a.p0);
	float line_d = dot (p - a.p0, glyphy_ortho (v));
	if (a.d == 0.0) {
		return line_d;
	}
	
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
		return glyphy_arc_wedge_signed_dist_shallow(a, p);
	}
	
	vec2 c = glyphy_arc_center (a);
	return sign (a.d) * (distance (a.p0, c) - distance (p, c));
}

// 解码 arc 端点 
glyphy_arc_endpoint_t glyphy_arc_endpoint_decode(const vec4 v, const ivec2 nominal_size)
{
	vec2 p = (vec2 (glyphy_float_to_two_nimbles (v.a)) + v.gb) / 16.0;
	float d = v.r;
	if (d == 0.0) {
		d = GLYPHY_INFINITY;
	} else {
		d = float(glyphy_float_to_byte(d) - 128) * GLYPHY_MAX_D / 127.0;
	}

	p *= vec2(nominal_size);
	return glyphy_arc_endpoint_t (p, d);
}

// 判断是否 尖角内 
bool glyphy_arc_wedge_contains(const glyphy_arc_t a, const vec2 p)
{
	float d2 = glyphy_tan2atan (a.d);

	return dot (p - a.p0, (a.p1 - a.p0) * mat2(1,  d2, -d2, 1)) >= 0.0 &&
		dot (p - a.p1, (a.p1 - a.p0) * mat2(1, -d2,  d2, 1)) <= 0.0;
}

glyphy_index_t get_glyphy_index(const vec2 p, const ivec2 nominal_size, ivec2 atlas_pos) {
	vec2 index_uv = get_index_uv(p, nominal_size);
	vec4 c = texture2D(u_index_tex, index_uv).rgba;
	return decode_glyphy_index(c, nominal_size);
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

line_t decode_line(const vec4 v, const ivec2 nominal_size) {
	ivec4 iv = glyphy_vec4_to_bytes(v);

	line_t l;

	int ua = iv.b * 256 + iv.a;
	int ia = ua - 0x8000;
	l.angle = -float(ia) / float(0x7FFF) * 3.14159265358979;

	int ud = (iv.r - 128) * 256 + iv.g;
	int id = ud - 0x4000;
	float d = float(id) / float(0x1FFF);
	
	float scale = max(float(nominal_size.x), float(nominal_size.y));
	
	l.distance = d * scale;
	return l;
}

// 重点 计算 sdf 
float glyphy_sdf(const vec2 p, const ivec2 nominal_size, ivec2 atlas_pos) {

	glyphy_index_t index_info = get_glyphy_index(
		p, 
		nominal_size, 
		atlas_pos
	);
	
	float mm = u_info.w;
	
	if (index_info.sdf > mm) {
		// 全外面
		return GLYPHY_INFINITY;
	} else if (index_info.sdf < -mm) {
		// 全里面
		return -GLYPHY_INFINITY;
	}

	// 处理相交的晶格

	float side = index_info.sdf < 0.0 ? -1.0 : 1.0;
	float min_dist = GLYPHY_INFINITY;

	vec4 rgba = texture2D(u_data_tex, vec2(float(index_info.offset) / u_info.x, 0.0));
	
	// 线段 特殊处理
	if(index_info.num_endpoints == 1) {
		line_t line = decode_line(rgba, nominal_size);
		
		vec2 n = vec2(cos(line.angle), sin(line.angle));
		
		side = 1.0;
		min_dist = dot(p - 0.5 * vec2(nominal_size), n) - line.distance;
	} else {
		glyphy_arc_t closest_arc;
		glyphy_arc_endpoint_t endpoint = glyphy_arc_endpoint_decode(rgba, nominal_size);
	
		
		vec2 pp = endpoint.p;
		// 1个像素 最多 32次 采样 
		for(int i = 1; i < GLYPHY_MAX_NUM_ENDPOINTS; i++) {
			vec4 rgba = vec4(0.0);
			if(index_info.num_endpoints == 0) {
				rgba = texture2D(u_data_tex, vec2(float(index_info.offset + i) / u_info.x, 0.0));
				if (rgba == vec4(0.0)) {
					break;
				}
			} else if (i < index_info.num_endpoints) {
				rgba = texture2D(u_data_tex, vec2(float(index_info.offset + i) / u_info.x, 0.0));
			} else {
				break;
			}
			
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
					side = sdist <= 0.0 ? -1.0 : +1.0;
				}
			} else {
				float udist = min(distance(p, a.p0), distance(p, a.p1));
	
				if(udist < min_dist - GLYPHY_EPSILON) {
					side = 0.0;
					min_dist = udist;
					closest_arc = a;
				} else if(side == 0.0 && udist - min_dist <= GLYPHY_EPSILON) {
					float old_ext_dist = glyphy_arc_extended_dist(closest_arc, p);
					float new_ext_dist = glyphy_arc_extended_dist(a, p);
	
					float ext_dist = abs(new_ext_dist) <= abs(old_ext_dist) ? old_ext_dist : new_ext_dist;
	
					side = sign(ext_dist);
				}
			}
			pp = endpoint.p;
		}
		
		if(side == 0.) {
			float ext_dist = glyphy_arc_extended_dist(closest_arc, p);
			side = sign(ext_dist);
		}
	}
 
	return min_dist * side;
}

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

	// 索引纹理坐标
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
	
	vec2 rx = div_mod(v.x, 256.0);
	vec2 ry = div_mod(v.y, 256.0);

	vec2 r = vec2(rx.y, ry.y);
	// TODO +2 不了解什么意思 
	gi.nominal_size = (ivec2(r) + 2) / 4;

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
	float gsdist = glyphy_sdf(p, gi.nominal_size, gi.atlas_pos);
	
	// 均匀缩放 
	float scale = SQRT2 / length(fwidth(p));

	float sdist = gsdist * scale;

	float alpha = antialias(sdist);

	gl_FragColor = uColor * vec4(uColor.rgb, alpha * uColor.a);
}
`);