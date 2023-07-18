import { ProgramManager } from "./program.js";

ProgramManager.getInstance().addShader("glyphy.fs", `

precision mediump float;

uniform sampler2D u_index_tex;

varying vec4 v_glyph;

void main() {
	vec2 p = v_glyph.xy;

	vec2 nominal_size = vec2(17.0, 18.0);

	vec2 cell = vec2(0.0) + clamp(floor(p), vec2(0.0), nominal_size - vec2(1.0) );

	vec2 index_uv = cell / vec2(nominal_size);

	vec4 c = texture2D(u_index_tex, index_uv).rgba;
	
	float value = 255.0 * (c.r + c.g * 256.0);

	float sdf_and_offset_index = mod(value, 16384.0);
	float offset = mod(sdf_and_offset_index, 58.0);

	offset = offset / 58.0;

	gl_FragColor = vec4(offset, 0.0, 0.0, 1.0);
}
`);