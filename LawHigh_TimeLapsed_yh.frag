#ifdef GL_ES
precision mediump float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;            // 控制遠近切換速度
uniform sampler2D u_tex0;         // Waves (high-frequency)
uniform sampler2D u_tex1;         // Rice (low-frequency)

varying vec2 v_texcoord;

// --- Gaussian 1D Blur ---
vec3 blur(sampler2D tex, vec2 uv, float radius) {
    vec3 sum = vec3(0.0);
    float total = 0.0;
    float sigma = radius;
    for (float x = -8.0; x <= 8.0; x++) {
        float w = exp(-x * x / (2.0 * sigma * sigma));
        sum += texture2D(tex, uv + vec2(x / u_resolution.x, 0.0)).rgb * w;
        total += w;
    }
    return sum / total;
}

void main() {
    vec2 uv = v_texcoord;

    // --- Low & High pass filters ---
    vec3 lowpass  = blur(u_tex1, uv, 8.0);     // Rice: blur strong → far vision
    vec3 blurredHigh = blur(u_tex0, uv, 1.5);
    vec3 highpass = texture2D(u_tex0, uv).rgb - blurredHigh;

    // --- Time-based blending (simulate changing distance) ---
    float speed = (u_speed <= 0.0) ? 0.4 : u_speed; // 預設速度 0.4
    float t = 0.5 + 0.5 * sin(u_time * speed);      // 0→1→0 平滑循環
    float mixStrength = smoothstep(0.0, 1.0, t);

    // --- 8:2 強化比例 ---
    // 近距離 (t≈0) → 高頻 80%、低頻 20%
    // 遠距離 (t≈1) → 高頻 20%、低頻 80%
    float highWeight = mix(0.8, 0.2, mixStrength);
    float lowWeight  = 1.0 - highWeight;

    vec3 hybrid = lowpass * lowWeight + (lowpass + highpass * 2.0) * highWeight;

    // Tone normalization
    hybrid = clamp(hybrid, 0.0, 1.0);
    gl_FragColor = vec4(hybrid, 1.0);
}
