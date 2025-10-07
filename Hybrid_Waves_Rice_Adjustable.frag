#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform sampler2D u_tex0; // Waves → 低頻層（海）
uniform sampler2D u_tex1; // Rice → 高頻層（稻）
varying vec2 v_texcoord;

// --- sRGB <-> Linear（避免混色灰掉） ---
vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c){ return pow(c, vec3(1.0/2.2)); }

// --- 2D Gaussian ---
vec3 gauss2D(sampler2D tex, vec2 uv, float sigma){
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int ix = -10; ix <= 10; ix++){
        for (int iy = -10; iy <= 10; iy++){
            vec2 o = vec2(float(ix), float(iy));
            float w = exp(-(dot(o,o)) / (2.0 * sigma * sigma));
            acc += toLinear(texture2D(tex, uv + o / u_resolution).rgb) * w;
            wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

void main(){
    vec2 uv = v_texcoord;

    // --- Low-pass：海浪（取整體結構）---
    const float SIGMA_LOW = 20.0;       // 低頻模糊範圍：16–22 建議
    vec3 seaLow = gauss2D(u_tex0, uv, SIGMA_LOW);

    // --- High-pass：稻浪（去低頻，保留紋理）---
    const float SIGMA_HIGH = 1.2;       // 高頻範圍：0.8–1.5 建議
    vec3 rice = toLinear(texture2D(u_tex1, uv).rgb);
    vec3 riceBlur = gauss2D(u_tex1, uv, SIGMA_HIGH);
    vec3 riceHigh = rice - riceBlur;

    // --- 調整權重 ---
    const float LOW_GAIN  = 1.2;        // 海浪權重（越大→遠景更明顯）
    const float HIGH_GAIN = 1.0;        // 稻浪權重（越大→近景更清晰）
    const float CONTRAST  = 1.3;        // 稻紋對比強化（1.2–1.6）

    riceHigh *= HIGH_GAIN;
    riceHigh = (riceHigh - 0.0) * CONTRAST;
    vec3 hybridLin = clamp(seaLow * LOW_GAIN + riceHigh, 0.0, 1.0);

    gl_FragColor = vec4(toSRGB(hybridLin), 1.0);
}
