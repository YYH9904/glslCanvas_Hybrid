#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0;      // 建議：海浪（低頻）
uniform sampler2D u_tex1;      // 建議：稻浪/細紋理（高頻來源）
uniform sampler2D u_backbuffer;// GlslCanvas 提供的前一幀

// ===== 可調參數 =====
const float LP_SIGMA   = 3.0;   // 低通模糊半徑（越大越糊）
const float HP_SIGMA   = 2.0;   // 高通的「先模糊再相減」的模糊半徑
const float HP_GAIN    = 1.8;   // 高通增益（細節強度）
const float FEEDBACK   = 0.80;  // backbuffer 回授量（越大越拖尾糊）
const float EDGE_START = 0.40;  // 近遠交接開始（0~1，越小越靠上/靠中心）
const float EDGE_WIDTH = 0.25;  // 交接柔邊寬度

// 簡易 9-tap 分離近似（快速高斯/盒狀皆可）:
vec3 blur9(sampler2D tex, vec2 uv, vec2 px, float sigma) {
    // 權重近似（高斯權重簡化版）
    float w0 = 0.227027; // center
    float w1 = 0.194594;
    float w2 = 0.121621;
    float w3 = 0.054054;

    vec3 col = texture2D(tex, uv).rgb * w0;
    col += (texture2D(tex, uv + px*1.0*sigma).rgb + texture2D(tex, uv - px*1.0*sigma).rgb) * w1;
    col += (texture2D(tex, uv + px*2.0*sigma).rgb + texture2D(tex, uv - px*2.0*sigma).rgb) * w2;
    col += (texture2D(tex, uv + px*3.0*sigma).rgb + texture2D(tex, uv - px*3.0*sigma).rgb) * w3;
    return col;
}

vec3 gaussianBlur(sampler2D tex, vec2 uv, float sigma) {
    vec2 texel = 1.0 / u_resolution;
    // 橫向＋縱向各一次（近似分離高斯）
    vec3 h = blur9(tex, uv, vec2(texel.x, 0.0), sigma);
    vec3 v = blur9(tex, uv, vec2(0.0, texel.y), sigma);
    return (h + v) * 0.5;
}

// 高通：原圖 - 低通，再拉回可視範圍
vec3 highPass(sampler2D tex, vec2 uv, float sigma, float gain) {
    vec3 src  = texture2D(tex, uv).rgb;
    vec3 low  = gaussianBlur(tex, uv, sigma);
    vec3 hp   = (src - low) * gain;      // 可能 <0 或 >1
    // 兩種可視化：1) 單純加在低通上（最後再 clamp），或 2) 轉為 0.5 中心的顯示
    // 這裡留原始 hp，最後結合時再 clamp。
    return hp;
}

// 空間遮罩（用 y 或徑向都可；這裡用徑向，中心近、外圍遠）：
float distanceMask(vec2 uv) {
    vec2 p = uv - 0.5;
    float r = length(p * vec2(u_resolution.x/u_resolution.y, 1.0)); // 等比校正
    // 讓遮罩隨時間有一點微呼吸（可關閉）
    float drift = 0.02 * sin(u_time*0.6);
    float t0 = EDGE_START + drift;
    float t1 = EDGE_START + EDGE_WIDTH + drift;
    // 中心 = 近 (mask=0，保留高頻)；外圍 = 遠 (mask=1，偏低頻)
    return smoothstep(t0, t1, r);
}

void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // 1) 低通版本（取自海浪圖）
    vec3 ocean_src = texture2D(u_tex0, uv).rgb;
    vec3 ocean_lp  = gaussianBlur(u_tex0, uv, LP_SIGMA);

    // 2) 高通版本（取自稻浪/紋理圖）
    vec3 rice_hp   = highPass(u_tex1, uv, HP_SIGMA, HP_GAIN);

    // 3) 遞迴 backbuffer：讓「遠處」更糊（只對低通支路做回授會更「景深感」）
    vec3 cur_low   = ocean_lp;
    if (u_time > 0.02) { // 第一幀避免全黑
        vec3 prev = texture2D(u_backbuffer, uv).rgb;
        // 只把低頻支路做回授：把當前低通與上一幀混合，形成時間上的拖尾
        cur_low = mix(ocean_lp, prev, FEEDBACK);
    }

    // 4) 近遠空間混合：近處（mask~0）偏向高頻疊加，遠處（mask~1）偏向低頻
    float m = distanceMask(uv);
    // 將高通當成「細節層」加在低通底圖上；近處給比較多高通，遠處幾乎只有低通
    vec3 fused_near = clamp(ocean_src + rice_hp, 0.0, 1.0); // 近：海原圖 + 稻紋理高頻
    vec3 fused_far  = cur_low;                              // 遠：遞迴模糊後的海

    vec3 color = mix(fused_near, fused_far, m);

    gl_FragColor = vec4(color, 1.0);
}
