#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

const vec3 OBJECT_COLOR = vec3(0.79); // gamma corrected 0.9

uniform sampler2D u_diffuseTex;
uniform sampler2D u_aoTex;
uniform sampler2D u_hitTex;

void main() {
  vec3 color = vec3(0.029); // gamma corrected 0.2
  float diffuse = texture(u_diffuseTex, v_uv).r;
  float ao = texture(u_aoTex, v_uv).r;
  float hit = texture(u_hitTex, v_uv).r;

  if (hit > 0.5) {
    color = diffuse * 0.8 * OBJECT_COLOR + 0.2 * ao * OBJECT_COLOR;
  }
  // gamma
  color = pow(color, vec3(0.4545));

  fragColor = vec4(vec3(color), 1.0);
}
