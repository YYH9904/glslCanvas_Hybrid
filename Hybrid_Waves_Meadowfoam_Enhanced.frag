#ifdef GL_ES
precision highp float;
#endif

// ------------------------------------------------------------------
// UNIFORMS & VARYING
// ------------------------------------------------------------------
uniform vec2 u_resolution;
uniform sampler2D u_tex0; // 低頻層：SND.jpg (海浪)
uniform sampler2D u_tex1; // 高頻層：Meadowfoamv2_byChatGPT.jpg (芒花)
varying vec2 v_texcoord;

// ------------------------------------------------------------------
// UTILITY FUNCTIONS (保持不變)
// ------------------------------------------------------------------
vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toSRGB(vec3 c){ return pow(c, vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// Tone Mapping 函數 (提升對比與衝擊力)
// Aces Filmic Tone Map (簡化版)
vec3 ACES_Filmic(vec3 x) {
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

// 2D Gaussian Kernel (保持不變)
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

// ------------------------------------------------------------------
// MAIN
// ------------------------------------------------------------------
void main(){
    vec2 uv = v_texcoord;

    // --- 參數設定 (您的原參數) ---
    const float SIGMA_LOW = 20.0;
    const float SIGMA_HIGH = 1.2;
    const float DETAIL_GAIN = 8.0;

    // --- 顏色增強參數 ---
    // 高頻顏色混合比例 (0.0: 完全來自低頻顏色, 1.0: 完全來自高頻顏色)
    // 建議值: 0.1 到 0.3 之間，少量引入芒花的灰金色，避免混雜。
    const float HIGH_COLOR_MIX_ALPHA = 0.5; 
    
    // 1. 低頻處理：海浪 (顏色與宏觀結構)
    vec3 lowPassColor = gauss2D(u_tex0, uv, SIGMA_LOW);
    vec3 lowColor = lowPassColor; 
    
    // 2. 高頻處理：芒花 (細節與顏色)
    vec3 highRaw = toLinear(texture2D(u_tex1, uv).rgb);
    vec3 highBlur = gauss2D(u_tex1, uv, SIGMA_HIGH);
    vec3 highPassColor = highRaw - highBlur; // 芒花的高頻顏色
    
    // 3. 亮度細節提取與增益 (與原始邏輯相同)
    float highPassDetail = luminance(highPassColor) * DETAIL_GAIN;

    // --- 4. 合成 (增強顏色貢獻) ---
    float lowLum  = luminance(lowPassColor);
    
    // (A) 調整基礎顏色: 讓高頻的顏色參與合成
    // 使用 mix 函式，依據 HIGH_COLOR_MIX_ALPHA 混合低頻顏色和高頻顏色
    vec3 baseColor = mix(lowColor, highPassColor + lowColor, HIGH_COLOR_MIX_ALPHA);
    
    // (B) 調整亮度: 亮度細節疊加在低頻亮度上
    float hybridLum = clamp(lowLum + highPassDetail, 0.0, 1.0);
    
    // (C) 重新結合: 將調整後的基礎顏色 (baseColor) 重新與新亮度 (hybridLum) 結合
    vec3 hybridLin = baseColor / max(luminance(baseColor), 1e-5) * hybridLum;
    hybridLin = clamp(hybridLin, 0.0, 1.0);

    // --- 5. 圖像品質增強：Tone Mapping ---
    // 在輸出前，使用 Tone Mapping 增強對比與質感
    vec3 finalColor = ACES_Filmic(hybridLin);
    
    gl_FragColor = vec4(toSRGB(finalColor), 1.0);
}