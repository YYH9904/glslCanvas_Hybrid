#ifdef GL_ES
precision highp float;
#endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_tintWarm;    // ← 新增：控制滑鼠區域暖色程度 (0.0~1.0)
uniform sampler2D u_tex0;    // Waves（低頻）
uniform sampler2D u_tex1;    // Rice（高頻）
varying vec2 v_texcoord;

// ---- Gamma ----
vec3  toLinear(vec3 c){ return pow(clamp(c,0.0,1.0), vec3(2.2)); }
vec3  toSRGB  (vec3 c){ return pow(clamp(c,0.0,1.0), vec3(1.0/2.2)); }
float luminance(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }

// ---- Gaussian ----
vec3 gauss2D_rgb(sampler2D tex, vec2 uv, float sigma){
    vec3 acc = vec3(0.0); float wsum = 0.0;
    for (int ix=-8; ix<=8; ix++){
        for (int iy=-8; iy<=8; iy++){
            vec2 o = vec2(float(ix),float(iy));
            float w = exp(-dot(o,o)/(2.0*sigma*sigma));
            acc += toLinear(texture2D(tex, uv + o/u_resolution).rgb)*w;
            wsum+=w;
        }
    }
    return acc/max(wsum,1e-6);
}
float gauss2D_lum(sampler2D tex, vec2 uv, float sigma){
    float acc=0.0,wsum=0.0;
    for(int ix=-8; ix<=8; ix++){
        for(int iy=-8; iy<=8; iy++){
            vec2 o=vec2(float(ix),float(iy));
            float w=exp(-dot(o,o)/(2.0*sigma*sigma));
            vec3 rgb=toLinear(texture2D(tex,uv+o/u_resolution).rgb);
            acc+=luminance(rgb)*w;wsum+=w;
        }
    }
    return acc/max(wsum,1e-6);
}

// ---- 滑鼠 UV 自動偵測 ----
vec2 getMouseUV(vec2 m, vec2 res){
    if(m.x<=0.0 && m.y<=0.0) return vec2(0.5,0.5);
    vec2 uv=(max(m.x,m.y)>2.0)?(m/res):m;
    // ✳️ Y 軸翻轉，讓滑鼠區域正確對齊（防右下偏）
    uv.y = 1.0 - uv.y;
    return clamp(uv,0.0,1.0);
}

void main(){
    vec2 uv=v_texcoord;
    vec2 mp=getMouseUV(u_mouse,u_resolution);

    // ---- 可調參數 ----
    const float RADIUS=0.50;
    const float EDGE=0.25;
    const float WEIGHT_EXP=2.0;
    const float SIGMA_LOW=18.0;
    const float SIGMA_HIGH=1.2;

    // ---- 滑鼠權重 ----
    float d=distance(uv,mp);
    float w=1.0 - smoothstep(RADIUS-EDGE,RADIUS,d);
    w=smoothstep(0.0,1.0,w);
    float nearWeight=pow(w,WEIGHT_EXP);

    // ---- 海：自然藍綠底 ----
    vec3 sea=gauss2D_rgb(u_tex0,uv,SIGMA_LOW);
    sea=(sea-0.5)*1.03+0.50;
    sea=clamp(sea,0.0,1.0);

    // ---- 稻：高頻亮度 ----
    float riceLum=luminance(toLinear(texture2D(u_tex1,uv).rgb));
    float riceBlur=gauss2D_lum(u_tex1,uv,SIGMA_HIGH);
    float riceHigh=max(riceLum-riceBlur,0.0);
    riceHigh*=mix(1.8,3.0,nearWeight);

    // ---- 混色 ----
    // 暖色控制量：0 → 無色偏，1 → 顯著稻色
    vec3 tint = mix(vec3(1.0), vec3(1.08,1.00,0.93), nearWeight * clamp(u_tintWarm, 0.0, 1.0));
    vec3 detail = sea * tint + vec3(riceHigh)*0.8;
    vec3 hybrid = mix(sea, detail, nearWeight);

    gl_FragColor = vec4(toSRGB(clamp(hybrid,0.0,1.0)),1.0);
}





