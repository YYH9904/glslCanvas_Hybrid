#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform sampler2D u_tex0; // Waves (low-frequency base)
uniform sampler2D u_tex1; // Rice (high-frequency details)
varying vec2 v_texcoord;

// Gaussian blur（2D approximation using separable pass）
vec3 blur(sampler2D tex, vec2 uv, float sigma) {
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int ix = -8; ix <= 8; ++ix) {
        float x = float(ix);
        for (int iy = -8; iy <= 8; ++iy) {
            float y = float(iy);
            float w = exp(-(x * x + y * y) / (2.0 * sigma * sigma));
            sum += texture2D(tex, uv + vec2(x, y) / u_resolution).rgb * w;
            total += w;
        }
    }
    return sum / total;
}

void main() {
    vec2 uv = v_texcoord;

    // --- Low spatial frequency (Waves) ---
    // 超強模糊，讓遠距離可見的結構主導
    vec3 low = blur(u_tex0, uv, 12.0);

    // --- High spatial frequency (Rice) ---
    // 去掉低頻，只留細節
    vec3 rice = texture2D(u_tex1, uv).rgb;
    vec3 riceBlur = blur(u_tex1, uv, 2.0);
    vec3 high = rice - riceBlur;

    // --- Combine with small gain ---
    // 加強高頻細節，但仍維持自然亮度
    vec3 hybrid = low + high * 1.2;

    gl_FragColor = vec4(clamp(hybrid, 0.0, 1.0), 1.0);
}
