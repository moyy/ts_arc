import { ProgramManager } from "./program.js";

ProgramManager.getInstance().addShader("glyphy.fs", `

#extension GL_OES_standard_derivatives : enable

precision highp float;

// ================ begin demo-atlas.glsl


// (max_offset, min_sdf, sdf_step, check)
// 如果 晶格的 sdf 在 [-check, check]，该晶格 和 字体轮廓 可能 相交 
uniform vec4 u_info;

uniform sampler2D u_index_tex;
uniform sampler2D u_data_tex;

uniform vec4 uColor;

// ================ end demo-atlas.glsl

// ================ begin glyphy-common.glsl

// 索引信息  
struct glyphy_index_t {
	
	// 端点的数量 
	int num_endpoints;

	int offset;

	float sdf;
};

// 取 索引 uv
vec2 get_index_uv(const vec2 p, const ivec2 nominal_size)
{
	ivec2 cell = ivec2 (clamp (floor(p), vec2 (0.0, 0.0), vec2(nominal_size - 1)));

	cell.y = nominal_size.y - 1 - cell.y;
	return vec2(cell) / vec2(nominal_size);
}

// 解码 索引纹理 
glyphy_index_t decode_glyphy_index(const vec4 v, const ivec2 nominal_size)
{
	float value = 256.0 * (v.r + v.a * 256.0);

    float num_points = floor(value / 16384.0);
    float sdf_and_offset_index = mod(value, 16384.0);

    float sdf_index = floor(sdf_and_offset_index / u_info.x);
    float offset = mod(sdf_and_offset_index, u_info.x);

    float sdf = sdf_index * u_info.z + u_info.y;

	glyphy_index_t index;

	index.num_endpoints = int(num_points);
	index.offset = int(offset);

	index.sdf = sdf;
	
	return index;
}

// ================ begin glyphy-sdf.glsl

#define GLYPHY_MAX_NUM_ENDPOINTS 32

glyphy_index_t get_glyphy_index(const vec2 p, const ivec2 nominal_size, ivec2 atlas_pos) {
	vec2 index_uv = get_index_uv(p, nominal_size);

	vec4 arc_list_data = texture2D(u_index_tex, index_uv);

	
	return decode_glyphy_index(arc_list_data, nominal_size);
}

// 重点 计算 sdf 
float glyphy_sdf(const vec2 p, const ivec2 nominal_size, ivec2 atlas_pos) {

	glyphy_index_t index_info = get_glyphy_index(
		p, 
		nominal_size, 
		atlas_pos
	);
	
	return index_info.sdf;
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
	float gsdist = glyphy_sdf(p, gi.nominal_size, gi.atlas_pos);

	// 均匀缩放 
	float scale = SQRT2 / length(fwidth(p));

	float sdist = gsdist * scale;

	float alpha = antialias(sdist);

	vec4 test = texture2D(u_data_tex, vec2(0.0, 0.0));
	
	gl_FragColor = uColor;
	
	gl_FragColor = vec4(0.0, 0.0, 0.0, gsdist);
}

// ================ end demo-fshader.glsl
`);