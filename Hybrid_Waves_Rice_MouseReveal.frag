#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;       // 由 HTML 傳入，像素座標
uniform sampler2D u_tex0;   // Waves：低頻層（海）
uniform sampler2D u_tex1;   // Rice：高頻層（稻）
varying vec2 v_texcoord;

// ---- sRGB <-> Linear ----
vec3  toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3  toSRGB  (vec3 c){ return pow(c, vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// ---- Gaussian (RGB / Luma) ----
vec3 gauss2D_rgb(sampler2D tex, vec2 uv, float sigma){
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int ix=-10; ix<=10; ix++){
        for (int iy=-10; iy<=10; iy++){
            vec2  o = vec2(float(ix), float(iy));
            float w = exp(-(dot(o,o)) / (2.0*sigma*sigma));
            vec3  rgb = toLinear(texture2D(tex, uv + o / u_resolution).rgb);
            acc += rgb * w; wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

float gauss2D_lum(sampler2D tex, vec2 uv, float sigma){
    float acc = 0.0, wsum = 0.0;
    for (int ix=-10; ix<=10; ix++){
        for (int iy=-10; iy<=10; iy++){
            vec2  o = vec2(float(ix), float(iy));
            float w = exp(-(dot(o,o)) / (2.0*sigma*sigma));
            vec3  rgb = toLinear(texture2D(tex, uv + o / u_resolution).rgb);
            acc += luminance(rgb) * w; wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

void main(){
    vec2 uv = v_texcoord;

    // ---- 滑鼠歸一化（沒初始化時預設中心），避免一開始黑洞 ----
    vec2 mousePix = u_mouse;
    bool mouseSet = (mousePix.x > 0.0 || mousePix.y > 0.0);
    vec2 mouseNorm = mouseSet ? (mousePix / u_resolution) : vec2(0.5);

    // 與滑鼠距離 → 近景揭示權重（中心=1 → 外圍=0）
    float dist = distance(uv, mouseNorm);
    const float RADIUS = 0.25;       // 近景半徑（0~1）
    const float EDGE_SMOOTH = 0.15;  // 邊緣過渡
    float nearWeight = 1.0 - smoothstep(RADIUS - EDGE_SMOOTH, RADIUS, dist);

    // ---- 低頻：海（遠距離基底）----
    const float SIGMA_LOW = 18.0;              // 低通強度
    vec3 seaLow = gauss2D_rgb(u_tex0, uv, SIGMA_LOW);

    // 遠景基底略降亮度（避免過曝），同時保留對比
    seaLow = clamp((seaLow - 0.5) * 1.05 + 0.5, 0.0, 1.0);
    seaLow += 0.05;                             // 基線小偏移（防死黑）
    float seaLum = luminance(seaLow);

    // ---- 高頻：稻（純亮度高通）----
    const float SIGMA_HIGH = 1.2;
    float riceLum     = luminance(toLinear(texture2D(u_tex1, uv).rgb));
    float riceLumBlur = gauss2D_lum(u_tex1, uv, SIGMA_HIGH);
    float riceHigh    = riceLum - riceLumBlur;

    // 細節只在滑鼠區域出現
    const float DETAIL_GAIN     = 1.5;
    const float DETAIL_CONTRAST = 1.10;
    riceHigh *= DETAIL_GAIN * nearWeight;
    riceHigh  = riceHigh * DETAIL_CONTRAST;

    // ---- 亮度混合（只改亮度，不動海之色相）----
    float hybridLum = clamp(seaLum + riceHigh, 0.0, 1.0);

    // 安全亮度重建：暗區保底 + 限制比例
    float safeLum = mix(seaLum, 0.40, step(seaLum, 0.05)); // 黑位補平
    float scale   = clamp(hybridLum / max(safeLum, 1e-2), 0.8, 1.2); // 降低對比破圖

    vec3 hybridLin = clamp(seaLow * scale, 0.0, 1.0);
    gl_FragColor = vec4(toSRGB(hybridLin), 1.0);
}