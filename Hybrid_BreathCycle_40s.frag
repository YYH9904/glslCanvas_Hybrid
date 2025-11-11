#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0; // Waves v2 (海浪1)
uniform sampler2D u_tex1; // Rice v3  (稻浪)
uniform sampler2D u_tex2; // SND      (海浪2)
uniform sampler2D u_tex3; // Meadow   (芒花)

// ---- Hybrid 參數 ----
uniform float u_lowSigmaA,u_highSigmaA,u_lowSigmaB,u_highSigmaB;
uniform float u_highGainA,u_highGainB;
uniform float u_satLowA,u_contrastLowA;
uniform float u_outGamma,u_outClamp;

// ---- 時間控制（固定40s結構） ----
uniform float u_timeScale; // 可微調播放速度 (預設=1.0)

// ---- 工具 ----
float easeCos(float x){x=clamp(x,0.0,1.0);return 0.5-0.5*cos(3.14159265*x);}
float Luma(vec3 c){return dot(c, vec3(0.2126,0.7152,0.0722));}
vec3 toLin(vec3 c){return pow(c, vec3(2.2));}
vec3 toSRGB(vec3 c){return pow(max(c,0.0), vec3(1.0/2.2));}
vec3 desat(vec3 c,float s){vec3 g=vec3(Luma(c));return mix(g,c,clamp(s,0.0,1.0));}
vec3 contrast(vec3 c,float f){vec3 mid=vec3(0.5);return (c-mid)*f+mid;}
vec3 softGain(vec3 h,float g){float k=0.6;vec3 nh=h/(abs(h)+k);return 1.0+g*nh;}

vec3 gaussian9(sampler2D t,vec2 uv,vec2 px,float s){
    if(s<=0.001)return toLin(texture2D(t,uv).rgb);
    vec2 o1=px*1.3846*s/2.0,o2=px*3.2307*s/2.0;
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
float highpassLuma(sampler2D t,vec2 uv,vec2 px,float s){
    vec3 b=toLin(texture2D(t,uv).rgb);
    vec3 l=gaussian9(t,uv,px,s);
    return Luma(b) - Luma(l);
}

// ---- 時間節點 (固定 40s) ----
struct MixKey{float k1;float k2;float k3;float k4;};
MixKey timeline(float t){
    float total=40.0;
    t=mod(t,total);
    MixKey k=MixKey(0.,0.,0.,0.);
    // A(0-3)固定
    if(t<3.0) return k; t-=3.0;
    // 1 (低頻呼吸, 7s)
    if(t<7.0){k.k1=easeCos(t/7.0);return k;} t-=7.0;
    // 2 (雙向交錯, 10s)
    if(t<10.0){k.k1=1.;k.k2=easeCos(t/10.0);return k;} t-=10.0;
    // B (穩定3s)
    if(t<3.0){k.k1=1.;k.k2=1.;return k;} t-=3.0;
    // 3 (回返鏡像,17s)
    if(t<17.0){k.k1=1.;k.k2=1.;k.k3=easeCos(t/17.0);return k;}
    k.k1=k.k2=k.k3=1.;
    return k;
}

// ---- 主程式 ----
void main(){
    float t = u_time * ((u_timeScale==0.0)?1.0:u_timeScale);
    MixKey k = timeline(t);

    vec2 uv=gl_FragCoord.xy/u_resolution.xy;
    vec2 aspect=vec2(u_resolution.x/u_resolution.y,1.0);
    vec2 fitUV=(uv-0.5)/vec2(max(aspect.x,1.0),1.0)+0.5;
    vec2 px=1.0/u_resolution.xy;

    // --- 基礎取樣 ---
    vec3 lowWave1   = gaussian9(u_tex0,fitUV,px,u_lowSigmaA);
    lowWave1        = contrast(desat(lowWave1,u_satLowA),u_contrastLowA);
    vec3 highRice   = toLin(texture2D(u_tex1,fitUV).rgb);
    vec3 lowMeadow  = gaussian9(u_tex3,fitUV,px,u_lowSigmaA);
    vec3 highMeadow = toLin(texture2D(u_tex3,fitUV).rgb);
    vec3 lowWave2   = gaussian9(u_tex2,fitUV,px,u_lowSigmaB);
    vec3 highWave2  = toLin(texture2D(u_tex2,fitUV).rgb);

    // 亮度高通 (Hybrid 專用)
    float hRiceL   = highpassLuma(u_tex1,fitUV,px,u_highSigmaA);
    float hMeadowL = highpassLuma(u_tex3,fitUV,px,u_highSigmaB);

    // ---- Stage A：起始 (海浪1×稻浪) ----
    vec3 lowNow  = lowWave1;
    float highNowL = hRiceL;

    // ---- Stage 1：低頻呼吸 (海浪1→芒花, 高頻維持稻浪) ----
    lowNow  = mix(lowWave1, lowMeadow, k.k1);
    highNowL = hRiceL;

    // ---- Stage 2：雙向交錯 (低:芒花→海浪2 / 高:稻浪→芒花) ----
    lowNow  = mix(lowMeadow, lowWave2, k.k2);
    highNowL = mix(hRiceL, hMeadowL, k.k2);

    // ---- Stage 3 (鏡像回返, 高頻回稻浪, 低頻回海浪1) ----
    lowNow  = mix(lowWave2, lowWave1, k.k3);
    highNowL = mix(hMeadowL, hRiceL, k.k3);

    // ---- 混合 (Hybrid_Luminance) ----
    float gainA = u_highGainA;
    float gainB = u_highGainB;
    float gNow = mix(gainA,gainB,k.k2);

    vec3 colorLin = lowNow * (1.0 + gNow * highNowL);

    // ---- 輸出 ----
    vec3 outSRGB = toSRGB(colorLin);
    if(u_outClamp>0.5) outSRGB = clamp(outSRGB,0.0,1.0);
    gl_FragColor = vec4(outSRGB,1.0);
}
