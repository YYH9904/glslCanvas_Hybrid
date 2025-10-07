// HW2_LowHigh_Combine.frag
// Author: YH + ChatGPT
// Goal: A(海)=Low-pass(+FBO回授)  ×  B(稻)=High-pass  →  近遠遮罩混合
// Env: GlslCanvas (u_time, u_resolution, u_backbuffer, u_tex0, u_tex1)



#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0;        // 海浪 (低通來源)
uniform sampler2D u_tex1;        // 稻浪 (高通來源)
uniform sampler2D u_backbuffer;  // 上一幀 (由 data-backbuffer="true" 提供)

// ---- knobs ----
const float SIGMA_LP = 3.0;      // 低通(海)模糊半徑（越大越糊）
const float SIGMA_HP = 2.2;      // 高通(稻)的「先模糊再相減」的模糊半徑
const float HP_GAIN  = 1.8;      // 高通增益（細節強度）
const float FEEDBACK = 0.80;     // backbuffer 回授量（越大越拖尾糊）
const float EDGE_START = 0.20;   // 近遠交接開始（0-1, 越小越靠中心）
const float EDGE_WIDTH = 0.40;   // 交接柔邊寬度（更寬更平滑）

// ---------- 一維模糊 ----------
vec3 blur1D(sampler2D tex, vec2 uv, vec2 dir, float sigma){
    vec2 texel = 1.0 / max(u_resolution, vec2(1.0));
    float w0=0.227027, w1=0.194594, w2=0.121621, w3=0.054054;
    vec2 s1 = dir * texel * 1.0 * sigma;
    vec2 s2 = dir * texel * 2.0 * sigma;
    vec2 s3 = dir * texel * 3.0 * sigma;
    vec3 c = texture2D(tex, uv).rgb * w0;
    c += (texture2D(tex, uv + s1).rgb + texture2D(tex, uv - s1).rgb) * w1;
    c += (texture2D(tex, uv + s2).rgb + texture2D(tex, uv - s2).rgb) * w2;
    c += (texture2D(tex, uv + s3).rgb + texture2D(tex, uv - s3).rgb) * w3;
    return c;
}

// 2D 模糊 = 1D (X) + 1D (Y)
vec3 gaussian2D(sampler2D tex, vec2 uv, float sigma){
    return 0.5 * (blur1D(tex, uv, vec2(1.0,0.0), sigma)
                + blur1D(tex, uv, vec2(0.0,1.0), sigma));
}

// 高通 = 原圖 - 低通（再加增益）
vec3 highPass(sampler2D tex, vec2 uv, float sigma, float gain){
    vec3 src = texture2D(tex, uv).rgb;
    vec3 low = gaussian2D(tex, uv, sigma);
    return (src - low) * gain;
}

// 徑向遮罩：中心=近(0)，外圍=遠(1)
float radialMask(vec2 uv){
    vec2 p = uv - 0.5;
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    float r = length(p * vec2(aspect, 1.0));
    return smoothstep(EDGE_START, EDGE_START + EDGE_WIDTH, r); // 0近→1遠
}

void main() {
    if (u_resolution.x <= 0.0 || u_resolution.y <= 0.0){
        gl_FragColor = vec4(0.0);
        return;
    }
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // A: 海 → 低通
    vec3 ocean_src = texture2D(u_tex0, uv).rgb;
    // Smooth, gradual transition
    float m = radialMask(uv);
    // Moderate blur in far region
    float sigma_far = mix(SIGMA_LP, SIGMA_LP * 6.0, m);
    vec3 ocean_lp  = gaussian2D(u_tex0, uv, sigma_far);

    // 低通支路做 FBO 回授（加深遠景糊度/殘影）
    vec3 low_accum = ocean_lp;
    if (u_time > 0.02) { // 避免第一幀讀黑
        vec3 prev = texture2D(u_backbuffer, uv).rgb; // 若未啟用 backbuffer 會是黑
        float prevMag = max(max(prev.r, prev.g), prev.b);
        float fbAmt = (prevMag > 0.0001) ? FEEDBACK : 0.0;
        low_accum = mix(ocean_lp, prev, fbAmt);
    }

    // B: 稻 → 高通
    vec3 rice_hp = highPass(u_tex1, uv, SIGMA_HP, HP_GAIN);

    // 合成：近(原海+稻細節) vs 遠(回授低通海)
    vec3 nearCol = clamp(ocean_src + rice_hp, 0.0, 1.0);
    vec3 farCol  = low_accum;

    gl_FragColor = vec4(mix(nearCol, farCol, m), 1.0);
}
