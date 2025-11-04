// title: 
// description: A Cycle with Wind and 
// author: YaHan Yang
// demoURL: https://github.com/YYH9904/glslCanvas_Hybrid.git



#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0; // Waves v2 (海浪1)
uniform sampler2D u_tex1; // Rice v3  (稻浪)
uniform sampler2D u_tex2; // SND      (海浪2)
uniform sampler2D u_tex3; // Meadow   (芒花)

// ---- 控制參數 ----
uniform float u_lowSigmaA,u_highSigmaA,u_lowSigmaB,u_highSigmaB;
uniform float u_highGainA,u_highGainB;
uniform float u_satLowA,u_contrastLowA;

uniform float u_holdA,u_xfadeLow,u_pause1;
uniform float u_xfadeFadeOut,u_xfadeFadeIn; // 2a, 2b
uniform float u_holdB,u_xfadeHigh,u_pause2,u_xfadeBack,u_loopGap,u_loop;
uniform float u_outGamma,u_outClamp;

// ---- 工具 ----
float easeCos(float x){ x=clamp(x,0.0,1.0); return 0.5-0.5*cos(3.14159265*x); }
float Luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3  toLin(vec3 c){ return pow(c, vec3(2.2)); }
vec3  toSRGB(vec3 c){ return pow(max(c,0.0), vec3(1.0/2.2)); }
vec3  desat(vec3 c,float s){ vec3 g=vec3(Luma(c)); return mix(g,c,clamp(s,0.0,1.0)); }
vec3  contrast(vec3 c,float f){ vec3 mid=vec3(0.5); return (c-mid)*f+mid; }
vec3  softGain(vec3 h,float g){ float k=0.6; vec3 nh=h/(abs(h)+k); return 1.0+g*nh; }

vec3 gaussian9(sampler2D t, vec2 uv, vec2 px, float s){
    if(s<=0.001) return toLin(texture2D(t,uv).rgb);
    vec2 o1=px*1.3846*s/2.0, o2=px*3.2307*s/2.0;
    vec3 c=toLin(texture2D(t,uv).rgb)*0.227;
    c+=toLin(texture2D(t,uv+vec2(o1.x,0)).rgb)*0.316;
    c+=toLin(texture2D(t,uv-vec2(o1.x,0)).rgb)*0.316;
    c+=toLin(texture2D(t,uv+vec2(0,o1.y)).rgb)*0.316;
    c+=toLin(texture2D(t,uv-vec2(0,o1.y)).rgb)*0.316;
    c+=toLin(texture2D(t,uv+vec2(o2.x,0)).rgb)*0.070;
    c+=toLin(texture2D(t,uv-vec2(o2.x,0)).rgb)*0.070;
    c+=toLin(texture2D(t,uv+vec2(0,o2.y)).rgb)*0.070;
    c+=toLin(texture2D(t,uv-vec2(0,o2.y)).rgb)*0.070;
    return c;
}
vec3 highpass(sampler2D t, vec2 uv, vec2 px, float s){
    vec3 b=toLin(texture2D(t,uv).rgb);
    vec3 l=gaussian9(t,uv,px,s);
    return b-l;
}

// ---- 時間鍵 ----
struct K { float kLow1; float k2a; float k2b; float kHigh; float kBack; };
K timeline(float t){
    float holdA=u_holdA, xfLow=u_xfadeLow, p1=u_pause1, xf2a=u_xfadeFadeOut, xf2b=u_xfadeFadeIn;
    float holdB=u_holdB, xfHigh=u_xfadeHigh, p2=u_pause2, xfBack=u_xfadeBack, gap=u_loopGap;
    float T=holdA+xfLow+p1+xf2a+xf2b+holdB+xfHigh+p2+xfBack+gap;
    if(u_loop>0.5) t=mod(t,T); else t=min(t,T);
    K k=K(0.0,0.0,0.0,0.0,0.0);
    if(t<holdA) return k; t-=holdA;
    if(t<xfLow){ k.kLow1=easeCos(t/xfLow); return k; } t-=xfLow;
    if(t<p1){ k.kLow1=1.0; return k; } t-=p1;
    if(t<xf2a){ k.kLow1=1.0; k.k2a=easeCos(t/xf2a); return k; } t-=xf2a;
    if(t<xf2b){ k.kLow1=1.0; k.k2a=1.0; k.k2b=easeCos(t/xf2b); return k; } t-=xf2b;
    if(t<holdB){ k.kLow1=1.0; k.k2a=1.0; k.k2b=1.0; return k; } t-=holdB;
    if(t<xfHigh){ k.kLow1=1.0; k.k2a=1.0; k.k2b=1.0; k.kHigh=easeCos(t/xfHigh); return k; } t-=xfHigh;
    if(t<p2){ k.kLow1=1.0; k.k2a=1.0; k.k2b=1.0; k.kHigh=1.0; return k; } t-=p2;
    if(t<xfBack){ k.kLow1=1.0; k.k2a=1.0; k.k2b=1.0; k.kHigh=1.0; k.kBack=easeCos(t/xfBack); return k; }
    k.kLow1=k.k2a=k.k2b=k.kHigh=k.kBack=1.0; return k;
}

// ---- 主程式 ----
void main(){
    vec2 uv=gl_FragCoord.xy/u_resolution.xy;
    vec2 aspect=vec2(u_resolution.x/u_resolution.y,1.0);
    vec2 fitUV=(uv-0.5)/vec2(max(aspect.x,1.0),1.0)+0.5;
    vec2 px=1.0/u_resolution.xy;

    // 基底取樣
    vec3 lowWave1   = gaussian9(u_tex0,fitUV,px,u_lowSigmaA);            // 海浪1 低頻
    lowWave1        = contrast(desat(lowWave1,u_satLowA),u_contrastLowA); // A段：海色淡化
    vec3 highRice   = highpass (u_tex1,fitUV,px,u_highSigmaA);           // 稻浪 高頻
    vec3 lowMeadow  = gaussian9(u_tex3,fitUV,px,u_lowSigmaA);            // 芒花 低頻
    vec3 highMeadow = highpass (u_tex3,fitUV,px,u_highSigmaB);           // 芒花 高頻
    vec3 lowWave2   = gaussian9(u_tex2,fitUV,px,u_lowSigmaB);            // 海浪2 低頻
    vec3 highWave2  = highpass (u_tex2,fitUV,px,u_highSigmaB);           // 海浪2 高頻
    vec3 highWave1  = highpass (u_tex0,fitUV,px,u_highSigmaA);           // 海浪1 高頻

    K k = timeline(u_time);

    // --- Stage 1：只換低頻（海浪1 → 芒花） ---
    vec3 lowNow  = mix(lowWave1, lowMeadow, k.kLow1);
    vec3 highNow = highRice;

    // --- Stage 2a（依你的更正）：高頻 稻浪→芒花；低頻 芒花→海浪2 ---
    highNow = mix(highNow, highMeadow, k.k2a);      // 稻浪 → 芒花
    lowNow  = mix(lowNow,  lowWave2,   k.k2a);      // 芒花 → 海浪2

    // --- Stage 2b：細緩收尾（靠攏 B 狀態；可視為進一步穩定）---
    highNow = mix(highNow, highMeadow, k.k2b);      // 維持芒花（B 的高頻）
    lowNow  = mix(lowNow,  lowWave2,   k.k2b);      // 穩定在海浪2（B 的低頻）

    // --- B：完成，接著 Stage 3 回返（高→海浪1；最後回到稻浪×海浪1）---
    highNow = mix(highNow, highWave1, k.kHigh);     // 芒花 → 海浪1（回返過程）
    lowNow  = mix(lowNow,  lowWave1, k.kBack);      // 海浪2 → 海浪1（回返）
    highNow = mix(highNow, highRice,  k.kBack);     // 海浪1 → 稻浪（回到 A）

    // 合成（乘性高頻增益）
    float gNow = mix(u_highGainA, u_highGainB, k.k2b);
    vec3 colorLin = lowNow * softGain(highNow, gNow);

    vec3 outSRGB = toSRGB(colorLin);
    if(u_outClamp>0.5) outSRGB = clamp(outSRGB, 0.0, 1.0);
    gl_FragColor = vec4(outSRGB, 1.0);
}
