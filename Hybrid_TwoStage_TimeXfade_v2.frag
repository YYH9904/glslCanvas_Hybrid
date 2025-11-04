#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0; // Waves v2  (海浪1：A段低頻)
uniform sampler2D u_tex1; // Rice v3   (稻浪：A段高頻)
uniform sampler2D u_tex2; // SND.JPG   (海浪2：B段低頻)
uniform sampler2D u_tex3; // Meadow    (芒花：B段高頻 / 亦用作Stage-1低頻)

uniform float u_lowSigmaA,u_highSigmaA,u_lowSigmaB,u_highSigmaB;
uniform float u_highGainA,u_highGainB;
uniform float u_satLowA, u_contrastLowA;   // ★ A段：淡化海的色調與對比
uniform float u_holdA,u_xfadeLow,u_pause1,u_xfadeToB,u_holdB;
uniform float u_xfadeHigh,u_pause2,u_xfadeBack,u_loopGap,u_loop;
uniform float u_outGamma,u_outClamp;

// -------- utilities --------
float Luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3  toLin(vec3 c){ return pow(c, vec3(2.2)); }
vec3  toSRGB(vec3 c){ return pow(max(c,0.0), vec3(1.0/2.2)); }

// 比 smoothstep 更柔順的 cos-ease（0→1, C∞）
float easeCos(float x){ x=clamp(x,0.0,1.0); return 0.5 - 0.5*cos(3.14159265*x); }

// 9-tap 高斯近似
vec3 gaussian9(sampler2D tex, vec2 uv, vec2 px, float sigma){
    if(sigma<=0.001) return toLin(texture2D(tex,uv).rgb);
    float s = max(0.5, sigma);
    vec2 o1 = px * 1.3846153846 * s / 2.0;
    vec2 o2 = px * 3.2307692308 * s / 2.0;

    vec3 c0 = toLin(texture2D(tex, uv).rgb) * 0.2270270270;
    vec3 c1 = toLin(texture2D(tex, uv+vec2(o1.x,0)).rgb) * 0.3162162162;
    vec3 c2 = toLin(texture2D(tex, uv-vec2(o1.x,0)).rgb) * 0.3162162162;
    vec3 c3 = toLin(texture2D(tex, uv+vec2(0,o1.y)).rgb) * 0.3162162162;
    vec3 c4 = toLin(texture2D(tex, uv-vec2(0,o1.y)).rgb) * 0.3162162162;
    vec3 c5 = toLin(texture2D(tex, uv+vec2(o2.x,0)).rgb) * 0.0702702703;
    vec3 c6 = toLin(texture2D(tex, uv-vec2(o2.x,0)).rgb) * 0.0702702703;
    vec3 c7 = toLin(texture2D(tex, uv+vec2(0,o2.y)).rgb) * 0.0702702703;
    vec3 c8 = toLin(texture2D(tex, uv-vec2(0,o2.y)).rgb) * 0.0702702703;
    return c0 + (c1+c2+c3+c4) + (c5+c6+c7+c8);
}

vec3 highpass(sampler2D tex, vec2 uv, vec2 px, float sigma){
    vec3 base = toLin(texture2D(tex, uv).rgb);
    vec3 low  = gaussian9(tex, uv, px, sigma);
    return base - low;
}

// 高頻增益：避免爆點的「柔性增益」（有 rolloff）
vec3 softHighGain(vec3 h, float gain){
    // 對正負對稱的壓縮；k 越大越柔
    float k = 0.6;
    vec3 nh = h / (abs(h) + k);
    return (1.0 + gain * nh);
}

// 去飽和 / 降對比（A 段低頻用）
vec3 desaturate(vec3 lin, float sat){
    vec3 g = vec3(Luma(lin));
    return mix(g, lin, clamp(sat, 0.0, 1.0));
}
vec3 contrast(vec3 lin, float c){
    // 圍繞灰中點的對比調整（線性域）
    vec3 mid = vec3(0.5);
    return (lin - mid) * c + mid;
}

// -------- timeline：四段循環（慢＋cos-ease） --------
struct MixK { float kLow1; float kToB; float kHigh; float kBack; };

MixK timeline(float t){
    float holdA=u_holdA, xfLow=u_xfadeLow, p1=u_pause1, xfToB=u_xfadeToB;
    float holdB=u_holdB, xfHigh=u_xfadeHigh, p2=u_pause2, xfBack=u_xfadeBack, gap=u_loopGap;
    float T = holdA+xfLow+p1+xfToB+holdB+xfHigh+p2+xfBack+gap;
    if(u_loop>0.5) t = mod(t, T); else t = min(t, T);
    MixK k = MixK(0.0,0.0,0.0,0.0);

    if(t < holdA) return k; t -= holdA;
    if(t < xfLow){ k.kLow1 = easeCos(t/xfLow); return k; } t -= xfLow;
    if(t < p1){ k.kLow1 = 1.0; return k; } t -= p1;
    if(t < xfToB){ k.kLow1 = 1.0; k.kToB = easeCos(t/xfToB); return k; } t -= xfToB;
    if(t < holdB){ k.kLow1 = 1.0; k.kToB = 1.0; return k; } t -= holdB;
    if(t < xfHigh){ k.kLow1 = 1.0; k.kToB = 1.0; k.kHigh = easeCos(t/xfHigh); return k; } t -= xfHigh;
    if(t < p2){ k.kLow1 = 1.0; k.kToB = 1.0; k.kHigh = 1.0; return k; } t -= p2;
    if(t < xfBack){ k.kLow1 = 1.0; k.kToB = 1.0; k.kHigh = 1.0; k.kBack = easeCos(t/xfBack); return k; }
    k.kLow1 = 1.0; k.kToB = 1.0; k.kHigh = 1.0; k.kBack = 1.0; return k;
}

// -------- main --------
void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    // 等比置中
    vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
    vec2 fitUV = (uv - 0.5) / vec2(max(aspect.x,1.0), 1.0) + 0.5;
    vec2 px = 1.0 / u_resolution.xy;

    // 基底素材
    vec3 lowWave1   = gaussian9(u_tex0, fitUV, px, max(u_lowSigmaA, 0.001));
    vec3 highRice   = highpass(u_tex1, fitUV, px, max(u_highSigmaA,0.001));
    vec3 lowWave2   = gaussian9(u_tex2, fitUV, px, max(u_lowSigmaB, 0.001));
    vec3 highMeadow = highpass(u_tex3, fitUV, px, max(u_highSigmaB,0.001));
    vec3 lowMeadow  = gaussian9(u_tex3, fitUV, px, max(u_lowSigmaA, 0.001));
    vec3 highWave1  = highpass(u_tex0, fitUV, px, max(u_highSigmaA,0.001));

    // A 段：淡化海（去飽和＋降對比）
    lowWave1 = contrast(desaturate(lowWave1, u_satLowA), u_contrastLowA);

    // 時間鍵
    MixK k = timeline(u_time);

    // Stage-1：只換低頻（海→芒）
    vec3 lowNow  = mix(lowWave1, lowMeadow, k.kLow1);
    vec3 highNow = highRice;

    // Stage-2：收束到 B（低：芒→海2；高：稻→芒）
    lowNow  = mix(lowNow,  lowWave2,   k.kToB);
    highNow = mix(highNow, highMeadow, k.kToB);

    // Stage-3：只換高頻（芒→海1）
    highNow = mix(highNow, highWave1, k.kHigh);

    // Stage-4：回 A（低：→海1；高：→稻）
    lowNow  = mix(lowNow,  lowWave1,  k.kBack);
    highNow = mix(highNow, highRice,  k.kBack);

    // 乘性高頻合成（柔性增益，避免顆粒爆亮）
    float gA = (u_highGainA!=0.0)?u_highGainA:1.2;
    float gB = (u_highGainB!=0.0)?u_highGainB:0.95;
    float gNow = mix(gA, gB, k.kToB);
    vec3 colorLin = lowNow * softHighGain(highNow, gNow);

    vec3 outSRGB = toSRGB(colorLin);
    if(u_outClamp>0.5) outSRGB = clamp(outSRGB, 0.0, 1.0);
    gl_FragColor = vec4(outSRGB, 1.0);
}
