#ifdef GL_ES
precision highp float;
#endif

uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_tintWarm;     // 0..1：滑鼠區域的暖色量（稻金）
uniform float u_riceColorMix; // 0..1：稻的「彩色高頻」混合量（0=灰階細節，1=彩色細節）
uniform sampler2D u_tex0;     // Waves（低頻海）
uniform sampler2D u_tex1;     // Rice （高頻稻）
varying vec2 v_texcoord;

// ---- Gamma / Luma ----
vec3  toLinear(vec3 c){ return pow(clamp(c,0.0,1.0), vec3(2.2)); }
vec3  toSRGB  (vec3 c){ return pow(clamp(c,0.0,1.0), vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

// ---- Gaussian ----
vec3 gauss2D_rgb(sampler2D tex, vec2 uv, float sigma){
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int ix=-8; ix<=8; ix++){
        for (int iy=-8; iy<=8; iy++){
            vec2 o = vec2(float(ix), float(iy));
            float w = exp(-dot(o,o)/(2.0*sigma*sigma));
            vec3 rgb = toLinear(texture2D(tex, uv + o/u_resolution).rgb);
            acc += rgb * w; wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}
float gauss2D_lum(sampler2D tex, vec2 uv, float sigma){
    float acc = 0.0; float wsum = 0.0;
    for (int ix=-8; ix<=8; ix++){
        for (int iy=-8; iy<=8; iy++){
            vec2 o = vec2(float(ix), float(iy));
            float w = exp(-dot(o,o)/(2.0*sigma*sigma));
            vec3 rgb = toLinear(texture2D(tex, uv + o/u_resolution).rgb);
            acc += luminance(rgb) * w; wsum += w;
        }
    }
    return acc / max(wsum, 1e-6);
}

// ---- 滑鼠 UV（HTML 已傳像素 + 翻Y；這裡只做像素→UV）----
vec2 getMouseUV(vec2 m, vec2 res){
    if (m.x<=0.0 && m.y<=0.0) return vec2(0.5, 0.5);
    vec2 uv = (max(m.x,m.y) > 2.0) ? (m / res) : m; // 自動判斷像素或0..1
    return clamp(uv, 0.0, 1.0);
}

void main(){
    vec2 uv = v_texcoord;
    vec2 mp = getMouseUV(u_mouse, u_resolution);

    // ===== 可調參數 =====
    const float RADIUS      = 0.50;  // 滑鼠影響半徑（0..1）
    const float EDGE        = 0.25;  // 邊界柔和
    const float WEIGHT_EXP  = 2.0;   // 中心聚焦
    const float SIGMA_LOW   = 18.0;  // 海的低通
    const float SIGMA_HIGH  = 1.2;   // 稻的高通

    // ---- 滑鼠權重（中心=1，外圍=0）----
    float d = distance(uv, mp);
    float w = 1.0 - smoothstep(RADIUS-EDGE, RADIUS, d);
    w = smoothstep(0.0, 1.0, w);
    float nearWeight = pow(w, WEIGHT_EXP);

    // ---- 海（柔和藍綠基底）----
    vec3 sea = gauss2D_rgb(u_tex0, uv, SIGMA_LOW);
    sea *= vec3(0.93, 0.98, 1.07);       // 柔和偏藍
    sea  = (sea - 0.5) * 1.02 + 0.50;    // 輕微對比
    sea  = clamp(sea, 0.0, 1.0);

    // ---- 稻：高頻（彩色 & 灰階）----
    vec3  riceLin     = toLinear(texture2D(u_tex1, uv).rgb);
    vec3  riceBlurRGB = gauss2D_rgb(u_tex1, uv, SIGMA_HIGH);
    vec3  riceHighRGB = riceLin - riceBlurRGB;        // 彩色高通
    float riceHighLum = max(luminance(riceHighRGB), 0.0); // 亮度高頻（只取正向，防黑洞）

    // 拆出「色差」（去掉亮度分量的彩色殘差）
    vec3 riceChroma = riceHighRGB - vec3(luminance(riceHighRGB));
    // 控制彩色細節混合量（只在滑鼠區域生效）
    float colorMix = clamp(u_riceColorMix, 0.0, 1.0) * nearWeight;
    // 適度壓縮彩色高頻，避免色彩爆掉（soft saturation）
    riceChroma = clamp(riceChroma, -0.25, 0.25) * colorMix;

    // 亮度細節增益（中心更強）+ 柔化尖峰
    float gain = mix(1.8, 3.2, nearWeight);
    float riceDetailLum = pow(riceHighLum * gain, 0.85);

    // ---- 混色（Tone Blend）----
    // 近景區域加入一點暖感（稻金），遠處保持原海色
    vec3 tint = mix(vec3(1.0), vec3(1.06, 1.00, 0.92), nearWeight * clamp(u_tintWarm, 0.0, 1.0));

    // 細節顏色 = 海的基底 * 暖色 + 亮度細節 + 彩色高頻殘差
    vec3 detail = sea * tint + vec3(riceDetailLum) + riceChroma;

    // 只在近景範圍混入細節，遠處維持海的低頻色
    vec3 hybrid = mix(sea, detail, nearWeight);

    gl_FragColor = vec4(toSRGB(clamp(hybrid, 0.0, 1.0)), 1.0);
}
