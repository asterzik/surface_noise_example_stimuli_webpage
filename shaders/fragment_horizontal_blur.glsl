#version 300 es
precision highp float;
in vec2 v_uv;
out float outResult;
uniform sampler2D u_aoTex;
uniform vec2 u_texelSize;

const float kernel[5] =
    float[](0.05448868, 0.24420134, 0.40261995, 0.24420134, 0.05448868);

void main() {
  float result = 0.0;
  for (int i = -2; i <= 2; i++) {
    vec2 offset = vec2(float(i) * u_texelSize.x, 0.0);
    result += texture(u_aoTex, v_uv + offset).r * kernel[i + 2];
  }
  outResult = result;
}