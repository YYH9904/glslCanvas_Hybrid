#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  u_resolution;
uniform float u_time;
uniform sampler2D u_tex0;
uniform sampler2D u_tex1;
uniform sampler2D u_tex2;

// Tunables
const float BLUR_LOW  = 4.0;
const float BLUR_HP   = 3.0;
const float LOW_GAIN  = 1.00;
const float HIGH_GAIN = 1.15;

// sRGB <-> linear
vec3 srgb_to_linear(vec3 s) { return pow(s, vec3(2.2)); }
vec3 linear_to_srgb(vec3 l) { return pow(l, vec3(1.0/2.2)); }

// 9-tap approximate Gaussian blur in screen pixel units
vec3 blur9_rgb(sampler2D tex, vec2 uv, float radius_px){
    vec2 px = radius_px / u_resolution;
    float w0 = 0.227027;
    float w1 = 0.194594;
    float w2 = 0.121621;
    float w3 = 0.054054;
    float w4 = 0.016216;

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

// Decompose one texture into low/high in linear space
void decomposeLH(sampler2D tex, vec2 uv, out vec3 lowL, out vec3 highL){
    vec3 src_srgb = texture2D(tex, uv).rgb;
    vec3 lp_low_srgb = blur9_rgb(tex, uv, BLUR_LOW);
    vec3 lp_hp_srgb  = blur9_rgb(tex, uv, BLUR_HP);

    vec3 src = srgb_to_linear(src_srgb);
    vec3 lpL = srgb_to_linear(lp_low_srgb);
    vec3 lpH = srgb_to_linear(lp_hp_srgb);

    lowL  = lpL;          // low frequency (bigger radius)
    highL = src - lpH;    // high frequency = original - small-radius lowpass
}

void main(){
    vec2 uv = gl_FragCoord.xy / u_resolution;

    // Low/high for 3 frames
    vec3 l0,h0,l1,h1,l2,h2;
    decomposeLH(u_tex0, uv, l0,h0);
    decomposeLH(u_tex1, uv, l1,h1);
    decomposeLH(u_tex2, uv, l2,h2);

    // Low frequency average (stable structure)
    vec3 lowAvg = (l0 + l1 + l2) / 3.0;

    // High frequency "time resonance"
    float w0 = 0.34 + 0.06 * sin(u_time * 0.90 + 0.0);
    float w1 = 0.33 + 0.06 * sin(u_time * 0.90 + 2.1);
    float w2 = 0.33 + 0.06 * sin(u_time * 0.90 + 4.2);
    float wn = w0 + w1 + w2;
    w0 /= wn; w1 /= wn; w2 /= wn;
    vec3 hiMix = h0*w0 + h1*w1 + h2*w2;

    vec3 linearCol = LOW_GAIN * lowAvg + HIGH_GAIN * hiMix;
    gl_FragColor = vec4(linear_to_srgb(linearCol), 1.0);
}
