#ifdef GL_ES
precision mediump float;
#endif

// ---- GlslCanvas uniforms ----
uniform vec2  u_resolution;
uniform vec2  u_mouse;
uniform float u_time;
uniform sampler2D u_tex0; // frame t
uniform sampler2D u_tex1; // frame t+Δ
uniform sampler2D u_tex2; // frame t+2Δ

// ---- Tunables ----
// 模糊半徑（像素）。低頻用較大的模糊，形成「時間平均」的穩定面。
const float BLUR_LOW = 4.0;
// 高通採用的低通半徑（像素），越大 → 高頻越只剩邊緣。
const float BLUR_HP  = 3.0;

// 頻帶權重
const float LOW_GAIN  = 1.00;
const float HIGH_GAIN = 1.15;

// ---- 色彩：sRGB <-> linear，避免把高頻吃掉 ----
vec3 toLinear(vec3 srgb){
    return pow(srgb, vec3(2.2));
}
vec3 toSRGB(vec3 linear){
    return pow(linear, vec3(1.0/2.2));
}

// ---- 9-tap 近似各向同性高斯（單通道），以畫布像素為尺度 ----
vec3 blur9(sampler2D tex, vec2 uv, float radiusPx){
    // 以畫布像素做步長，簡化不同貼圖尺寸差異
    vec2 px = radiusPx / u_resolution; // 向量步長（比例）
    // 權重（中心最大、對稱）
    float w0 = 0.227027; // 0
    float w1 = 0.194594; // 1
    float w2 = 0.121621; // 2
    float w3 = 0.054054; // 3
    float w4 = 0.016216; // 4

    vec3 c = texture2D(tex, uv).rgb * w0;
    c += texture2D(tex, uv + vec2( px.x, 0.0)).rgb * w1;
    c += texture2D(tex, uv - vec2( px.x, 0.0)).rgb * w1;
    c += texture2D(tex, uv + vec2( 0.0, px.y)).rgb * w1;
    c += texture2D(tex, uv - vec2( 0.0, px.y)).rgb * w1;

    c += texture2D(tex, uv + vec2( 2.0*px.x, 0.0)).rgb * w2;
    c += texture2D(tex, uv - vec2( 2.0*px.x, 0.0)).rgb * w2;
    c += texture2D(tex, uv + vec2( 0.0, 2.0*px.y)).rgb * w2;
    c += texture2D(tex, uv - vec2( 0.0, 2.0*px.y)).rgb * w2;

    c += texture2D(tex, uv + vec2( 3.0*px.x, 0.0)).rgb * w3;
    c += texture2D(tex, uv - vec2( 3.0*px.x, 0.0)).rgb * w3;
    c += texture2D(tex, uv + vec2( 0.0, 3.0*px.y)).rgb * w3;
    c += texture2D(tex, uv - vec2( 0.0, 3.0*px.y)).rgb * w3;

    c += texture2D(tex, uv + vec2( 4.0*px.x, 0.0)).rgb * w4;
    c += texture2D(tex, uv - vec2( 4.0*px.x, 0.0)).rgb * w4;
    c += texture2D(tex, uv + vec2( 0.0, 4.0*px.y)).rgb * w4;
    c += texture2D(tex, uv - vec2( 0.0, 4.0*px.y)).rgb * w4;

    return c;
}

// 對單張影像做 low / high 分解（線性空間）
void decompose(sampler2D tex, vec2 uv, out vec3 low, out vec3 high){
    vec3 src  = toLinear(texture2D(tex, uv).rgb);
    vec3 lp   = toLinear(blur9(tex, uv, BLUR_LOW));
    low  = lp;
    // 高通：原圖 - 較大半徑的低通
    vec3 lp2  = toLinear(blur9(tex, uv, BLUR_HP));
    high = src - lp2;
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;

    // 三幀分解
    vec3 low0, hi0, low1, hi1, low2, hi2;
    decompose(u_tex0, uv, low0, hi0);
    decompose(u_tex1, uv, low1, hi1);
    decompose(u_tex2, uv, low2, hi2);

    // 低頻：時間平均（穩定的地平線與海面結構）
    vec3 lowAvg = (low0 + low1 + low2) / 3.0;

    // 高頻：時間殘響（浪花與反光）
    // 加一點微弱的時間權重，避免過度平均造成死白
    float w0 = 0.34 + 0.06*sin(u_time*0.90 + 0.0);
    float w1 = 0.33 + 0.06*sin(u_time*0.90 + 2.1);
    float w2 = 0.33 + 0.06*sin(u_time*0.90 + 4.2);
    float norm = (w0 + w1 + w2);
    w0/=norm; w1/=norm; w2/=norm;
    vec3 hiMix = hi0*w0 + hi1*w1 + hi2*w2;

    // 互動式「遠近感」：滑鼠 X 從 0→1，越遠越看不到高頻
    float nearFar = clamp(u_mouse.x / max(u_resolution.x, 1.0), 0.0, 1.0);
    float highAtten = pow(1.0 - nearFar, 1.6); // 往右（遠）→ 高頻衰減更快

    // 組合
    vec3 colorLinear = LOW_GAIN * lowAvg + HIGH_GAIN * hiMix * highAtten;

    // 輸出
    gl_FragColor = vec4( toSRGB(colorLinear), 1.0 );
}
