import { ProgramManager } from "./program.js";

ProgramManager.getInstance().addShader("glyphy.fs", `

precision mediump float;

uniform sampler2D u_index_tex;

varying vec4 v_glyph;

// [0, 1] 浮点 --> byte 
ivec4 glyphy_vec4_to_bytes(const vec4 v)
{
	return ivec4 (v * (256.0 - 1e-5));
}

int my_mod(int x, int y) {
	int div = x / y;
	int res = y * div;
	return x - res;
}


void main() {
	vec2 p = v_glyph.xy;

	vec2 nominal_size = vec2(17.0, 18.0);

	vec2 cell = vec2(0.5) + clamp(floor(p), vec2(0.0), nominal_size - vec2(1.0) );

	vec2 index_uv = cell / vec2(nominal_size);

	vec4 c = texture2D(u_index_tex, index_uv);
	ivec4 b = glyphy_vec4_to_bytes(c);
	int value = b.r + 256 * b.a;
	if (value < 0) {
		value += 32768;
	}
	
	int sdf_and_offset_index = my_mod(value, 16384);

	int offset = my_mod(sdf_and_offset_index, 58);
	
	float offset_f = 1.0 * float(offset) / 58.0;

	gl_FragColor = vec4(abs(offset_f), 0.0, 0.0, 1.0);
}
`);