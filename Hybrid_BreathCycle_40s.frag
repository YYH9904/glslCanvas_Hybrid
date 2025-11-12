#ifdef GL_ES
precision mediump float;
#endif

// === 基本輸入 ===
uniform vec2  u_resolution;
uniform float u_time;

// 素材貼圖
uniform sampler2D u_tex0; // Waves v2 (海浪1)
uniform sampler2D u_tex1; // Rice v3  (稻浪)
uniform sampler2D u_tex2; // SND      (海浪2)
uniform sampler2D u_tex3; // Meadow   (芒花)

// 混合參數
uniform float u_lowSigmaA, u_highSigmaA;
uniform float u_lowSigmaB, u_highSigmaB;
uniform float u_highGainA, u_highGainB;
uniform float u_satLowA, u_contrastLowA;
uniform float u_outGamma, u_outClamp;
uniform float u_timeScale; // 速度倍率（1.0 = 45秒）

// === 基本工具 ===
float easeCos(float x){x=clamp(x,0.0,1.0);return 0.5-0.5*cos(3.14159265*x);}
float Luma(vec3 c){return dot(c,vec3(0.2126,0.7152,0.0722));}
vec3 toLin(vec3 c){return pow(c,vec3(2.2));}
vec3 toSRGB(vec3 c){return pow(max(c,0.0),vec3(1.0/2.2));}
vec3 desat(vec3 c,float s){vec3 g=vec3(Luma(c));return mix(g,c,clamp(s,0.0,1.0));}
vec3 contrast(vec3 c,float f){vec3 mid=vec3(0.5);return (c-mid)*f+mid;}

// 高斯模糊（低頻）
vec3 gaussian9(sampler2D t, vec2 uv, vec2 px, float s){
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

// 高頻（亮度高通）
float highpassLuma(sampler2D t, vec2 uv, vec2 px, float s){
    vec3 b=toLin(texture2D(t,uv).rgb);
    vec3 l=gaussian9(t,uv,px,s);
    return Luma(b)-Luma(l);
}

// === 時間鍵 (45秒循環：20去 + 5停 + 20回) ===
struct Keys {float k1; float k2; float k3; float k4;};
Keys timeline(float t){
    t = mod(t,45.0);
    Keys k = Keys(0.,0.,0.,0.);
    // 去程 (A→B)
    if(t<3.0) return k;                                         // A穩定 0–3s
    if(t<10.0){k.k1=easeCos((t-3.0)/7.0);return k;}             // 低頻轉換 3–10s
    if(t<20.0){k.k1=1.0;k.k2=easeCos((t-10.0)/10.0);return k;}  // 雙向交錯 10–20s
    // B 停留 20–25s（不動）
    if(t<25.0){k.k1=1.0;k.k2=1.0;return k;}
    // 回程 (B→A)
    if(t<35.0){k.k3=easeCos((t-25.0)/10.0);return k;}           // 回：海浪2→芒花 25–35s
    if(t<45.0){k.k3=1.0;k.k4=easeCos((t-35.0)/10.0);return k;}  // 回：芒花→海浪1/稻浪 35–45s
    k.k1=k.k2=k.k3=k.k4=1.0;
    return k;
}

// === 主程式 ===
void main(){
    float scale = (u_timeScale==0.0)?1.0:u_timeScale;
    float t = u_time * scale;
    Keys k = timeline(t);

    vec2 uv = gl_FragCoord.xy/u_resolution.xy;
    vec2 aspect = vec2(u_resolution.x/u_resolution.y,1.0);
    vec2 fitUV = (uv-0.5)/vec2(max(aspect.x,1.0),1.0)+0.5;
    vec2 px = 1.0/u_resolution.xy;

    // === 低頻取樣 ===
    vec3 lowWave1  = gaussian9(u_tex0, fitUV, px, u_lowSigmaA); // 海浪1
    vec3 lowMeadow = gaussian9(u_tex3, fitUV, px, u_lowSigmaA); // 芒花
    vec3 lowWave2  = gaussian9(u_tex2, fitUV, px, u_lowSigmaB); // 海浪2

    // === 高頻取樣（亮度） ===
    float hRiceL   = highpassLuma(u_tex1, fitUV, px, u_highSigmaA); // 稻浪
    float hMeadowL = highpassLuma(u_tex3, fitUV, px, u_highSigmaB); // 芒花

    // ======================================
    // 🌾 Stage A：起點（海浪1 × 稻浪）
    // ======================================
    vec3  lowNow   = lowWave1;
    float highNowL = hRiceL;

    // ======================================
    // 🌬️ Stage 1：低頻轉換（海浪1 → 芒花）
    // ======================================
    lowNow = mix(lowWave1, lowMeadow, k.k1);
    highNowL = hRiceL;

    // ======================================
    // 🌫️ Stage 2：雙向交錯（低：芒花→海浪2、高：稻浪→芒花）
    // ======================================
    lowNow   = mix(lowMeadow, lowWave2, k.k2);
    highNowL = mix(hRiceL, hMeadowL, k.k2);

    // ======================================
    // 🌊 Stage B：停留（海浪2 × 芒花）
    // ======================================
    // 20–25s 無變化，自然維持 k2=1 狀態

    // ======================================
    // 🍃 Stage Return 1：低頻回程（海浪2 → 芒花）
    // ======================================
    lowNow = mix(lowWave2, lowMeadow, k.k3);
    // 高頻維持芒花

    // ======================================
    // 🌾 Stage Return 2：高頻回程（芒花 → 稻浪，低頻：芒花 → 海浪1）
    // ======================================
    lowNow   = mix(lowMeadow, lowWave1, k.k4);
    highNowL = mix(hMeadowL, hRiceL, k.k4);

    // === Hybrid 混合（亮度域）===
    float gNow = mix(u_highGainA, u_highGainB, k.k2);
    vec3 colorLin = lowNow * (1.0 + gNow * (highNowL / (abs(highNowL)+0.6)));
    vec3 outSRGB = toSRGB(colorLin);
    if(u_outClamp>0.5) outSRGB = clamp(outSRGB,0.0,1.0);
    gl_FragColor = vec4(outSRGB,1.0);
}
