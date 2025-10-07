#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform sampler2D u_tex0;  // Waves（低頻）
uniform sampler2D u_tex1;  // Rice（高頻）
varying vec2 v_texcoord;

// ---- Gamma ----
vec3  toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3  toSRGB  (vec3 c){ return pow(clamp(c, 0.0, 1.0), vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// ---- Gaussian (RGB / Luma) ----
vec3 gauss2D_rgb(sampler2D tex, vec2 uv, float sigma){
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int ix=-8; ix<=8; ix++){
        for (int iy=-8; iy<=8; iy++){
            vec2 o = vec2(float(ix), float(iy));
            float w = exp(-dot(o,o)/(2.0*sigma*sigma));
            acc += toLinear(texture2D(tex, uv + o/u_resolution).rgb) * w;
            wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}
float gauss2D_lum(sampler2D tex, vec2 uv, float sigma){
    float acc = 0.0, wsum = 0.0;
    for (int ix=-8; ix<=8; ix++){
        for (int iy=-8; iy<=8; iy++){
            vec2 o = vec2(float(ix), float(iy));
            float w = exp(-dot(o,o)/(2.0*sigma*sigma));
            vec3 rgb = toLinear(texture2D(tex, uv + o/u_resolution).rgb);
            acc += luminance(rgb)*w; wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

void main(){
    vec2 uv = v_texcoord;

    // ---- 滑鼠：無輸入時預設中心 ----
    vec2 mp = (u_mouse.x>0.0||u_mouse.y>0.0) ? (u_mouse/u_resolution) : vec2(0.5);

    // ==== 你可調的旋鈕 ====
    const float RADIUS = 0.35;          // 半徑
    const float EDGE   = 0.25;          // 邊界柔和度（越大越柔）
    const float WEIGHT_EXP = 2.0;       // 中心強度（>1 更聚焦）
    // 冷藍色調（讓整體更柔和的藍）
    const vec3  BASE_TINT   = vec3(0.96, 1.00, 1.06); // 海的冷色微調
    const vec3  DETAIL_TINT = vec3(0.98, 1.00, 1.04); // 細節的冷色微調
    // 模糊與細節
    const float SIGMA_LOW  = 18.0;
    const float SIGMA_HIGH = 1.2;

    // ---- 滑鼠權重（更大、更柔）----
    float d = distance(uv, mp);
    // 兩段式柔邊：先用 smoothstep，再加一次平滑
    float w = 1.0 - smoothstep(RADIUS-EDGE, RADIUS, d);
    w = smoothstep(0.0, 1.0, w);
    float nearWeight = pow(w, WEIGHT_EXP); // 中心更強

    // ---- 海（低頻、冷色）----
    vec3 sea = gauss2D_rgb(u_tex0, uv, SIGMA_LOW);
    sea *= BASE_TINT;                    // 冷色化
    sea  = (sea - 0.5) * 1.04 + 0.52;    // 輕微對比/亮度
    sea  = clamp(sea, 0.0, 1.0);

    // ---- 稻（高頻亮度，只取正向防黑洞）----
    float riceLum     = luminance(toLinear(texture2D(u_tex1, uv).rgb));
    float riceLumBlur = gauss2D_lum(u_tex1, uv, SIGMA_HIGH);
    float riceHigh    = max(riceLum - riceLumBlur, 0.0);
    // 中心更明顯的細節
    float gain = mix(1.6, 3.0, nearWeight);
    riceHigh = pow(riceHigh * gain, 0.85); // 柔化高亮

    // ---- Tone 混合（不做危險的亮度比例重建）----
    vec3 detailColor = sea * DETAIL_TINT + riceHigh * nearWeight;
    vec3 hybrid = mix(sea, detailColor, nearWeight);
    gl_FragColor = vec4(toSRGB(hybrid), 1.0);
}
