#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform sampler2D u_tex0; // Waves（海）→ 低頻顏色層
uniform sampler2D u_tex1; // Rice（稻）→ 高頻亮度層
varying vec2 v_texcoord;

// --- sRGB <-> Linear ---
vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c){ return pow(c, vec3(1.0/2.2)); }

// --- 計算亮度 ---
float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

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

    // --- Low-pass：海浪（整體色彩、結構） ---
    const float SIGMA_LOW = 20.0;
    vec3 seaLow = gauss2D(u_tex0, uv, SIGMA_LOW);

    // --- High-pass：稻浪（只取亮度細節） ---
    const float SIGMA_HIGH = 1.2;
    vec3 rice = toLinear(texture2D(u_tex1, uv).rgb);
    vec3 riceBlur = gauss2D(u_tex1, uv, SIGMA_HIGH);
    vec3 riceHigh = rice - riceBlur;

    // 取亮度通道 → 高頻亮度細節
    float riceDetail = luminance(riceHigh);
    // 讓亮度貢獻更強，但不改顏色
    const float DETAIL_GAIN = 8.0;
    riceDetail *= DETAIL_GAIN;

    // --- 合成：顏色來自海，亮度來自稻 ---
    vec3 seaColor = seaLow;                  // 色相基底
    float seaLum  = luminance(seaLow);       // 海的亮度
    float hybridLum = clamp(seaLum + riceDetail, 0.0, 1.0);

    // 重新結合亮度與顏色
    vec3 hybridLin = seaColor / max(seaLum, 1e-5) * hybridLum;
    hybridLin = clamp(hybridLin, 0.0, 1.0);

    gl_FragColor = vec4(toSRGB(hybridLin), 1.0);
}
