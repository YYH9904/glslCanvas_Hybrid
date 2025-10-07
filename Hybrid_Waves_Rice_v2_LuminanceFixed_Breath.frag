#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_speed;
uniform sampler2D u_tex0; // Waves：低頻層（海）
uniform sampler2D u_tex1; // Rice：高頻層（稻）
varying vec2 v_texcoord;

// --- sRGB <-> Linear ---
vec3  toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3  toSRGB  (vec3 c){ return pow(c, vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// --- 2D Gaussian（RGB 版：回傳 linear RGB）---
vec3 gauss2D_rgb(sampler2D tex, vec2 uv, float sigma){
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int ix = -10; ix <= 10; ix++){
        for (int iy = -10; iy <= 10; iy++){
            vec2  o = vec2(float(ix), float(iy));
            float w = exp(-(dot(o,o)) / (2.0 * sigma * sigma));
            vec3  rgb = toLinear(texture2D(tex, uv + o / u_resolution).rgb);
            acc  += rgb * w;
            wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

// --- 2D Gaussian（亮度版：回傳 scalar）---
float gauss2D_lum(sampler2D tex, vec2 uv, float sigma){
    float acc = 0.0;
    float wsum = 0.0;
    for (int ix = -10; ix <= 10; ix++){
        for (int iy = -10; iy <= 10; iy++){
            vec2  o = vec2(float(ix), float(iy));
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

    // --- 時間權重：近→遠→近
    float speed = (u_speed <= 0.0) ? 0.4 : u_speed;
    float t = 0.5 + 0.5 * sin(u_time * speed);  // 0..1..0
    float nearWeight = 1.0 - t;                 // 高頻權重

    // --- 低頻：海（linear RGB）
    float SIGMA_LOW_MIN = 1.0;   // sharpest
    float SIGMA_LOW_MAX = 22.0;  // blurriest
    float sigmaLow = mix(SIGMA_LOW_MIN, SIGMA_LOW_MAX, nearWeight); // breathe in opposite phase
    vec3 seaLow  = gauss2D_rgb(u_tex0, uv, sigmaLow);
    float seaLum  = luminance(seaLow);

    // --- 高頻：用「稻的亮度」做高通（純 scalar）
    const float SIGMA_HIGH = 1.2;
    float riceLum     = luminance(toLinear(texture2D(u_tex1, uv).rgb));
    float riceLumBlur = gauss2D_lum(u_tex1, uv, SIGMA_HIGH);
    float riceHigh    = riceLum - riceLumBlur;        // 高頻亮度（可正可負）

    // 細節強度（溫和，避免黑/白帶）
    const float DETAIL_GAIN     = 1.4;
    const float DETAIL_CONTRAST = 1.15;
    riceHigh *= DETAIL_GAIN;
    riceHigh  = riceHigh * DETAIL_CONTRAST;           // 小幅對比

    float riceHighWeighted = riceHigh * nearWeight;

    // --- 亮度混合（只改亮度，不動色相）
    float hybridLum = clamp(seaLum + riceHighWeighted, 0.0, 1.0);

    // 在極暗區做更穩定的重建，避免黑帶
    float eps = 1e-3;                           // ← 比 1e-5 大，數值更穩
    float scale = hybridLum / max(seaLum, eps); // 亮度比例
    vec3  hybridLin = clamp(seaLow * scale, 0.0, 1.0);

    gl_FragColor = vec4(toSRGB(hybridLin), 1.0);
}

