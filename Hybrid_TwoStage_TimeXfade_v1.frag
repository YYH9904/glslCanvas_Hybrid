#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0; // Waves v2  (低頻 A)
uniform sampler2D u_tex1; // Rice v3    (高頻 A)
uniform sampler2D u_tex2; // SND.JPG    (低頻 B target)
uniform sampler2D u_tex3; // Meadowfoam (高頻 B target)

uniform float u_lowSigmaA,  u_highSigmaA;
uniform float u_lowSigmaB,  u_highSigmaB;
uniform float u_highGainA,  u_highGainB;
uniform float u_lowContrast, u_outGamma, u_outClamp;

uniform float u_holdA;
uniform float u_xfadeLow;   // Stage-1：只換低頻（Waves→Meadow）
uniform float u_pauseMid;
uniform float u_xfadeToB;   // Stage-2：收束到 B（高：Rice→Meadow；低：Meadow→SND）
uniform float u_holdB, u_loopGap, u_loop;

vec3 srgb_to_lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 lin_to_srgb(vec3 c){ return pow(max(c,0.0), vec3(1.0/2.2)); }
float s01(float x){ return smoothstep(0.0,1.0,clamp(x,0.0,1.0)); }

vec3 gaussian9(sampler2D tex, vec2 uv, vec2 px, float sigma){
    if(sigma<=0.001) return srgb_to_lin(texture2D(tex,uv).rgb);
    float s = max(0.5, sigma);
    vec2 o1 = px * 1.3846153846 * s / 2.0;
    vec2 o2 = px * 3.2307692308 * s / 2.0;

    vec3 c0 = srgb_to_lin(texture2D(tex, uv).rgb) * 0.2270270270;
    vec3 c1 = srgb_to_lin(texture2D(tex, uv+vec2(o1.x,0)).rgb) * 0.3162162162;
    vec3 c2 = srgb_to_lin(texture2D(tex, uv-vec2(o1.x,0)).rgb) * 0.3162162162;
    vec3 c3 = srgb_to_lin(texture2D(tex, uv+vec2(0,o1.y)).rgb) * 0.3162162162;
    vec3 c4 = srgb_to_lin(texture2D(tex, uv-vec2(0,o1.y)).rgb) * 0.3162162162;
    vec3 c5 = srgb_to_lin(texture2D(tex, uv+vec2(o2.x,0)).rgb) * 0.0702702703;
    vec3 c6 = srgb_to_lin(texture2D(tex, uv-vec2(o2.x,0)).rgb) * 0.0702702703;
    vec3 c7 = srgb_to_lin(texture2D(tex, uv+vec2(0,o2.y)).rgb) * 0.0702702703;
    vec3 c8 = srgb_to_lin(texture2D(tex, uv-vec2(0,o2.y)).rgb) * 0.0702702703;
    return c0 + (c1+c2+c3+c4) + (c5+c6+c7+c8);
}

vec3 highpass(sampler2D tex, vec2 uv, vec2 px, float sigma){
    vec3 base = srgb_to_lin(texture2D(tex, uv).rgb);
    vec3 low  = gaussian9(tex, uv, px, sigma);
    return base - low;
}

// 時間：A hold → 只換低頻 → 停 → 收束到 B → B hold → gap
// 回傳：kLow1（Waves→Meadow 的進度 0→1），kToB（收束到 B 的進度 0→1）
vec2 timeline(float t){
    float holdA   = (u_holdA>0.0)?u_holdA:4.0;
    float xfLow   = (u_xfadeLow>0.0)?u_xfadeLow:4.0;
    float pauseM  = (u_pauseMid>=0.0)?u_pauseMid:2.0;
    float xfToB   = (u_xfadeToB>0.0)?u_xfadeToB:5.0;
    float holdB   = (u_holdB>0.0)?u_holdB:5.0;
    float gap     = (u_loopGap>=0.0)?u_loopGap:1.0;

    float T = holdA + xfLow + pauseM + xfToB + holdB + gap;
    if(u_loop>0.5) t = mod(t, T); else t = min(t, T);

    if(t < holdA)                    return vec2(0.0, 0.0);
    t -= holdA;
    if(t < xfLow)                    return vec2(s01(t/xfLow), 0.0);
    t -= xfLow;
    if(t < pauseM)                   return vec2(1.0, 0.0);
    t -= pauseM;
    if(t < xfToB)                    return vec2(1.0, s01(t/xfToB));
    // 之後都在 B
    return vec2(1.0, 1.0);
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    // 等比置中
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 fitUV = (uv - 0.5) / vec2(max(aspect.x,1.0), 1.0) + 0.5;
    vec2 px = 1.0 / u_resolution.xy;

    // A 組目標（初始）
    float lowSA  = (u_lowSigmaA>0.0)?u_lowSigmaA:12.0;  // Waves 低頻
    float highSA = (u_highSigmaA>0.0)?u_highSigmaA:3.0; // Rice  高頻
    vec3 lowA    = gaussian9(u_tex0, fitUV, px, lowSA);
    vec3 hA      = highpass(u_tex1, fitUV, px, highSA);

    // 中間資源（Meadow 用於：Stage-1 的低頻，以及 B 段的高頻）
    float highSB = (u_highSigmaB>0.0)?u_highSigmaB:2.2;
    vec3 lowMeadow = gaussian9(u_tex3, fitUV, px, lowSA); // 用同等級 sigma 讓過渡自然
    vec3 hMeadow   = highpass(u_tex3, fitUV, px, highSB);

    // B 組目標
    float lowSB  = (u_lowSigmaB>0.0)?u_lowSigmaB:9.0;    // SND 低頻
    vec3 lowB    = gaussian9(u_tex2, fitUV, px, lowSB);

    // 高頻增益（乘性）
    float gA = (u_highGainA!=0.0)?u_highGainA:1.2;
    float gB = (u_highGainB!=0.0)?u_highGainB:0.95;

    // 時間參數
    vec2 k = timeline(u_time);
    float kLow1 = k.x; // Stage-1：只換低頻 Waves→Meadow
    float kToB  = k.y; // Stage-2：收束到 B

    // —— 低頻流： Waves →(kLow1) Meadow →(kToB) SND
    vec3 lowStage1 = mix(lowA,       lowMeadow, kLow1);
    vec3 lowNow    = mix(lowStage1,  lowB,      kToB);

    // —— 高頻流： Rice  →(kToB) Meadow
    vec3 hNow      = mix(hA, hMeadow, kToB);

    // —— 高頻增益（依目前「高頻的身分」在 A/B 之間內插增益）
    float gNow = mix(gA, gB, kToB);

    // —— 合成（線性域）： low * (1 + g * high)
    vec3 colorLin = lowNow * (1.0 + gNow * hNow);

    // 低頻對比微調
    float lc = (u_lowContrast!=0.0)?u_lowContrast:1.0;
    colorLin = mix(gaussian9(u_tex2, fitUV, px, 0.0), colorLin, lc); // 輕微穩定黑階

    // 輸出
    float gamma = (u_outGamma>0.0)?u_outGamma:2.2;
    vec3 outSRGB = pow(max(colorLin,0.0), vec3(1.0/gamma));
    if(u_outClamp>0.5) outSRGB = clamp(outSRGB, 0.0, 1.0);
    gl_FragColor = vec4(outSRGB, 1.0);
}
