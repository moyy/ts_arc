import { ProgramManager } from "./program";

ProgramManager.getInstance().addShader("glyphy.vs", `
    
    precision highp float;

    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;

    // glyph_vertex_t: x, y; g16hi, g16lo; 
    
    attribute vec4 a_glyph_vertex;

    varying vec4 v_glyph;

    // "A" 中 的 v = (28.0, 32.0)
    vec4 glyph_vertex_transcode(vec2 v) 
    {
        // "A", g = (28, 32)
        ivec2 g = ivec2 (v);
        
        // corner = v % 2
        // "A", corner = (0, 0)
        ivec2 corner = ivec2 (mod (v, 2.0));
        
        // "A", g = (14, 16)
        g /= 2;

        // nominal_size = g % 64
        // "A", nominal_size = (14, 16)
        ivec2 nominal_size = ivec2 (mod (vec2(g), 64.));

        // "A", return (0.0, 0.0, 56.0, 64.0)
        return vec4 (corner * nominal_size, g * 4);
    }

    void main() {
        v_glyph = glyph_vertex_transcode(a_glyph_vertex.zw);
        
        gl_Position = uProj * uView * uWorld * vec4(a_glyph_vertex.xy, 0.0, 1.0);
    }
`);