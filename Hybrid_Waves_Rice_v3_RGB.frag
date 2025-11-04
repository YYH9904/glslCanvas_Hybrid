#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D u_tex0; // 低頻海浪
uniform sampler2D u_tex1; // 高頻稻田
uniform vec2 u_resolution;
uniform float u_time;

// 新增兩個控制參數
uniform float u_detailGain; // 稻田細節強度
uniform float u_mixRatio;   // 稻田色彩混合比例

// ---------- 函數 ----------
vec3 toLinear(vec3 c) {
  return pow(c, vec3(2.2));
}

vec3 toSRGB(vec3 c) {
  return pow(c, vec3(1.0/2.2));
}

vec3 gaussianBlur(sampler2D tex, vec2 uv, float radius) {
  vec2 texel = 1.0 / u_resolution;
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int x = -4; x <= 4; x++) {
    for (int y = -4; y <= 4; y++) {
      float w = exp(-(float(x*x + y*y)) / (2.0 * radius * radius));
      sum += texture2D(tex, uv + vec2(x,y)*texel).rgb * w;
      total += w;
    }
  }
  return sum / total;
}

// ---------- 主程式 ----------
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;

  // 讀取原始顏色
  vec3 seaColor = toLinear(texture2D(u_tex0, uv).rgb);
  vec3 riceColor = toLinear(texture2D(u_tex1, uv).rgb);

  // 低頻：模糊海浪
  vec3 seaBlur = gaussianBlur(u_tex0, uv, 6.0);

  // 高頻：稻田 - 模糊稻田
  vec3 riceBlur = gaussianBlur(u_tex1, uv, 3.0);
  vec3 riceHigh = riceColor - riceBlur;

  // 混合：控制色彩比例與細節強度
  vec3 hybrid = mix(seaBlur, riceColor, u_mixRatio) + riceHigh * u_detailGain;

  // Gamma 校正與截取
  hybrid = clamp(toSRGB(hybrid), 0.0, 1.0);

  gl_FragColor = vec4(hybrid, 1.0);
}

