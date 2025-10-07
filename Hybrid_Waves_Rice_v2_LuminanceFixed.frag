#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform sampler2D u_tex0; // Waves（海，低頻色彩）
uniform sampler2D u_tex1; // Rice（稻，高頻亮度）
varying vec2 v_texcoord;

// --- sRGB <-> Linear ---
vec3  toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3  toSRGB  (vec3 c){ return pow(c, vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// --- 2D Gaussian ---
vec3 gauss2D_rgb(sampler2D tex, vec2 uv, float sigma){
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

float gauss2D_lum(sampler2D tex, vec2 uv, float sigma){
    float acc = 0.0;
    float wsum = 0.0;
    for (int ix = -10; ix <= 10; ix++){
        for (int iy = -10; iy <= 10; iy++){
            vec2 o = vec2(float(ix), float(iy));
            float w = exp(-(dot(o,o)) / (2.0 * sigma * sigma));
            vec3  rgb = toLinear(texture2D(tex, uv + o / u_resolution).rgb);
            acc  += luminance(rgb) * w;
            wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

void main(){
    vec2 uv = v_texcoord;

    // --- 參數旋鈕（你可直接改數字） ---
    const float SIGMA_LOW       = 22.0;  // 海的低通強度（↑更糊，遠景更乾淨）
    const float SIGMA_HIGH      = 1.5;   // 稻的高通範圍（↓更銳，↑更柔）
    const float DETAIL_GAIN     = 1.9;   // 稻亮度細節強度（建議 1.3～2.0）
    const float DETAIL_CONTRAST = 1.25;  // 稻細節對比（1.0～1.4）
    const float LOW_TINT_MIX    = 0.0;   // 低頻色調微染（0=原海色，0.2~0.4 可稍微偏冷/暖）
    const vec3  LOW_TINT_COLOR  = vec3(0.20, 0.40, 0.50); // 想要的海色方向

    // --- 低頻：海的顏色 + 亮度
    vec3  seaLowRGB = gauss2D_rgb(u_tex0, uv, SIGMA_LOW);
    float seaLum    = luminance(seaLowRGB);

    // 可選：給低頻一點點色調微染（預設 0 不動色相）
    seaLowRGB = mix(seaLowRGB, LOW_TINT_COLOR, LOW_TINT_MIX);

    // --- 高頻：用稻的「亮度」做高通（純 scalar，不改色相）
    float riceLum     = luminance(toLinear(texture2D(u_tex1, uv).rgb));
    float riceLumBlur = gauss2D_lum(u_tex1, uv, SIGMA_HIGH);
    float riceHigh    = riceLum - riceLumBlur;            // 高頻亮度
    // 細節強化
    riceHigh *= DETAIL_GAIN;
    riceHigh  = (riceHigh - 0.0) * DETAIL_CONTRAST;

    // --- 亮度混合：只改亮度，不改海的色相
    float hybridLum = clamp(seaLum + riceHigh, 0.0, 1.0);

    // 以亮度比例縮放海的顏色（避免偏色）
    float eps = 1e-5;
    float scale = hybridLum / max(seaLum, eps);
    vec3  hybridLin = clamp(seaLowRGB * scale, 0.0, 1.0);

    gl_FragColor = vec4(toSRGB(hybridLin), 1.0);
}
